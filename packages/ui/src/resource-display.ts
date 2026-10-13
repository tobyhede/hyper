import type { ResourceContent } from '@project/core';
import type { KindEditByKind } from './kinds/registry';

/** The kinds whose own content an author edits in its content area: each kind that declares an edit. */
export type EditedKind = keyof KindEditByKind;

/** A Resource's own content of one kind: never a Target's, reached by reference. */
export type OwnContent<K extends EditedKind> = Extract<ResourceContent, { readonly kind: K }> & {
  readonly via: 'self';
};

/** The edit running in an Open Resource's content area, one arm per kind that declares one. */
type ContentEditing = {
  [K in EditedKind]: {
    readonly shown: 'editing';
    readonly kind: K;
    readonly content: OwnContent<K>;
    readonly edit: KindEditByKind[K];
  };
}[EditedKind];

/**
 * What a drawn Resource shows now. A Closed Resource carries no content (ADR
 * 0006, as narrowed by ADR 0064); an Open one carries its resolved content, its
 * own or its Target's. Presenting draws on the Stage through
 * `PresentedResource`, never through `CanvasResource` (ADR 0123).
 *
 * `editing` is made only by the edit each kind's view half declares a begin
 * for (`kinds/`), and carries only the Resource's own content, so a Target's
 * content reached through a Reference Resource cannot be given an edit (ADR
 * 0070). What the edit holds is its kind's.
 */
export type ResourceDisplay =
  | { readonly shown: 'closed' }
  | { readonly shown: 'open'; readonly content: ResourceContent }
  | ContentEditing;

/** The one Closed display, so every Closed Resource shares its identity. */
export const CLOSED_DISPLAY: Extract<ResourceDisplay, { readonly shown: 'closed' }> = {
  shown: 'closed',
};

/** The display with no edit running: `open`, with the same content. */
export function atRest(display: ResourceDisplay): Exclude<ResourceDisplay, ContentEditing> {
  switch (display.shown) {
    case 'editing':
      return { shown: 'open', content: display.content };
    case 'closed':
    case 'open':
      return display;
  }
}
