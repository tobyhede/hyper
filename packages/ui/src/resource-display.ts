import type { ResourceContent } from '@project/core';

/**
 * What a Resource shows now. A Closed Resource carries no content (ADR 0006, as
 * narrowed by ADR 0064); an Open or presented one carries its resolved content,
 * its own or its Target's.
 *
 * Presenting and Open are decided between once, where the display is made: a
 * Resource both presented and Open is `presented`.
 */
export type ResourceDisplay =
  | { readonly shown: 'closed' }
  | { readonly shown: 'open'; readonly content: ResourceContent }
  | { readonly shown: 'presented'; readonly content: ResourceContent };

/** What a Resource front draws. A presented Resource is drawn by `PresentedResource`. */
export type FrontDisplay = Exclude<ResourceDisplay, { readonly shown: 'presented' }>;

/** The one Closed display, so every Closed Resource shares its identity. */
export const CLOSED_DISPLAY: Extract<ResourceDisplay, { readonly shown: 'closed' }> = {
  shown: 'closed',
};
