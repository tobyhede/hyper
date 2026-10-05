import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SpaceSnapshot } from '@project/core';
import {
  admitImage,
  IMAGE_COLLECTION_PATH,
  isImageId,
  type ImageId,
  type ImageMediaType,
  type ImageStore,
  type StoredImage,
} from '@project/persistence';
import { compareOrdinal } from '../ordinal';
import { AggregateDirectoryError, isMissingFile } from './space-directory';

/**
 * The directory inside an Aggregate directory that carries the bytes of the
 * stored images its Resources show (ADR 0118).
 */
export const IMAGES_DIRECTORY_NAME = 'images';

const EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const satisfies Record<ImageMediaType, string>;

/**
 * An image's file name: its content id, which is also the last segment of its
 * stored URL, and the extension of the format its bytes are. The same picture
 * always has the same name, so it is written once and never churns.
 */
export const imageFileName = ({ id, mediaType }: StoredImage): string =>
  `${id}.${EXTENSIONS[mediaType]}`;

/** The entries of `images/`, or `undefined` when there is no such directory. */
const listImagesDirectory = async (directory: string): Promise<readonly Dirent[] | undefined> => {
  try {
    return await readdir(join(directory, IMAGES_DIRECTORY_NAME), { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
};

/**
 * The visible regular files among those entries, in ordinal order. These are
 * what Import admits and so exactly what Export replaces; a dotfile, a
 * directory or a link in `images/` is the author's and is left.
 */
const imageFileNames = (entries: readonly Dirent[]): readonly string[] =>
  entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map(({ name }) => name)
    .sort(compareOrdinal);

const readImageFile = async (path: string, name: string): Promise<StoredImage> => {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await readFile(path));
  } catch (error) {
    throw new AggregateDirectoryError('discovery', [`${path}: ${String(error)}`]);
  }
  const admission = await admitImage(bytes);
  if (admission.kind === 'refused') {
    throw new AggregateDirectoryError('parsing', [
      `${path}: not an image the host stores (${admission.code})`,
    ]);
  }
  const expected = imageFileName(admission.image);
  if (name !== expected) {
    throw new AggregateDirectoryError('parsing', [
      `${path}: an image file must be named for its content, ${expected}`,
    ]);
  }
  return admission.image;
};

/**
 * Admit every image file in an Aggregate directory's `images/`, by the same
 * rule storing an uploaded picture uses. A file that is not an image the host
 * stores, or is not named for its content, is a failure of the directory: a
 * misnamed file would be stored under a URL no Resource shows.
 *
 * Every file is read before failures are answered, and each failure is the
 * caller's to gather beside the Spaces' own.
 */
export const readAggregateImages = async (
  directory: string,
): Promise<{
  readonly images: readonly StoredImage[];
  readonly failures: readonly unknown[];
}> => {
  const names = imageFileNames((await listImagesDirectory(directory)) ?? []);
  const results = await Promise.allSettled(
    names.map((name) => readImageFile(join(directory, IMAGES_DIRECTORY_NAME, name), name)),
  );
  return {
    images: results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
    // SAFETY: PromiseRejectedResult.reason is typed `any` by lib.es; asserting
    // `unknown` stops that `any` from propagating into `failures`.
    failures: results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    ),
  };
};

const STORED_IMAGE_PREFIX = `${IMAGE_COLLECTION_PATH}/`;

/** The stored image an Image Resource's URL names, or `undefined` for an external URL. */
const storedImageId = (url: string): ImageId | undefined => {
  if (!url.startsWith(STORED_IMAGE_PREFIX)) return undefined;
  const id = url.slice(STORED_IMAGE_PREFIX.length);
  return isImageId(id) ? id : undefined;
};

/**
 * The stored images the aggregate's Image Resources show whose bytes the store
 * holds, once each, in id order. An external URL names no stored image, and a
 * stored URL whose bytes are missing has nothing to carry; both travel as the
 * URL alone, so neither fails the Export.
 */
export const loadReferencedImages = async (
  store: Pick<ImageStore, 'loadImage'>,
  spaces: readonly SpaceSnapshot[],
): Promise<readonly StoredImage[]> => {
  const ids = new Set(
    spaces.flatMap(({ resources }) =>
      resources.flatMap(({ document }) => {
        const id = document.kind === 'image' ? storedImageId(document.url) : undefined;
        return id === undefined ? [] : [id];
      }),
    ),
  );
  const loaded = await Promise.all([...ids].sort(compareOrdinal).map((id) => store.loadImage(id)));
  return loaded.flatMap((image) => (image === undefined ? [] : [image]));
};

/**
 * Rewrite `images/` whole: remove every file Import would admit, then write
 * these images. An image no Resource shows any more therefore leaves the
 * directory, and an `images/` left holding nothing is removed.
 */
export const writeAggregateImages = async (
  images: readonly StoredImage[],
  directory: string,
): Promise<void> => {
  const imagesDirectory = join(directory, IMAGES_DIRECTORY_NAME);
  const entries = await listImagesDirectory(directory);
  const scanned = imageFileNames(entries ?? []);
  for (const name of scanned) await rm(join(imagesDirectory, name));
  if (images.length === 0) {
    if (entries?.length === scanned.length) await rmdir(imagesDirectory);
    return;
  }
  await mkdir(imagesDirectory, { recursive: true });
  for (const image of images) {
    await writeFile(join(imagesDirectory, imageFileName(image)), image.bytes);
  }
};
