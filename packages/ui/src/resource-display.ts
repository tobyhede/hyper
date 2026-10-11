import type { ImageKindId, MarkdownKindId, ResourceContent } from '@project/core';
import type { ImageReplaceEditor } from './ImageReplaceTarget';
import type { MarkdownResourceBodyEditor } from './MarkdownResourceBody';

/** A Resource's own content of one kind: never a Target's, reached by reference. */
export type OwnContent<K extends MarkdownKindId | ImageKindId> = Extract<
  ResourceContent,
  { readonly kind: K }
> & { readonly via: 'self' };

/**
 * What a drawn Resource shows now. A Closed Resource carries no content (ADR
 * 0006, as narrowed by ADR 0064); an Open one carries its resolved content, its
 * own or its Target's. Presenting draws on the Stage through
 * `PresentedResource`, never through `CanvasResource` (ADR 0123).
 *
 * `editing` and `replacing` are made only by `beginEditing` and
 * `beginReplacing`, and carry only the Resource's own content, so a Target's
 * content reached through a Reference Resource cannot be given an editor or a
 * replacer (ADR 0070).
 */
export type ResourceDisplay =
  | { readonly shown: 'closed' }
  | { readonly shown: 'open'; readonly content: ResourceContent }
  | {
      readonly shown: 'editing';
      readonly content: OwnContent<MarkdownKindId>;
      readonly editor: MarkdownResourceBodyEditor;
      /** Whether the editor takes focus when it is drawn. */
      readonly autoFocus: boolean;
    }
  | {
      readonly shown: 'replacing';
      readonly content: OwnContent<ImageKindId>;
      readonly replacer: ImageReplaceEditor;
    };

/** The one Closed display, so every Closed Resource shares its identity. */
export const CLOSED_DISPLAY: Extract<ResourceDisplay, { readonly shown: 'closed' }> = {
  shown: 'closed',
};

type Running = { readonly shown: 'editing' | 'replacing' };

/** The display with no edit or replacement running: `open`, with the same content. */
export function atRest(display: ResourceDisplay): Exclude<ResourceDisplay, Running> {
  switch (display.shown) {
    case 'editing':
    case 'replacing':
      return { shown: 'open', content: display.content };
    case 'closed':
    case 'open':
      return display;
  }
}
