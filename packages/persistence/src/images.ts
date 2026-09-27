/**
 * The images the host stores beside Spaces and outside the aggregate
 * (ADR 0106): what one is, which bytes are admitted as one, and what a store of
 * them owes its callers. Browser-safe, because the route that stores them is
 * `@project/http`'s, and each repository under `src/` implements the store.
 */

/** The largest image the host stores, in bytes: 10 MiB. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** The formats the host stores, each identified from the bytes. */
const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

/** Whether a stored media type is one the host stores images as. */
export const isImageMediaType = (value: string): value is ImageMediaType =>
  IMAGE_MEDIA_TYPES.some((type) => type === value);

/**
 * The SHA-256 of an image's bytes, spelled as unpadded base64url: forty-three
 * characters, the last carrying the digest's final four bits and two zero bits,
 * so exactly one spelling names each digest.
 */
export type ImageId = string & { readonly imageId: unique symbol };

const IMAGE_ID = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;

export const isImageId = (value: string): value is ImageId => IMAGE_ID.test(value);

/** The collection stored images are addressed under. */
export const IMAGE_COLLECTION_PATH = '/images';

/** An image's root-relative URL: the address an Image Resource records for a stored image. */
export const imagePath = (id: ImageId): string => `${IMAGE_COLLECTION_PATH}/${id}`;

export interface StoredImage {
  readonly id: ImageId;
  readonly mediaType: ImageMediaType;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/**
 * Why bytes are not stored, each a named code the application puts into words.
 * SVG has its own because it is not refused as unrecognised: it is left for its
 * own decision (ADR 0106).
 */
export type ImageRefusal = 'image-too-large' | 'image-format-unsupported' | 'image-svg-unsupported';

export type ImageAdmission =
  | { readonly kind: 'admitted'; readonly image: StoredImage }
  | { readonly kind: 'refused'; readonly code: ImageRefusal };

/**
 * Images, by content. Storing bytes already stored stores nothing and answers
 * `existing`; nothing is ever deleted, because a URL can be copied anywhere and
 * nothing can know an image is unused. A reset clears the store with everything
 * else, and neither aggregate lifecycle door touches it.
 */
export interface ImageStore {
  storeImage(image: StoredImage): Promise<'stored' | 'existing'>;
  loadImage(id: ImageId): Promise<StoredImage | undefined>;
}

const startsWith = (bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean =>
  prefix.every((value, index) => bytes[offset + index] === value);

const asciiCodes = (text: string): readonly number[] =>
  Array.from(text, (character) => character.charCodeAt(0));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const GIF87_SIGNATURE = asciiCodes('GIF87a');
const GIF89_SIGNATURE = asciiCodes('GIF89a');
const RIFF_SIGNATURE = asciiCodes('RIFF');
const WEBP_FORM = asciiCodes('WEBP');

/** How far into a text document an SVG root element is looked for. */
const SVG_PROBE_BYTES = 1024;

/**
 * Whether the bytes read as an SVG document: markup, after an optional
 * byte-order mark and whitespace, naming an `svg` element near its start.
 */
const isSvg = (bytes: Uint8Array): boolean => {
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, SVG_PROBE_BYTES))
    .replace(/^\uFEFF/u, '')
    .trimStart();
  return text.startsWith('<') && /<svg[\s/>]/iu.test(text);
};

const mediaTypeOf = (bytes: Uint8Array): ImageMediaType | 'svg' | undefined => {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'image/jpeg';
  if (startsWith(bytes, GIF87_SIGNATURE) || startsWith(bytes, GIF89_SIGNATURE)) return 'image/gif';
  if (startsWith(bytes, RIFF_SIGNATURE) && startsWith(bytes, WEBP_FORM, 8)) return 'image/webp';
  if (isSvg(bytes)) return 'svg';
  return undefined;
};

/** The id content-addressing gives these bytes. */
export const imageIdOf = async (bytes: Uint8Array<ArrayBuffer>): Promise<ImageId> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const id = digest.toBase64({ alphabet: 'base64url', omitPadding: true });
  if (!isImageId(id)) throw new Error('A SHA-256 digest did not spell an image id');
  return id;
};

/**
 * Decide whether bytes are stored as an image, from the bytes alone: a declared
 * type is never consulted, so a PNG sent as `text/plain` is a PNG and an SVG
 * sent as `image/png` is an SVG.
 */
export const admitImage = async (bytes: Uint8Array<ArrayBuffer>): Promise<ImageAdmission> => {
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { kind: 'refused', code: 'image-too-large' };
  const mediaType = mediaTypeOf(bytes);
  if (mediaType === 'svg') return { kind: 'refused', code: 'image-svg-unsupported' };
  if (mediaType === undefined) return { kind: 'refused', code: 'image-format-unsupported' };
  return { kind: 'admitted', image: { id: await imageIdOf(bytes), mediaType, bytes } };
};
