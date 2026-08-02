import { Agent, type IncomingMessage, type ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { encodeCommitRequest } from '@project/persistence';
import { createSpaceHttpHandler, MAX_COMMIT_BODY_BYTES } from '../../src/http/space-http-handler';
import { E2eMemorySpaceRepository } from '../support/e2e-memory-space-repository';
import { startHttpServer } from '../support/http-server';
import { send } from '../support/raw-http-request';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 2, title: 'One', routes: [] },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};
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
   * Node's own parser answers a negative `Content-Length` with
   * `HPE_INVALID_CONTENT_LENGTH` and never dispatches, so sending one over a
   * socket proves nothing about this handler — the 400 comes from the parser.
   * The sign rejection is real code, so it is covered at the handler seam.
   */
  it('rejects a negative declared length at the handler, below the parser', async () => {
    const repository = new E2eMemorySpaceRepository([stored]);
    const headers = { ...validHeaders, 'content-length': '-1' };
    const request = {
      method: 'PUT',
      url: `/api/spaces/${SPACE_ID}`,
      headers,
      headersDistinct: Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key, [value]]),
      ),
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

    await expect(createSpaceHttpHandler(repository)(request, response)).resolves.toBe(true);

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
