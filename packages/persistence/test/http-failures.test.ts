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
        await expect(backendFor(new Response(body, { status })).commitSpace(snapshot, 0n)).resolves.toEqual({
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

  it('rejects malformed success and conflict bodies as permanent protocol failures', async () => {
    for (const status of [200, 409]) {
      await expect(
        backendFor(new Response(JSON.stringify({ revision: 4 }), { status })).commitSpace(snapshot, 0n),
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

  it('applies its timeout to a caller-provided Fetch', async () => {
    const backend = new HttpSpaceBackend('/api/spaces', {
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    });
    await expect(backend.commitSpace(snapshot, 0n)).resolves.toEqual({
      kind: 'retryable-failure',
      code: 'timeout',
      message: 'Request timed out',
    });
  });
});
