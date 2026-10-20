import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { compareOrdinal, IMAGES_DIRECTORY_NAME } from '@project/aggregate';
import { imageKind, type SpaceSnapshot } from '@project/core';
import {
  IMAGE_COLLECTION_PATH,
  isImageId,
  type ImageId,
  type ImageStore,
  type StoredImage,
} from '@project/persistence';
import { isMissingFile } from './space-directory';

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
 * what Import admits and so exactly what Export owns; a dotfile, a
 * directory or a link in `images/` is the author's and is left.
 */
const imageFileNames = (entries: readonly Dirent[]): readonly string[] =>
  entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map(({ name }) => name)
    .sort(compareOrdinal);

const STORED_IMAGE_PREFIX = `${IMAGE_COLLECTION_PATH}/`;

/** The stored image an Image Resource's URL names, or `undefined` for an external URL. */
export const storedImageId = (url: string): ImageId | undefined => {
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
        const id = document.kind === imageKind.id ? storedImageId(document.content.url) : undefined;
        return id === undefined ? [] : [id];
      }),
    ),
  );
  const loaded = await Promise.all([...ids].sort(compareOrdinal).map((id) => store.loadImage(id)));
  return loaded.flatMap((image) => (image === undefined ? [] : [image]));
};

/**
 * The names of the files in `images/` that Import admits, in ordinal order:
 * what Export owns there, and so what it removes when no Resource shows one.
 */
export const scannedImageFileNames = async (directory: string): Promise<readonly string[]> =>
  imageFileNames((await listImagesDirectory(directory)) ?? []);
