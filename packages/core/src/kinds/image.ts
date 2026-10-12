/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import type { ContentVia } from '../resource-content';
import { defineKind } from './kind-module';

/** The refusal code for an image URL an Image Resource may not hold; the application owns the wording. */
export const IMAGE_URL_UNSUPPORTED = 'image-url-unsupported';

/**
 * The id of an image the host stores: the SHA-256 of its bytes spelled as
 * unpadded base64url (ADR 0106). Forty-three characters, and only the
 * canonical spelling: the last one carries four bits of the digest and two
 * zero bits, so it is one of the sixteen characters whose low two bits are
 * clear.
 */
const STORED_IMAGE_ID = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;

export const isStoredImageId = (value: string): boolean => STORED_IMAGE_ID.test(value);

/** The collection the host stores images under; a stored image's root-relative URL is `/images/<id>`. */
export const STORED_IMAGE_COLLECTION_PATH = '/images';

const STORED_IMAGE_PATH_PREFIX = `${STORED_IMAGE_COLLECTION_PATH}/`;

/**
 * Whether an Image Resource may hold this URL (ADR 0106): an `https:` or
 * `http:` URL, or the root-relative URL of a stored image. `data:` is refused
 * because it would put the picture's bytes back in the document, every other
 * scheme because the Resource shows a picture from the web, and every other
 * relative form because it would resolve against whatever page drew it.
 */
export const isAcceptedImageUrl = (url: string): boolean => {
  if (url.startsWith('/')) {
    return (
      url.startsWith(STORED_IMAGE_PATH_PREFIX) &&
      isStoredImageId(url.slice(STORED_IMAGE_PATH_PREFIX.length))
    );
  }
  if (!URL.canParse(url)) return false;
  const { protocol } = new URL(url);
  return protocol === 'https:' || protocol === 'http:';
};

const imageUrlSchema = z.string().refine(isAcceptedImageUrl, {
  message: 'An image URL must be https:, http:, or the /images/<id> of a stored image',
  params: { code: IMAGE_URL_UNSUPPORTED },
});

/**
 * The size of the picture in pixels, as measured when its URL was set
 * (ADR 0106). Recorded with the image; no size rule reads it, because a
 * Resource's size is its Map entry's and the picture fits the rect it is given.
 */
export const imageNaturalSizeSchema = z.object({
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
});

/**
 * A Resource that shows a picture from its URL (ADR 0106). It owns the URL and
 * not the bytes, so nothing here says where the picture is stored; the natural
 * size is absent when the picture did not load when its URL was set.
 */
export const imageResourceContentSchema = z.object({
  url: imageUrlSchema,
  naturalSize: imageNaturalSizeSchema.optional(),
});

/** What an Image Resource's content resolves to: the URL its picture is shown from. */
export interface ImageContent {
  readonly kind: 'image';
  readonly url: string;
  readonly via: ContentVia;
}

/**
 * The Image kind (ADR 0106): a content kind whose content is a picture shown
 * from its URL. Its content action is Replace.
 */
export const imageKind = defineKind({
  id: 'image',
  contentSchema: imageResourceContentSchema,
  flags: {
    takesResourceShape: false,
    canOpen: true,
    mayBeTarget: true,
    ownsReferencedSpaces: false,
  },
  facts: { action: 'replace-image', embedsMap: false, drawsContentArea: true },
  resolveContent: (content, via): ImageContent => ({ kind: 'image', url: content.url, via }),
});

/** The Image kind's id. */
export type ImageKindId = typeof imageKind.id;
