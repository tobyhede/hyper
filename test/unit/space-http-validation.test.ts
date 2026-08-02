import {
  Agent,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { encodeCommitRequest } from '@project/persistence';
import { createSpaceHttpHandler, MAX_COMMIT_BODY_BYTES } from '../../src/http/space-http-handler';
import { E2eMemorySpaceRepository } from '../support/e2e-memory-space-repository';
import { startHttpServer } from '../support/http-server';
import { send } from '../support/raw-http-request';
import { SPACE_ID, oneCardSnapshot as snapshot } from '../support/space-fixtures';

const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
const stored = { snapshot, revision: 0n, exportedRevision: null };

const validBody = JSON.stringify(encodeCommitRequest(snapshot, 0n));
const validHeaders = { 'content-type': 'application/json; charset=utf-8' };

describe('Space HTTP request validation', () => {
  const invalidBodies: readonly [string, string, Record<string, string>][] = [
    ['missing media type', validBody, {}],
    ['wrong media type', validBody, { 'content-type': 'text/plain' }],
    ['malformed JSON', '{', validHeaders],
    ['array envelope', '[]', validHeaders],
    [
      'extra envelope key',
      JSON.stringify({ ...(encodeCommitRequest(snapshot, 0n) as object), extra: true }),
      validHeaders,
    ],
    ['invalid revision', JSON.stringify({ snapshot, expectedRevision: '01' }), validHeaders],
    [
      'schema-invalid snapshot',
      JSON.stringify({
        snapshot: { ...snapshot, document: { ...snapshot.document, title: '' } },
        expectedRevision: '0',
      }),
      validHeaders,
    ],
  ];

  for (const [name, body, headers] of invalidBodies) {
    it(`rejects ${name} before repository access`, async () => {
      const repository = new E2eMemorySpaceRepository([stored]);
      const server = await startHttpServer(createSpaceHttpHandler(repository));
      try {
        const response = await send(server.url, `/api/spaces/${SPACE_ID}`, body, headers);
        expect(response.status).toBe(400);
        expect(repository.commitAttempts).toBe(0);
      } finally {
        await server.close();
      }
    });
  }

  it('rejects invalid and mismatched path identities before repository access', async () => {
    const repository = new E2eMemorySpaceRepository([stored]);
    const server = await startHttpServer(createSpaceHttpHandler(repository));
    try {
      expect(
        (await send(server.url, '/api/spaces/not-a-uuid', validBody, validHeaders)).status,
      ).toBe(400);
      expect(
        (await send(server.url, `/api/spaces/${OTHER_ID}`, validBody, validHeaders)).status,
      ).toBe(400);
      expect(repository.commitAttempts).toBe(0);
    } finally {
      await server.close();
    }
  });

  /**
   * Both length rejections below sit under Node's own parser, which answers a
   * negative `Content-Length` with `HPE_INVALID_CONTENT_LENGTH` and a repeated
   * one with `HPE_UNEXPECTED_CONTENT_LENGTH` (RFC 9112 §6.3), never dispatching
   * either. Sending them over a socket therefore proves nothing about this
   * handler — the 400 comes from the parser. The rejections are real code that
   * a different transport would reach, so they are covered at the handler seam.
   */
  const handleHeaders = async (
    repository: E2eMemorySpaceRepository,
    headers: Record<string, string>,
    headersDistinct: Record<string, string[]> = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key, [value]]),
    ),
  ) => {
    const request = {
      method: 'PUT',
      url: `/api/spaces/${SPACE_ID}`,
      headers,
      headersDistinct,
    } as unknown as IncomingMessage;
    const captured = { statusCode: 0, body: '', headers: {} as Record<string, string> };
    const response = {
      set statusCode(value: number) {
        captured.statusCode = value;
      },
      setHeader(key: string, value: string) {
        captured.headers[key.toLowerCase()] = value;
      },
      end(chunk?: string) {
        captured.body = chunk ?? '';
      },
    } as unknown as ServerResponse;

    const handled = await createSpaceHttpHandler(repository)(request, response);
    return { handled, captured };
  };

  it('rejects a negative declared length at the handler, below the parser', async () => {
    const repository = new E2eMemorySpaceRepository([stored]);
    const { handled, captured } = await handleHeaders(repository, {
      ...validHeaders,
      'content-length': '-1',
    });

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(400);
    expect(JSON.parse(captured.body)).toEqual({
      message: `Content-Length must be canonical and at most ${MAX_COMMIT_BODY_BYTES}`,
    });
    expect(captured.headers['connection']).toBe('close');
    expect(repository.commitAttempts).toBe(0);
  });

  it('refuses a repeated declared length rather than choosing one', async () => {
    const repository = new E2eMemorySpaceRepository([stored]);
    const headers = { ...validHeaders, 'content-length': String(validBody.length) };
    const { handled, captured } = await handleHeaders(repository, headers, {
      ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, [value]])),
      // Identical values declare the same body length, so the framing is not
      // in doubt. The handler refuses anyway because it requires one canonical
      // field value, and will not pick a winner from a repeated header.
      'content-length': [String(validBody.length), String(validBody.length)],
    });

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(400);
    expect(JSON.parse(captured.body)).toEqual({
      message: `Content-Length must be canonical and at most ${MAX_COMMIT_BODY_BYTES}`,
    });
    expect(captured.headers['connection']).toBe('close');
    expect(repository.commitAttempts).toBe(0);
  });

  it('rejects noncanonical and declared oversized lengths before repository access', async () => {
    const repository = new E2eMemorySpaceRepository([stored]);
    const server = await startHttpServer(createSpaceHttpHandler(repository));
    try {
      for (const length of ['01', String(MAX_COMMIT_BODY_BYTES + 1)]) {
        const response = await send(server.url, `/api/spaces/${SPACE_ID}`, validBody, {
          ...validHeaders,
          'content-length': length,
        });
        expect(response.status).toBe(400);
      }
      expect(repository.commitAttempts).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('drains a chunked oversized body and keeps the server reusable', async () => {
    const repository = new E2eMemorySpaceRepository([stored]);
    const server = await startHttpServer(createSpaceHttpHandler(repository));
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const oversized = `{"padding":"${'x'.repeat(MAX_COMMIT_BODY_BYTES)}"}`;
      const rejected = await send(
        server.url,
        `/api/spaces/${SPACE_ID}`,
        oversized,
        { ...validHeaders, 'transfer-encoding': 'chunked' },
        agent,
      );
      expect(rejected.status).toBe(400);
      expect(JSON.parse(rejected.body)).toEqual({
        message: `Request body exceeds ${MAX_COMMIT_BODY_BYTES} bytes`,
      });
      const accepted = await send(
        server.url,
        `/api/spaces/${SPACE_ID}`,
        validBody,
        validHeaders,
        agent,
      );
      expect(accepted.status).toBe(200);
      expect(repository.commitAttempts).toBe(1);
    } finally {
      agent.destroy();
      await server.close();
    }
  });

  it('settles the body read when a client disconnects part way through one', async () => {
    // A half-sent body is the one path where nothing further arrives to end the
    // stream. If the read never settles, the handler's promise never resolves
    // and the connection's work is retained for the process's lifetime rather
    // than failing — which reads as a working server until enough of them pile
    // up. Asserting the settlement, not the status, is the point: the client is
    // already gone and will never see a response.
    const repository = new E2eMemorySpaceRepository([stored]);
    const handler = createSpaceHttpHandler(repository);
    const settled: string[] = [];
    const server = await startHttpServer(async (request, response) => {
      try {
        return await handler(request, response);
      } finally {
        settled.push(request.url ?? '');
      }
    });
    try {
      await new Promise<void>((resolve) => {
        const aborted = httpRequest(new URL(`/api/spaces/${SPACE_ID}`, server.url), {
          method: 'PUT',
          headers: { ...validHeaders, 'content-length': String(Buffer.byteLength(validBody)) },
        });
        // Destroying only once the server has the head and a first chunk leaves
        // the read waiting on bytes that never come.
        aborted.on('error', () => resolve());
        aborted.on('close', () => resolve());
        aborted.write(validBody.slice(0, 8), () => aborted.destroy());
      });
      await vi.waitFor(() => expect(settled).toEqual([`/api/spaces/${SPACE_ID}`]), {
        timeout: 2_000,
      });
      expect(repository.commitAttempts).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('closes header-rejected connections so the keep-alive agent can safely continue', async () => {
    const repository = new E2eMemorySpaceRepository([stored]);
    const server = await startHttpServer(createSpaceHttpHandler(repository));
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const rejected = await send(
        server.url,
        `/api/spaces/${SPACE_ID}`,
        validBody,
        {
          'content-type': 'text/plain',
        },
        agent,
      );
      expect(rejected.status).toBe(400);
      expect(rejected.headers.connection).toBe('close');
      const accepted = await send(
        server.url,
        `/api/spaces/${SPACE_ID}`,
        validBody,
        validHeaders,
        agent,
      );
      expect(accepted.status).toBe(200);
      expect(repository.commitAttempts).toBe(1);
    } finally {
      agent.destroy();
      await server.close();
    }
  });

  it('returns method metadata for resources and falls through unknown paths', async () => {
    const repository = new E2eMemorySpaceRepository([stored]);
    const server = await startHttpServer(createSpaceHttpHandler(repository));
    try {
      const method = await send(server.url, `/api/spaces/${SPACE_ID}`, '', {}, undefined, 'POST');
      expect(method.status).toBe(405);
      expect(method.headers.allow).toBe('GET, PUT');
      // The collection is read-only, so it advertises a narrower Allow than a
      // resource does — a PUT belongs to one space, never to the catalog.
      const collection = await send(server.url, '/api/spaces', '', {}, undefined, 'POST');
      expect(collection.status).toBe(405);
      expect(collection.headers.allow).toBe('GET');
      expect((await send(server.url, '/elsewhere', '', {}, undefined, 'GET')).status).toBe(404);
      expect(repository.commitAttempts).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('reports repository availability failures as retryable server responses', async () => {
    class UnavailableRepository extends E2eMemorySpaceRepository {
      override commitSpace(): Promise<never> {
        return Promise.reject(new Error('database unavailable'));
      }
    }
    const server = await startHttpServer(
      createSpaceHttpHandler(new UnavailableRepository([stored]), { logError: () => undefined }),
    );
    try {
      const response = await send(server.url, `/api/spaces/${SPACE_ID}`, validBody, validHeaders);
      expect(response.status).toBe(503);
      expect(JSON.parse(response.body)).toEqual({ message: 'Persistence service unavailable' });
    } finally {
      await server.close();
    }
  });

  it('logs the underlying error behind every unavailable response', async () => {
    class BrokenRepository extends E2eMemorySpaceRepository {
      override listSpaces(): Promise<never> {
        return Promise.reject(new Error('list failed'));
      }
      override loadSpace(): Promise<never> {
        return Promise.reject(new Error('load failed'));
      }
      override commitSpace(): Promise<never> {
        return Promise.reject(new Error('commit failed'));
      }
    }
    const logged: unknown[] = [];
    const server = await startHttpServer(
      createSpaceHttpHandler(new BrokenRepository([stored]), {
        logError: (_message, error) => logged.push(error),
      }),
    );
    try {
      expect((await send(server.url, '/api/spaces', '', {}, undefined, 'GET')).status).toBe(503);
      expect(
        (await send(server.url, `/api/spaces/${SPACE_ID}`, '', {}, undefined, 'GET')).status,
      ).toBe(503);
      expect(
        (await send(server.url, `/api/spaces/${SPACE_ID}`, validBody, validHeaders)).status,
      ).toBe(503);
    } finally {
      await server.close();
    }
    expect(logged.map((error) => (error as Error).message)).toEqual([
      'list failed',
      'load failed',
      'commit failed',
    ]);
  });
});
