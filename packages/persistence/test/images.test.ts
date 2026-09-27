import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { admitImage, imageIdOf, imagePath, isImageId, MAX_IMAGE_BYTES } from '../src/images';

const bytes = (...values: readonly number[]): Uint8Array<ArrayBuffer> => Uint8Array.from(values);
const ascii = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const joined = (...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

/** The shortest prefix each format is recognised by, followed by arbitrary content. */
const png = joined(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), ascii('IHDR'));
const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const gif = ascii('GIF89a\u0001\u0000');
const webp = joined(ascii('RIFF'), bytes(0x24, 0, 0, 0), ascii('WEBPVP8 '));

/** SHA-256 spelled as unpadded base64url, computed by Node's own hash rather than the module's. */
const expectedId = (content: Uint8Array): string =>
  createHash('sha256').update(content).digest('base64url');

describe('admitting an image', () => {
  it.each([
    ['PNG', png, 'image/png'],
    ['JPEG', jpeg, 'image/jpeg'],
    ['GIF', gif, 'image/gif'],
    ['WebP', webp, 'image/webp'],
  ] as const)('admits %s by its bytes, naming it by their SHA-256', async (_, content, type) => {
    await expect(admitImage(content)).resolves.toEqual({
      kind: 'admitted',
      image: { id: expectedId(content), mediaType: type, bytes: content },
    });
  });

  it('names bytes by the digest every SHA-256 implementation gives them', async () => {
    await expect(imageIdOf(new Uint8Array())).resolves.toBe(
      '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
    );
  });

  it.each([
    ['empty bytes', new Uint8Array()],
    ['text', ascii('hello, world')],
    ['a truncated PNG signature', bytes(0x89, 0x50, 0x4e, 0x47)],
    ['a RIFF container that is not WebP', joined(ascii('RIFF'), bytes(0, 0, 0, 0), ascii('WAVE'))],
    ['a PDF', ascii('%PDF-1.7')],
  ])('refuses %s as an unsupported format', async (_, content) => {
    await expect(admitImage(content)).resolves.toEqual({
      kind: 'refused',
      code: 'image-format-unsupported',
    });
  });

  it.each([
    ['a bare SVG', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['an SVG with a declaration', '<?xml version="1.0"?>\n<svg></svg>'],
    ['an SVG after a byte-order mark and whitespace', '\uFEFF  \n<SVG></SVG>'],
    ['an SVG after a doctype', '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" ""><svg/>'],
  ])('refuses %s with its own code', async (_, text) => {
    await expect(admitImage(ascii(text))).resolves.toEqual({
      kind: 'refused',
      code: 'image-svg-unsupported',
    });
  });

  it('admits an image of exactly the size limit and refuses one byte more', async () => {
    const atLimit = new Uint8Array(MAX_IMAGE_BYTES);
    atLimit.set(png);
    const overLimit = new Uint8Array(MAX_IMAGE_BYTES + 1);
    overLimit.set(png);

    await expect(admitImage(atLimit)).resolves.toMatchObject({ kind: 'admitted' });
    await expect(admitImage(overLimit)).resolves.toEqual({
      kind: 'refused',
      code: 'image-too-large',
    });
  });

  it('is ten MiB', () => {
    expect(MAX_IMAGE_BYTES).toBe(10_485_760);
  });
});

describe('an image id', () => {
  it('is the canonical 43-character unpadded base64url spelling of a digest', () => {
    const id = expectedId(png);
    expect(isImageId(id)).toBe(true);
    expect(isImageId(`${id}=`)).toBe(false);
    expect(isImageId(id.slice(1))).toBe(false);
    expect(isImageId(id.replace(/^./u, '+'))).toBe(false);
    // A final digit carrying set bits past the digest's 256 spells no digest.
    expect(isImageId(`${'A'.repeat(42)}B`)).toBe(false);
    expect(isImageId(`${'A'.repeat(42)}E`)).toBe(true);
  });

  it('is addressed under /images', async () => {
    expect(imagePath(await imageIdOf(png))).toBe(`/images/${expectedId(png)}`);
  });
});
