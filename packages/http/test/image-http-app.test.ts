import {
  decodeProblemDetails,
  isImageId,
  MAX_IMAGE_BYTES,
  PersistenceUnavailableError,
  problemCatalogue,
  type HyperProblemCode,
  type ImageId,
  type ImageStore,
  type StoredImage,
  type StoredSpaceRepository,
} from '@project/persistence';
import { describe, expect, it, vi } from 'vitest';
import { createSpaceHttpApp } from '@project/http';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const gif = new TextEncoder().encode('GIF89a\u0001\u0000');
const webp = Uint8Array.from([
  ...new TextEncoder().encode('RIFF'),
  0x24,
  0,
  0,
  0,
  ...new TextEncoder().encode('WEBPVP8 '),
]);
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');

/** Each fixture's SHA-256 as unpadded base64url, computed independently with Node's `crypto`. */
const ID_OF = new Map<Uint8Array, string>([
  [png, 'KJx3oXmDEwnD1FBZUrDl_2u5HAtMb2ip2ose1tOMXmQ'],
  [jpeg, '_BbX3O6croPvOSMiKoHM2P6WydJf239QTWbxAR4M2HA'],
  [gif, 'p6PtpkQdE3zM75cA-jeMAJnWRxRr6RZ973Bb-Gu2NOw'],
  [webp, 'wokEl2aqsUbIIOwKOzCPR0v1Iyf2TmoksIe80m-V1KA'],
]);
const idOf = (bytes: Uint8Array): string => {
  const id = ID_OF.get(bytes);
  if (id === undefined) throw new Error('No independently computed id for these bytes');
  return id;
};

/** An id that is well formed and names nothing stored. */
const UNKNOWN_ID = 'A'.repeat(43);

/**
 * A repository whose Space members fail the test if reached — every image
 * request is answered without reading a Space — over a store holding images in
 * a `Map`.
 */
const repository = () => {
  const images = new Map<ImageId, StoredImage>();
  const readsSpace = vi.fn(() => Promise.reject(new Error('An image request read a Space')));
  const storeImage = vi.fn((image: StoredImage) => {
    if (images.has(image.id)) return Promise.resolve('existing' as const);
    images.set(image.id, image);
    return Promise.resolve('stored' as const);
  });
  const loadImage = vi.fn((id: ImageId) => Promise.resolve(images.get(id)));
  const store: StoredSpaceRepository & ImageStore = {
    listSpaces: readsSpace,
    loadSpace: readsSpace,
    loadAggregate: readsSpace,
    commit: readsSpace,
    storeImage,
    loadImage,
  };
  return { store, images, readsSpace, storeImage, loadImage };
};

const post = (app: ReturnType<typeof createSpaceHttpApp>, body: BodyInit, type = 'image/png') =>
  app.request('/images', { method: 'POST', headers: { 'Content-Type': type }, body });

const expectProblem = async (response: Response, code: HyperProblemCode) => {
  expect(response.status).toBe(problemCatalogue[code].status);
  expect(response.headers.get('content-type')).toBe('application/problem+json');
  expect(decodeProblemDetails(await response.json()).type).toBe(problemCatalogue[code].type);
};

