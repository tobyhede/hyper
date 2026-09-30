import type { UUID } from '@project/core';
import {
  encodeProblemDetails,
  MAX_IMAGE_BYTES,
  type ImageId,
  type ImageStore,
  type StoredImage,
  type StoredSpaceRepository,
} from '@project/persistence';
import { describe, expect, it } from 'vitest';
import { createSpaceHttpApp, HttpSpaceBackend } from '@project/http';

/** A request that initializes no Space mints nothing, so any mint is a failure here. */
const mintsNothing = (): UUID => {
  throw new Error('This request initializes no Space, so it mints no identity.');
};

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
/** `png`'s SHA-256 as unpadded base64url, computed independently with Node's `crypto`. */
const PNG_URL = '/images/KJx3oXmDEwnD1FBZUrDl_2u5HAtMb2ip2ose1tOMXmQ';

/** The real Fetch application over an in-memory store, reached as the browser reaches it. */
const backendOverHost = (): HttpSpaceBackend => {
  const images = new Map<ImageId, StoredImage>();
  const readsSpace = () => Promise.reject(new Error('An image request read a Space'));
  const store: StoredSpaceRepository & ImageStore = {
    listSpaces: readsSpace,
    loadSpace: readsSpace,
    loadAggregate: readsSpace,
    commit: readsSpace,
    storeImage: (image) => {
      if (images.has(image.id)) return Promise.resolve('existing');
      images.set(image.id, image);
      return Promise.resolve('stored');
    },
    loadImage: (id) => Promise.resolve(images.get(id)),
  };
  const app = createSpaceHttpApp(store, { newId: mintsNothing });
  return new HttpSpaceBackend('http://example.test', {
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
};

describe('storing an image through the browser client', () => {
  it('answers the URL the host stored the image at, the first time and every time', async () => {
    const backend = backendOverHost();

    await expect(backend.storeImage(new Blob([png]))).resolves.toEqual({
      kind: 'stored',
      url: PNG_URL,
    });
    await expect(backend.storeImage(new Blob([png]))).resolves.toEqual({
      kind: 'stored',
      url: PNG_URL,
    });
  });

  it.each([
    ['image-format-unsupported', new Blob(['not a picture'])],
    ['image-svg-unsupported', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'])],
  ] as const)('answers the host refusal %s by its code', async (code, image) => {
    await expect(backendOverHost().storeImage(image)).resolves.toEqual({ kind: 'refused', code });
  });

  it('answers image-too-large for a file over the limit without sending it', async () => {
    let sent = false;
    const backend = new HttpSpaceBackend('http://example.test', {
      fetch: () => {
        sent = true;
        return Promise.reject(new Error('An oversized image was sent'));
      },
    });

    await expect(
      backend.storeImage(new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)])),
    ).resolves.toEqual({ kind: 'refused', code: 'image-too-large' });
    expect(sent).toBe(false);
  });

  it('throws on an answer that is neither a stored URL nor an image refusal', async () => {
    const body = encodeProblemDetails('internal-error', 'Broken');
    const backend = new HttpSpaceBackend('http://example.test', {
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status: body.status,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
        ),
    });

    await expect(backend.storeImage(new Blob([png]))).rejects.toThrow(/HTTP 500/u);
  });

  it('throws on a stored answer naming a URL an Image Resource may not hold', async () => {
    const backend = new HttpSpaceBackend('http://example.test', {
      fetch: () =>
        Promise.resolve(Response.json({ url: 'data:image/png;base64,AAAA' }, { status: 201 })),
    });

    await expect(backend.storeImage(new Blob([png]))).rejects.toThrow();
  });
});
