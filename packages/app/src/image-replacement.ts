import { isAcceptedImageUrl, IMAGE_URL_UNSUPPORTED, type ResourceId } from '@project/core';
import { describeAuthoringRefusal, describeImageRefusals } from './authoring-refusal';
import { storeEach, type ImageEditResult, type ImageSources } from './image-creation';
import type { SpaceAuthoring } from './space-authoring';
import type { ImageReplacement } from '@project/ui';

/** A replacement whose initiating Space was replaced is discarded, never an Edit. */
export type ImageReplacementResult =
  ImageEditResult | { readonly kind: 'discarded' } | { readonly kind: 'file-count-refused' };

/**
 * Replace an Image Resource's image, from what the author brought to one
 * completed Edit (ADR 0106).
 *
 * A chosen file is stored the way a created one is, so a declared type the
 * host refuses is answered before anything is sent; a URL is read as typed,
 * trimmed. Either is then measured, so the Edit records the size it was told
 * and nothing is written back afterwards. A URL the Resource may not hold, or the one it
 * already holds, is answered before anything is loaded; the Edit still decides
 * `unchanged` against the Space as it stands when it completes.
 */
export async function replaceImage(
  {
    images,
    authoring,
  }: {
    readonly images: ImageSources;
    readonly authoring: Pick<SpaceAuthoring, 'complete' | 'getState'>;
  },
  image: { readonly resourceId: ResourceId; readonly url: string },
  replacement: ImageReplacement,
): Promise<ImageReplacementResult> {
  const epoch = authoring.getState().replacementEpoch;
  let url: string;
  if (replacement.kind === 'url') {
    url = replacement.url.trim();
    if (!isAcceptedImageUrl(url)) {
      return { kind: 'refused', refusal: { code: IMAGE_URL_UNSUPPORTED } };
    }
    if (url === image.url) return { kind: 'unchanged' };
  } else {
    const files = replacement.files;
    if (files.length !== 1) return { kind: 'file-count-refused' };
    const stored = await storeEach(images, files);
    if (authoring.getState().replacementEpoch !== epoch) return { kind: 'discarded' };
    if (stored.kind === 'not-stored') return stored;
    const [storedUrl] = stored.urls;
    if (storedUrl === undefined) return { kind: 'unchanged' };
    url = storedUrl;
  }
  const { resourceId } = image;
  const measured = await images.measure(url);
  if (authoring.getState().replacementEpoch !== epoch) return { kind: 'discarded' };
  return authoring.complete(
    measured === undefined
      ? { kind: 'replaced-image', resourceId, url }
      : { kind: 'replaced-image', resourceId, url, naturalSize: measured },
  );
}

/**
 * What Replace image says about its answer, in the application's words: the
 * sentence for a refusal, or `null` for an answer that leaves nothing to say —
 * a completed Edit, the URL already held, a discarded stale interaction, or
 * a completion queued during another completion's publication.
 */
export const describeImageReplacement = (result: ImageReplacementResult): string | null => {
  switch (result.kind) {
    case 'file-count-refused':
      return 'Use one image at a time.';
    case 'refused':
      return describeAuthoringRefusal(result.refusal);
    case 'not-stored':
      return describeImageRefusals(result.refusals);
    case 'completed':
    case 'unchanged':
    case 'queued':
    case 'discarded':
      return null;
  }
};
