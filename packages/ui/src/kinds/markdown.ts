import type { markdownKind } from '@project/core';

/**
 * The view half of the Markdown kind (ADR 0020, ADR 0128): what a Markdown
 * Resource is called, and the one operation it offers beyond the shared
 * Title. Its content view is `MarkdownResourceBody`, and its content action is
 * Edit.
 */
export const markdownView = {
  name: 'Markdown Resource',
  referenceName: 'Reference to a Markdown Resource',
} as const;

/** What a Markdown Resource offers beyond its Title. */
export interface MarkdownOperations {
  readonly kind: typeof markdownKind.id;
  /** Put a caret in this Resource's Markdown source. */
  readonly onBeginEdit?: () => void;
}