describe('storing an image', () => {
  it.each([
    ['PNG', png, 'image/png'],
    ['JPEG', jpeg, 'image/jpeg'],
    ['GIF', gif, 'image/gif'],
    ['WebP', webp, 'image/webp'],
  ] as const)(
    'answers a stored %s at its content address, and serves it there',
    async (_, bytes, type) => {
      const { store, readsSpace } = repository();
      const app = createSpaceHttpApp(store);

      const stored = await post(app, bytes, 'application/octet-stream');

      const url = `/images/${idOf(bytes)}`;
      expect(stored.status).toBe(201);
      expect(stored.headers.get('location')).toBe(url);
      expect(stored.headers.get('content-type')).toBe('application/json; charset=utf-8');
      await expect(stored.json()).resolves.toEqual({ url });

      const served = await app.request(url);
      expect(served.status).toBe(200);
      expect(served.headers.get('content-type')).toBe(type);
      expect(served.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(served.headers.get('x-content-type-options')).toBe('nosniff');
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
      expect(readsSpace).not.toHaveBeenCalled();
    },
  );

  it('answers the same URL for the same bytes and stores them once', async () => {
    const { store, images } = repository();
    const app = createSpaceHttpApp(store);

    const first = await post(app, png);
    const second = await post(app, png);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers.get('location')).toBe(`/images/${idOf(png)}`);
    await expect(second.json()).resolves.toEqual({ url: `/images/${idOf(png)}` });
    expect(images.size).toBe(1);
  });

  it('identifies the format from the bytes, not the declared type', async () => {
    const { store } = repository();
    const app = createSpaceHttpApp(store);

    const stored = await post(app, png, 'image/svg+xml');
    expect(stored.status).toBe(201);
    expect((await app.request(`/images/${idOf(png)}`)).headers.get('content-type')).toBe(
      'image/png',
    );
    await expectProblem(await post(app, svg, 'image/png'), 'image-svg-unsupported');
  });

  it.each([
    ['text declared as an image', new TextEncoder().encode('not a picture'), 'image/png'],
    ['an empty body', new Uint8Array(), 'image/png'],
  ])('refuses %s as an unsupported format, storing nothing', async (_, bytes, type) => {
    const { store, storeImage } = repository();
    await expectProblem(
      await post(createSpaceHttpApp(store), bytes, type),
      'image-format-unsupported',
    );
    expect(storeImage).not.toHaveBeenCalled();
  });

  it('refuses an SVG with its own code, storing nothing', async () => {
    const { store, storeImage } = repository();
    await expectProblem(
      await post(createSpaceHttpApp(store), svg, 'image/svg+xml'),
      'image-svg-unsupported',
    );
    expect(storeImage).not.toHaveBeenCalled();
  });

  it('refuses a body over 10 MiB by counting what arrives, storing nothing', async () => {
    const { store, storeImage } = repository();
    const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1);
    oversized.set(png);

    await expectProblem(await post(createSpaceHttpApp(store), oversized), 'image-too-large');
    expect(storeImage).not.toHaveBeenCalled();
  });

  it('stores an image of exactly 10 MiB', async () => {
    const { store } = repository();
    const atLimit = new Uint8Array(MAX_IMAGE_BYTES);
    atLimit.set(png);

    expect((await post(createSpaceHttpApp(store), atLimit)).status).toBe(201);
  });

  it('refuses an encoded body rather than storing the encoding', async () => {
    const { store, storeImage } = repository();
    const response = await createSpaceHttpApp(store).request('/images', {
      method: 'POST',
      headers: { 'Content-Encoding': 'gzip' },
      body: png,
    });
    await expectProblem(response, 'unsupported-media-type');
    expect(storeImage).not.toHaveBeenCalled();
  });

  it('answers an unreachable store as unavailable', async () => {
    const { store } = repository();
    store.storeImage = () => Promise.reject(new PersistenceUnavailableError('down'));
    const logError = vi.fn();

    await expectProblem(
      await post(createSpaceHttpApp(store, { logError }), png),
      'persistence-unavailable',
    );
    expect(logError).toHaveBeenCalledOnce();
  });
});

describe('reading an image', () => {
  it('answers 404 for a well-formed id nothing is stored at', async () => {
    const { store, readsSpace } = repository();
    expect(isImageId(UNKNOWN_ID)).toBe(true);

    await expectProblem(
      await createSpaceHttpApp(store).request(`/images/${UNKNOWN_ID}`),
      'not-found',
    );
    expect(readsSpace).not.toHaveBeenCalled();
  });

  it.each([
    ['too short', 'A'.repeat(42)],
    ['padded', `${'A'.repeat(43)}=`],
    ['outside base64url', `${'A'.repeat(42)}+`],
    ['a non-canonical final digit', `${'A'.repeat(42)}B`],
    ['a UUID', '00000000-0000-4000-8000-000000000001'],
  ])('answers 400 for an id that is %s, without reading anything', async (_, id) => {
    const { store, readsSpace, loadImage } = repository();

    await expectProblem(
      await createSpaceHttpApp(store).request(`/images/${encodeURIComponent(id)}`),
      'invalid-image-id',
    );
    expect(loadImage).not.toHaveBeenCalled();
    expect(readsSpace).not.toHaveBeenCalled();
  });

  it('answers HEAD with the headers GET would carry', async () => {
    const { store } = repository();
    const app = createSpaceHttpApp(store);
    await post(app, png);

    const response = await app.request(`/images/${idOf(png)}`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it.each([
    ['the collection', '/images', 'GET', 'POST'],
    ['an image', `/images/${UNKNOWN_ID}`, 'DELETE', 'GET, HEAD'],
    ['an image', `/images/${UNKNOWN_ID}`, 'PUT', 'GET, HEAD'],
  ])('answers 405 for %s under %s, naming what is allowed', async (_, path, method, allow) => {
    const { store } = repository();
    const response = await createSpaceHttpApp(store).request(path, { method });

    await expectProblem(response, 'method-not-allowed');
    expect(response.headers.get('allow')).toBe(allow);
  });

  it('answers 400 for a malformed id whatever the method', async () => {
    const { store } = repository();
    await expectProblem(
      await createSpaceHttpApp(store).request('/images/nope', { method: 'DELETE' }),
      'invalid-image-id',
    );
  });
});
