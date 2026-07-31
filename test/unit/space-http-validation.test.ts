import { Agent, request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { encodeCommitRequest } from '@project/persistence';
import { createSpaceHttpHandler, MAX_COMMIT_BODY_BYTES } from '../../src/http/space-http-handler';
import { E2eMemorySpaceRepository } from '../support/e2e-memory-space-repository';
import { startHttpServer } from '../support/http-server';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 2, title: 'One', routes: [] },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};
const stored = { snapshot, revision: 0n, exportedRevision: null };

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

const send = (
  baseUrl: string,
  path: string,
  body: string,
  headers: Record<string, string>,
  agent?: Agent,
  method = 'PUT',
): Promise<RawResponse> =>
  new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const request = httpRequest(url, { method, headers, agent }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
    request.on('error', reject);
    request.end(body);
  });

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

  it('rejects noncanonical and declared oversized lengths before repository access', async () => {
    const repository = new E2eMemorySpaceRepository([stored]);
    const server = await startHttpServer(createSpaceHttpHandler(repository));
    try {
      for (const length of ['01', '-1', String(MAX_COMMIT_BODY_BYTES + 1)]) {
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
