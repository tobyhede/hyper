/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import type { ContentVia } from '../resource-content';
import type { KindModule } from './kind-module';

/** A Markdown Resource's content: the source its author wrote, which its file holds as the body. */
export const markdownResourceContentSchema = z.object({ source: z.string() });

/** What a Markdown Resource's content resolves to: the source it shows. */
export interface MarkdownContent {
  readonly kind: 'markdown';
  readonly source: string;
  readonly via: ContentVia;
}

/**
 * The Markdown kind (ADR 0020): a content kind whose content is Markdown
 * source. Its content action is Edit.
 */
export const markdownKind = {
  id: 'markdown',
  contentSchema: markdownResourceContentSchema,
  flags: { takesResourceShape: false, canOpen: true },
  facts: { action: 'edit-markdown', embedsMap: false, drawsContentArea: true },
  resolveContent: (content, via) => ({ kind: 'markdown', source: content.source, via }),
} as const satisfies KindModule<
  'markdown',
  z.infer<typeof markdownResourceContentSchema>,
  MarkdownContent
>;

/** The Markdown kind's id. */
export type MarkdownKindId = typeof markdownKind.id;
