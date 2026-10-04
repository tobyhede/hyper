import { isAcceptedImageUrl, IMAGE_URL_UNSUPPORTED, type ResourceId } from '@project/core';
import {
  createNonThrowingReporter,
  createObservableState,
  type ObserverErrorReporter,
} from '@project/persistence';
import type { ImageReplacement } from '@project/ui';
import {
  describeAuthoringRefusal,
  describeImageRefusals,
  describeImageReplacementBreak,
  describeImageReplacementPending,
} from './authoring-refusal';
import { storeEach, type ImageEditResult, type ImageSources } from './image-creation';
import { CANVAS, type SpaceAuthoring } from './space-authoring';

/**
 * What one replacement attempt answers.
 *
 * `already-replacing` is another attempt holding the Space, answered before
 * any image work starts; `discarded` is an attempt whose initiating Space was
 * replaced while it ran, never an Edit; `broken` is a failure nothing expected,
 * already reported, kept apart from the refusals an author can correct.
 */
export type ImageReplacementResult =
  | ImageEditResult
  | { readonly kind: 'already-replacing' }
  | { readonly kind: 'discarded' }
  | { readonly kind: 'file-count-refused' }
  | { readonly kind: 'broken'; readonly failure: unknown };

/**
 * One composed Space's image replacements (ADR 0106): the one operation that
 * replaces an Image Resource's picture, and whether an attempt is running.
 *
 * The busy state is what holds navigation and incompatible authoring while an
 * attempt runs, so it is read by those consumers rather than kept a second time
 * (`browser-location.test.ts`, `open-spaces.test.tsx`).
 */
export interface ImageReplacements {
  /** True from the moment an attempt starts until it settles. */
  readonly getState: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Replace the identified Image Resource's picture with what the author brought.
   *
   * The Resource is read as it stands when this is called. While another
   * attempt runs this answers `already-replacing` and starts nothing.
   */
  readonly replace: (
    resourceId: ResourceId,
    replacement: ImageReplacement,
  ) => Promise<ImageReplacementResult>;
}

export interface ImageReplacementDependencies {
  /** Where a chosen file is stored and a picture measured. */
  readonly images: ImageSources;
  readonly authoring: Pick<SpaceAuthoring, 'complete' | 'getState'>;
  /** Where an unexpected failure is reported; a sink that throws is contained. */
  readonly reportObserverError: ObserverErrorReporter;
}

/**
 * The Image Resource an attempt replaces, as it stands in the working Space it
 * begins in, and that Space's replacement epoch, both from one read.
 */
interface ReplacementTarget {
  readonly resourceId: ResourceId;
  readonly heldUrl: string;
  readonly epoch: number;
}

/**
 * The target the identified Resource names in the Space as it stands, or
 * `undefined` when the Space holds no Image Resource by that identity.
 */
const resolveTarget = (
  authoring: Pick<SpaceAuthoring, 'getState'>,
  resourceId: ResourceId,
): ReplacementTarget | undefined => {
  const { replacementEpoch: epoch, session } = authoring.getState();
  const stored = session.working.resources.find((resource) => resource.id === resourceId);
  if (stored?.document.kind !== 'image') return undefined;
  return { resourceId, heldUrl: stored.document.url, epoch };
};

/**
 * The image work of one attempt on a resolved target, through to one completed Edit.
 *
 * A chosen file is stored the way a created one is, so a declared type the
 * host refuses is answered before anything is sent; a URL is read as typed,
 * trimmed. Either is then measured, so the Edit records the size it was told
 * and nothing is written back afterwards. A URL the Resource may not hold, or
 * the one it already holds, is answered before anything is loaded; the Edit
 * still decides `unchanged` against the Space as it stands when it completes.
 * An attempt that outlives the working Space it began in — a replacement epoch
 * advanced while it waited — is discarded rather than completed.
 */
const attempt = async (
  { images, authoring }: Pick<ImageReplacementDependencies, 'images' | 'authoring'>,
  { resourceId, heldUrl, epoch }: ReplacementTarget,
  replacement: ImageReplacement,
): Promise<ImageReplacementResult> => {
  let url: string;
  if (replacement.kind === 'url') {
    url = replacement.url.trim();
    if (!isAcceptedImageUrl(url)) {
      return { kind: 'refused', refusal: { code: IMAGE_URL_UNSUPPORTED } };
    }
    if (url === heldUrl) return { kind: 'unchanged' };
  } else {
    const files = replacement.files;
    if (files.length !== 1) return { kind: 'file-count-refused' };
    const storing = await storeEach(images, files);
    if (authoring.getState().replacementEpoch !== epoch) return { kind: 'discarded' };
    if (storing.kind === 'not-stored') return storing;
    const [storedUrl] = storing.urls;
    if (storedUrl === undefined) return { kind: 'unchanged' };
    url = storedUrl;
  }
  const measured = await images.measure(url);
  if (authoring.getState().replacementEpoch !== epoch) return { kind: 'discarded' };
  return authoring.complete(
    CANVAS,
    measured === undefined
      ? { kind: 'replaced-image', resourceId, url }
      : { kind: 'replaced-image', resourceId, url, naturalSize: measured },
  );
};

/**
 * One Space's image replacements, composed once with that Space's Authoring.
 *
 * Exclusive per Space: the Resource and the replacement epoch are read before
 * the busy state is published, so a lookup the Space refuses publishes nothing
 * and a Space replaced during that publication discards the attempt
 * (`image-replacement.test.ts`, "discards a replacement whose Space is replaced
 * while its busy state is published"). The busy state is set before any image
 * work starts and cleared by the attempt that set it, on every settled path,
 * once its Edit is applied — persistence acknowledgement is the session's and is not awaited
 * (`image-replacement.test.ts`, "is busy through applying the Edit and released
 * without waiting for the save").
 */
export function createImageReplacements({
  images,
  authoring,
  reportObserverError,
}: ImageReplacementDependencies): ImageReplacements {
  const busy = createObservableState(false, reportObserverError);
  const report = createNonThrowingReporter(reportObserverError);
  return {
    getState: busy.getState,
    subscribe: busy.subscribe,
    replace: async (resourceId, replacement) => {
      if (busy.getState()) return { kind: 'already-replacing' };
      const target = resolveTarget(authoring, resourceId);
      if (target === undefined) {
        return { kind: 'refused', refusal: { code: 'resource-not-found' } };
      }
      busy.publish(true);
      try {
        return await attempt({ images, authoring }, target, replacement);
      } catch (failure) {
        report(failure);
        return { kind: 'broken', failure };
      } finally {
        busy.publish(false);
      }
    },
  };
}

/**
 * What Replace image says about its answer, in the application's words: the
 * sentence for a refusal or a break, or `null` for an answer that leaves
 * nothing to say — a completed Edit, the URL already held, a discarded stale
 * attempt, or a completion queued during another completion's publication.
 */
export const describeImageReplacement = (result: ImageReplacementResult): string | null => {
  switch (result.kind) {
    case 'file-count-refused':
      return 'Use one image at a time.';
    case 'already-replacing':
      return describeImageReplacementPending();
    case 'broken':
      return describeImageReplacementBreak(result.failure);
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
