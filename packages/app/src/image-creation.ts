import type { ImageNaturalSize, MapId, MapPosition } from '@project/core';
import type { PlacementMode } from '@project/graph';
import { refusalForDeclaredType, type ImageRefusal, type ImageStoring } from '@project/persistence';
import type {
  AuthoringResult,
  CreatedImage,
  ImagesCompletion,
  SpaceAuthoring,
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

/** Where a gesture was made: the Map it was aimed at, the point, and how that point is kept. */
export interface ImageTarget {
  readonly mapId: MapId;
  readonly anchor: MapPosition;
  readonly placement: PlacementMode;
}

/** What one creation gesture brought: the files it dropped or chose, or a URL it pasted. */
export type ImageOrigin =
  | { readonly kind: 'files'; readonly files: readonly File[] }
  | { readonly kind: 'url'; readonly url: string };

/**
 * What a creation gesture answers: the Edit's own result, or the refusal that
 * stopped a file being stored, named with the file so the sentence can say
 * which one.
 */
export type ImageCreationResult =
  | AuthoringResult
  | { readonly kind: 'not-stored'; readonly code: ImageRefusal; readonly name: string };

/**
 * The URL each file is stored at, in order, or the first file refused.
 *
 * A file whose declared type is refused is answered before any file is sent,
 * so a drop holding one sends nothing. Otherwise every file is sent before any
 * answer is read, so a refused file can leave
 * the files beside it stored with nothing referencing them. That is the store's
 * standing state rather than a leak: ADR 0106 never deletes a stored image,
 * and an image's id is its content, so sending the same file again stores
 * nothing new.
 */
const storeEach = async (
  images: ImageSources,
  files: readonly File[],
): Promise<
  | { readonly kind: 'stored'; readonly urls: readonly string[] }
  | Extract<ImageCreationResult, { readonly kind: 'not-stored' }>
> => {
  for (const file of files) {
    const code = refusalForDeclaredType(file.type);
    if (code !== undefined) return { kind: 'not-stored', code, name: file.name };
  }
  const answers = await Promise.all(files.map((file) => images.store(file)));
  const urls: string[] = [];
  for (const [index, answer] of answers.entries()) {
    if (answer.kind === 'refused') {
      return { kind: 'not-stored', code: answer.code, name: files[index]?.name ?? '' };
    }
    urls.push(answer.url);
  }
  return { kind: 'stored', urls };
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
  { mapId, anchor, placement }: ImageTarget,
): Promise<ImageCreationResult> {
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
  // point on that Map. Storing and measuring outlast the gesture, so the author
  // may have moved to another Map since. While the canvas still draws it this
  // is the ordinary Edit; otherwise it writes the Map it was aimed at without
  // moving the canvas, and a Map that has gone refuses `map-not-found`.
  return authoring.getState().navigation.selectedMapId === mapId
    ? authoring.complete(completion)
    : authoring.completeInMap(mapId, completion);
}
