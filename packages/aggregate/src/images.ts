import { admitImage, type ImageMediaType, type StoredImage } from '@project/persistence';
import { AggregateDirectoryError } from './space-directory';

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

/**
 * Admit one image file's bytes by the rule storing an uploaded picture uses,
 * and insist it is named for its content. Every image an Aggregate directory
 * carries is admitted through this.
 */
export const admitImageFile = async (
  path: string,
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<StoredImage> => {
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
