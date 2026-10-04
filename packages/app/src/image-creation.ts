import type { ImageNaturalSize, MapId, MapPosition } from '@project/core';
import type { PlacementMode } from '@project/graph';
import { IMAGE_MEDIA_TYPES, refusalForDeclaredType, type ImageStoring } from '@project/persistence';
import type { RefusedFile } from './authoring-refusal';
import type { SurfaceDrawing } from './map-surface-policy';
import {
  CANVAS,
  type AuthoringResult,
  type CreatedImage,
  type ImagesCompletion,
  type SpaceAuthoring,
} from './space-authoring';

/**
 * Where an Image Resource's picture comes from, and how big it is (ADR 0106).
 *
 * Both reach outside the process — the host's image store, and the browser
 * loading a picture — so they are supplied once, when Open Spaces is composed,
 * and a test supplies answers of its own.
 */
export interface ImageSources {
  /** Store an image's bytes, answering its URL or the host's refusal. Throws when the host cannot answer. */
  readonly store: (image: Blob) => Promise<ImageStoring>;
  /** Load the picture at a URL, answering its natural size, or `undefined` when it does not load. */
  readonly measure: (url: string) => Promise<ImageNaturalSize | undefined>;
}

/**
 * The formats the host stores (ADR 0106), offered to a file picker as a
 * convenience. The host still decides from the bytes, so a file the picker
 * lets through anyway meets the host's refusal.
 */
export const PICKED_IMAGE_TYPES = IMAGE_MEDIA_TYPES.join(',');

/**
 * Where a gesture was made: the Map it was aimed at, whether that was the
 * canvas's own Map or one drawn inside it, the point, and how that point is
 * kept.
 */
export interface ImageTarget {
  readonly mapId: MapId;
  readonly drawing: SurfaceDrawing;
  readonly anchor: MapPosition;
  readonly placement: PlacementMode;
}

/** What one creation gesture brought: the files it dropped or chose, or a URL it pasted. */
export type ImageOrigin =
  | { readonly kind: 'files'; readonly files: readonly File[] }
  | { readonly kind: 'url'; readonly url: string };

/**
 * What an image gesture answers, creating or replacing: the Edit's own result,
 * or the files `storeEach` refused, in the order the gesture brought them.
 */
export type ImageEditResult =
  AuthoringResult | { readonly kind: 'not-stored'; readonly refusals: readonly RefusedFile[] };

/**
 * The URL each file is stored at, in order, or the files refused.
 *
 * Files whose declared type is refused are answered before any file is sent,
 * so a drop holding one sends nothing and names only those files: a file the
 * host would also have refused is not learned of. Otherwise every file is sent
 * before any answer is read, so every file the host refused is named, and a
 * refused file can leave the files beside it stored with nothing referencing
 * them. That is the store's standing state rather than a leak: ADR 0106 never
 * deletes a stored image, and an image's id is its content, so sending the
 * same file again stores nothing new.
 */
export const storeEach = async (
  images: ImageSources,
  files: readonly File[],
): Promise<
  | { readonly kind: 'stored'; readonly urls: readonly string[] }
  | Extract<ImageEditResult, { readonly kind: 'not-stored' }>
> => {
  const declaredRefusals = files.flatMap((file): RefusedFile[] => {
    const code = refusalForDeclaredType(file.type);
    return code === undefined ? [] : [{ code, name: file.name }];
  });
  if (declaredRefusals.length > 0) return { kind: 'not-stored', refusals: declaredRefusals };
  const answers = await Promise.all(
    files.map(async (file) => ({ name: file.name, answer: await images.store(file) })),
  );
  const urls: string[] = [];
  const storedRefusals: RefusedFile[] = [];
  for (const { name, answer } of answers) {
    if (answer.kind === 'refused') storedRefusals.push({ code: answer.code, name });
    else urls.push(answer.url);
  }
  return storedRefusals.length > 0
    ? { kind: 'not-stored', refusals: storedRefusals }
    : { kind: 'stored', urls };
};

/**
 * One creation gesture, from what it brought to one completed Edit.
 *
 * Every picture is stored and measured before the Edit, so the Edit records
 * what it was told and nothing after it has to be written back. A drop of
 * several files is all or nothing: one refused file creates none, because the
 * author made one gesture and one Edit answers it.
 */
export async function createImageResources(
  { images, authoring }: { readonly images: ImageSources; readonly authoring: SpaceAuthoring },
  origin: ImageOrigin,
  { mapId, drawing, anchor, placement }: ImageTarget,
): Promise<ImageEditResult> {
  let urls: readonly string[];
  if (origin.kind === 'url') {
    urls = [origin.url];
  } else {
    const stored = await storeEach(images, origin.files);
    if (stored.kind === 'not-stored') return stored;
    urls = stored.urls;
  }
  if (urls.length === 0) return { kind: 'unchanged' };
  const sizes = await Promise.all(urls.map((url) => images.measure(url)));
  const created = urls.map((url, index): CreatedImage => {
    const naturalSize = sizes[index];
    return naturalSize === undefined ? { url } : { url, naturalSize };
  });
  const completion: ImagesCompletion = {
    kind: 'created-images',
    images: created,
    anchor,
    placement,
  };
  // Addressed to the Map the gesture was made on, because the anchor is a
  // point on that Map. A drawn Map is written where it stands. Storing and
  // measuring outlast the gesture, so the canvas may have moved to another Map
  // since: while it still draws the Map this is the canvas's Edit; otherwise it
  // writes the Map it was aimed at without moving the canvas. A Map that has
  // gone refuses `map-not-found`.
  return drawing === 'canvas' && authoring.getState().navigation.selectedMapId === mapId
    ? authoring.complete(CANVAS, completion)
    : authoring.complete({ kind: 'drawn', mapId, graphId: null }, completion);
}
