import {
  contentAction,
  type ContentVia,
  type ResourceContent,
  type ResourceShape,
  type SpaceView,
} from '@project/core';
import type { ImageReplaceEditor } from './ImageReplaceTarget';
import type { MarkdownResourceBodyEditor } from './MarkdownResourceBody';

/** A Resource's own content of one kind: never a Target's, reached by reference. */
export type OwnContent<K extends 'markdown' | 'image'> = Extract<
  ResourceContent,
  { readonly kind: K }
> & { readonly via: 'self' };

/**
 * What a Resource shows now. A Closed Resource carries no content (ADR 0006, as
 * narrowed by ADR 0064); an Open or presented one carries its resolved content,
 * its own or its Target's.
 *
 * Presenting and Open are decided between once, where the display is made: a
 * Resource both presented and Open is `presented`.
 *
 * `editing` and `replacing` are made only by `beginEditing` and
 * `beginReplacing`, and carry only the Resource's own content, so a Target's
 * content reached through a Reference Resource cannot be given an editor or a
 * replacer (ADR 0070).
 */
export type ResourceDisplay =
  | { readonly shown: 'closed' }
  | { readonly shown: 'open'; readonly content: ResourceContent }
  | { readonly shown: 'presented'; readonly content: ResourceContent }
  | {
      readonly shown: 'editing';
      readonly content: OwnContent<'markdown'>;
      readonly editor: MarkdownResourceBodyEditor;
      /** Whether the editor takes focus when it is drawn. */
      readonly autoFocus: boolean;
    }
  | {
      readonly shown: 'replacing';
      readonly content: OwnContent<'image'>;
      readonly replacer: ImageReplaceEditor;
    };

/** What a Resource front draws. A presented Resource is drawn by `PresentedResource`. */
export type FrontDisplay = Exclude<ResourceDisplay, { readonly shown: 'presented' }>;

/** The one Closed display, so every Closed Resource shares its identity. */
export const CLOSED_DISPLAY: Extract<ResourceDisplay, { readonly shown: 'closed' }> = {
  shown: 'closed',
};

/**
 * Edit a Resource's Markdown body. Answers `display` itself unless it is Open
 * with the Resource's own Markdown, so a caret that lands before the Open
 * display draws nothing until it arrives.
 */
export function beginEditing<D extends ResourceDisplay>(
  display: D,
  editor: MarkdownResourceBodyEditor,
  autoFocus: boolean,
): D | Extract<ResourceDisplay, { readonly shown: 'editing' }> {
  if (display.shown !== 'open') return display;
  const content = display.content;
  if (contentAction(content) !== 'edit-markdown' || content.kind !== 'markdown') return display;
  return {
    shown: 'editing',
    content: { ...content, via: 'self' },
    editor,
    autoFocus,
  };
}

/**
 * Replace an Image Resource's image. Answers `display` itself unless it is Open
 * with the Resource's own image.
 */
export function beginReplacing<D extends ResourceDisplay>(
  display: D,
  replacer: ImageReplaceEditor,
): D | Extract<ResourceDisplay, { readonly shown: 'replacing' }> {
  if (display.shown !== 'open') return display;
  const content = display.content;
  if (contentAction(content) !== 'replace-image' || content.kind !== 'image') return display;
  return {
    shown: 'replacing',
    content: { ...content, via: 'self' },
    replacer,
  };
}

type Running = { readonly shown: 'editing' | 'replacing' };

/** The display with no edit or replacement running: `open`, with the same content. */
export function atRest(display: FrontDisplay): Exclude<FrontDisplay, Running>;
export function atRest(display: ResourceDisplay): Exclude<ResourceDisplay, Running>;
export function atRest(display: ResourceDisplay): Exclude<ResourceDisplay, Running> {
  switch (display.shown) {
    case 'editing':
    case 'replacing':
      return { shown: 'open', content: display.content };
    case 'closed':
    case 'open':
    case 'presented':
      return display;
  }
}

/**
 * The Space view an Open or presented Resource shows, and whether it is the
 * Resource's own or its Target's. A Space reached through a Reference Resource
 * is drawn read-only (ADR 0070). A Closed display shows no Space.
 */
export function spaceViewOf(
  display: ResourceDisplay,
): { readonly view: SpaceView; readonly via: ContentVia } | undefined {
  switch (display.shown) {
    case 'open':
    case 'presented':
      return display.content.kind === 'space'
        ? { view: display.content.view, via: display.content.via }
        : undefined;
    case 'closed':
    case 'editing':
    case 'replacing':
      return undefined;
  }
}

/**
 * The Shape a Resource front is drawn in (ADR 0117).
 *
 * Only a Closed Resource draws its Map's Shape: an Open, editing, replacing or
 * presented Resource is read rather than drawn as notation, and is drawn as
 * the rectangle whatever its Shape. The Shape stays recorded on the Map and is
 * drawn again on Close.
 */
export function drawnResourceShape(
  display: ResourceDisplay,
  resourceShape: ResourceShape,
): ResourceShape {
  return display.shown === 'closed' ? resourceShape : 'rectangle';
}
