import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { HttpSpaceBackend } from '../src/index';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 2, title: 'One', routes: [] },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};

const backendFor = (response: Response): HttpSpaceBackend =>
  new HttpSpaceBackend('/api/spaces', { fetch: () => Promise.resolve(response) });

const startStalledResponseServer = async (status: number, retryAfter: string) => {
  let reportHeadersSent: (() => void) | undefined;
  const headersSent = new Promise<void>((resolve) => {
    reportHeadersSent = resolve;
  });
  const server = createServer((_request, response) => {
    response.writeHead(status, {
      'content-type': 'application/json',
      'Retry-After': retryAfter,
    });
    response.write('{"message":"Still working"');
    reportHeadersSent?.();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected TCP address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    headersSent,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
};

describe('HttpSpaceBackend failure classification', () => {
  const permanent = [
    [400, 'protocol'],
    [401, 'forbidden'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [422, 'invalid-snapshot'],
  ] as const;

  for (const [status, code] of permanent) {
    it(`maps ${status} to permanent ${code}`, async () => {
      await expect(
        backendFor(new Response(JSON.stringify({ message: 'Denied' }), { status })).commitSpace(
          snapshot,
          0n,
        ),
      ).resolves.toEqual({ kind: 'permanent-failure', code, message: 'Denied' });
    });
  }

  const retryable = [
    [408, 'timeout', 'Request timed out'],
    [429, 'rate-limited', 'Rate limited'],
    [500, 'unavailable', 'Persistence service unavailable'],
    [503, 'unavailable', 'Persistence service unavailable'],
  ] as const;
  const malformedBodies = ['', '<html>broken</html>', '{', JSON.stringify({ nope: true })];

  for (const [status, code, fallback] of retryable) {
    for (const body of malformedBodies) {
      it(`maps ${status} to retryable ${code} before parsing ${JSON.stringify(body)}`, async () => {
        await expect(
          backendFor(new Response(body, { status })).commitSpace(snapshot, 0n),
        ).resolves.toEqual({
          kind: 'retryable-failure',
          code,
          message: fallback,
        });
      });
    }
  }

  it('uses a valid retryable error message and Retry-After seconds', async () => {
    await expect(
      backendFor(
        new Response(JSON.stringify({ message: 'Try later' }), {
          status: 429,
          headers: { 'Retry-After': '2' },
        }),
      ).commitSpace(snapshot, 0n),
    ).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'rate-limited',
      message: 'Try later',
      retryAfterMs: 2000,
    });
  });

  it('honours Retry-After on an unavailable response', async () => {
    for (const status of [500, 503]) {
      await expect(
        backendFor(
          new Response(JSON.stringify({ message: 'Down for maintenance' }), {
            status,
            headers: { 'Retry-After': '30' },
          }),
        ).commitSpace(snapshot, 0n),
      ).resolves.toEqual({
        kind: 'retryable-failure',
        code: 'unavailable',
        message: 'Down for maintenance',
        retryAfterMs: 30_000,
      });
    }
  });

  it('omits Retry-After when a retryable response does not send one', async () => {
    await expect(
      backendFor(new Response(JSON.stringify({ message: 'Down' }), { status: 503 })).commitSpace(
        snapshot,
        0n,
      ),
    ).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'unavailable',
      message: 'Down',
    });
  });

  it('omits an unusable Retry-After rather than deriving a delay from it', async () => {
    // The last case is why the header shares `CANONICAL_DECIMAL` with revision
    // decoding: an arbitrarily long digit string is work `BigInt` has to do
    // before any range check can reject what it produced.
    const unusable = ['soon', '-1', '01', '1.5', '9'.repeat(19), '9'.repeat(4096)];
    for (const value of unusable) {
      await expect(
        backendFor(
          new Response(JSON.stringify({ message: 'Down' }), {
            status: 503,
            headers: { 'Retry-After': value },
          }),
        ).commitSpace(snapshot, 0n),
      ).resolves.toEqual({ kind: 'retryable-failure', code: 'unavailable', message: 'Down' });
    }
  });

  it('rejects malformed success and conflict bodies as permanent protocol failures', async () => {
    for (const status of [200, 409]) {
      await expect(
        backendFor(new Response(JSON.stringify({ revision: 4 }), { status })).commitSpace(
          snapshot,
          0n,
        ),
      ).resolves.toMatchObject({ kind: 'permanent-failure', code: 'protocol' });
    }
  });

  it('maps unexpected client errors to permanent protocol failures', async () => {
    await expect(
      backendFor(new Response(JSON.stringify({ message: 'Teapot' }), { status: 418 })).commitSpace(
        snapshot,
        0n,
      ),
    ).resolves.toEqual({ kind: 'permanent-failure', code: 'protocol', message: 'Teapot' });
  });

  it('maps Fetch rejection to a retryable network failure', async () => {
    const backend = new HttpSpaceBackend('/api/spaces', {
      fetch: () => Promise.reject(new Error('offline')),
    });
    await expect(backend.commitSpace(snapshot, 0n)).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'network',
      message: 'offline',
    });
  });

  it('reports a descriptive message when a read times out', async () => {
    const backend = new HttpSpaceBackend('/api/spaces', {
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    await expect(backend.listSpaces()).rejects.toThrow('Request timed out');
    await expect(backend.loadSpace(SPACE_ID)).rejects.toThrow('Request timed out');
  });

  it('applies its timeout to a caller-provided Fetch', async () => {
    const backend = new HttpSpaceBackend('/api/spaces', {
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    await expect(backend.commitSpace(snapshot, 0n)).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'timeout',
      message: 'Request timed out',
    });
  });

  /**
   * Headers arriving is not the request completing. A body that stalls after a
   * prompt status line hangs the read for as long as the peer holds it open, so
   * the timeout has to stay armed until the body has been decoded — exactly as
   * a real Fetch ties its signal to the response stream.
   */
  const stalledBodyFetch =
    (status: number): typeof globalThis.fetch =>
    (_input, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener('abort', () => {
                controller.error(new Error('aborted'));
              });
            },
          }),
          { status, headers: { 'content-type': 'application/json' } },
        ),
      );

  it('times out a read whose body stalls after the status line', async () => {
    const backend = new HttpSpaceBackend('/api/spaces', {
      timeoutMs: 5,
      fetch: stalledBodyFetch(200),
    });
    await expect(backend.listSpaces()).rejects.toThrow('Request timed out');
    await expect(backend.loadSpace(SPACE_ID)).rejects.toThrow('Request timed out');
  }, 1000);

  it('reports a commit whose body stalls after the status line as a retryable timeout', async () => {
    const backend = new HttpSpaceBackend('/api/spaces', {
      timeoutMs: 5,
      fetch: stalledBodyFetch(200),
    });
    await expect(backend.commitSpace(snapshot, 0n)).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'timeout',
      message: 'Request timed out',
    });
  }, 1000);

  it('reports a rate-limited response whose body stalls as a timeout without Retry-After', async () => {
    const server = await startStalledResponseServer(429, '60');
    try {
      const backend = new HttpSpaceBackend(`${server.url}/api/spaces`, { timeoutMs: 100 });
      const result = backend.commitSpace(snapshot, 0n);
      await server.headersSent;
      await expect(result).resolves.toEqual({
        kind: 'retryable-failure',
        code: 'timeout',
        message: 'Request timed out',
      });
    } finally {
      await server.close();
    }
  }, 1000);

  it('reports an unavailable response whose body stalls as a timeout without Retry-After', async () => {
    const server = await startStalledResponseServer(503, '30');
    try {
      const backend = new HttpSpaceBackend(`${server.url}/api/spaces`, { timeoutMs: 100 });
      const result = backend.commitSpace(snapshot, 0n);
      await server.headersSent;
      await expect(result).resolves.toEqual({
        kind: 'retryable-failure',
        code: 'timeout',
        message: 'Request timed out',
      });
    } finally {
      await server.close();
    }
  }, 1000);
});
