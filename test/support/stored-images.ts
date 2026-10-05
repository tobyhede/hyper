import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { admitImage, imagePath, type StoredImage } from '@project/persistence';

/**
 * Bytes `admitImage` admits as a PNG: the signature and a tail that tells one
 * test image from another. Storing reads the signature and nothing else, so a
 * picture's pixels are not what these tests are about.
 */
export const pngBytes = (tail = 0): Uint8Array<ArrayBuffer> =>
  Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, tail]);

/** Bytes `admitImage` admits as a JPEG. */
export const jpegBytes = (tail = 0): Uint8Array<ArrayBuffer> =>
  Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, tail]);

/** The image storing makes of these bytes, or a thrown error when it would refuse them. */
export const admitted = async (bytes: Uint8Array<ArrayBuffer>): Promise<StoredImage> => {
  const admission = await admitImage(bytes);
  if (admission.kind !== 'admitted') throw new Error(`Not an image: ${admission.code}`);
  return admission.image;
};

/** An Image Resource document showing a stored image by its URL. */
export const showing = (image: StoredImage, title = 'Picture') => ({
  title,
  kind: 'image' as const,
  url: imagePath(image.id),
});

/**
 * Every regular file under `directory`, by its path relative to it, with its
 * bytes: what "byte-for-byte the same directory" is compared over.
 */
export const directoryTree = async (directory: string): Promise<Record<string, Buffer>> => {
  const tree: Record<string, Buffer> = {};
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    tree[relative(directory, path)] = await readFile(path);
  }
  return tree;
};
