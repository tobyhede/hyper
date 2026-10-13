import { authorsContent, imageKind, type ImageContent } from '@project/core';
import type { ImageReplaceEditor } from '../ImageReplaceTarget';
import type { ResourceDisplay } from '../resource-display';
import { ImageIcon, ReplaceImageIcon } from '../icons';
import { ImageReplaceTarget } from '../ImageReplaceTarget';
import { ResourceContentEditProvider } from '../resource-content-edit';
import { ResourceImage } from '../ResourceImage';
import type { CanvasArea, KindView } from './kind-view';

/** What an Image Resource offers beyond its Title. */
export interface ImageOperations {
  readonly kind: typeof imageKind.id;
  /** Begin replacing the image: the image kind's counterpart to a Markdown edit. */
  readonly onBeginEdit?: () => void;
}

/** An Open Image Resource's picture, or the replacement running in its place. */
const imageCanvas = (content: ImageContent, area: CanvasArea) =>
  area.authoring && area.display.shown === 'editing' && area.display.kind === imageKind.id ? (
    <ResourceContentEditProvider value={area.setContentEdit}>
      <ImageReplaceTarget name={area.name} editor={area.display.edit} />
    </ResourceContentEditProvider>
  ) : (
    <ResourceImage
      key={content.url}
      url={content.url}
      name={area.name}
      onReplace={area.authoring ? area.onBeginEdit : undefined}
    />
  );

/**
 * The view half of the Image kind (ADR 0106): what an Image Resource
 * is called and drawn as, and what it offers beyond the shared Title. Its
 * content view is `ResourceImage`, and its content action is Replace; a
 * presented image is never replaced, its own or a Target's.
 */
export const imageView: KindView<ImageOperations, ImageContent> = {
  name: 'Image Resource',
  listName: 'Image Resources',
  referenceName: 'Reference to an Image Resource',
  Glyph: ImageIcon,
  bareOperations: { kind: imageKind.id },
  contentCommand: { label: (name) => `Replace image of Resource ${name}`, Icon: ReplaceImageIcon },
  canvas: imageCanvas,
  presented: (name, content) => <ResourceImage key={content.url} url={content.url} name={name} />,
};

/**
 * Replace an Image Resource's image. Answers `display` itself unless it is Open
 * with the Resource's own image.
 */
export function beginReplacing<D extends ResourceDisplay>(
  display: D,
  replacer: ImageReplaceEditor,
): D | Extract<ResourceDisplay, { readonly kind: typeof imageKind.id }> {
  if (display.shown !== 'open') return display;
  const content = display.content;
  if (!authorsContent(content) || content.kind !== imageKind.id) return display;
  return {
    shown: 'editing',
    kind: imageKind.id,
    content: { ...content, via: 'self' },
    edit: replacer,
  };
}
