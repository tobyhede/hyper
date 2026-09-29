import { describe, expect, it } from 'vitest';
import { HttpSpaceBackend } from '@project/http';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const STORED_URL = '/images/KJx3oXmDEwnD1FBZUrDl_2u5HAtMb2ip2ose1tOMXmQ';

/** A Fetch that answers a stored URL `delayMs` after it is called, unless aborted first. */
const answersAfter =
  (delayMs: number): typeof globalThis.fetch =>
  (_input, init) =>
    new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(
        () => resolve(Response.json({ url: STORED_URL }, { status: 201 })),
        delayMs,
      );
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      });
    });

/**
 * A Fetch that answers headers at once and then never sends the body. Like a
 * real Fetch, aborting the request's signal errors the body it is streaming.
 */
const stallsBody: typeof globalThis.fetch = (_input, init) => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      init?.signal?.addEventListener('abort', () => {
        controller.error(new Error('aborted'));
      });
    },
  });
  return Promise.resolve(
    new Response(body, { status: 201, headers: { 'content-type': 'application/json' } }),
  );
};

describe('the time an image upload is given', () => {
  it('is not the read timeout, so an upload slower than a read still stores', async () => {
    const backend = new HttpSpaceBackend('http://example.test', {
      timeoutMs: 5,
      fetch: answersAfter(50),
    });

    await expect(backend.storeImage(new Blob([png]))).resolves.toEqual({
      kind: 'stored',
      url: STORED_URL,
    });
  });

  it('still ends an upload the host never answers', async () => {
    const backend = new HttpSpaceBackend('http://example.test', {
      uploadTimeoutMs: 5,
      fetch: answersAfter(60_000),
    });

    await expect(backend.storeImage(new Blob([png]))).rejects.toThrow('Request timed out');
  }, 1000);

  it('still ends an upload whose answer never finishes arriving', async () => {
    const backend = new HttpSpaceBackend('http://example.test', {
      uploadTimeoutMs: 5,
      fetch: stallsBody,
    });

    await expect(backend.storeImage(new Blob([png]))).rejects.toThrow('Request timed out');
  }, 1000);
});
