/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import type { ContentVia } from '../resource-content';
import type { ContentOwnerKindModule } from './kind-module';

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
  flags: {
    takesResourceShape: false,
    canOpen: true,
    mayBeTarget: true,
    ownsReferencedSpaces: false,
  },
  facts: { action: 'edit-markdown', embedsMap: false, drawsContentArea: true },
  resolveContent: (content, via) => ({ kind: 'markdown', source: content.source, via }),
} as const satisfies ContentOwnerKindModule<
  'markdown',
  z.infer<typeof markdownResourceContentSchema>,
  MarkdownContent
>;

/** The Markdown kind's id. */
export type MarkdownKindId = typeof markdownKind.id;

/** The media type of a Markdown Resource's sidecar (ADR 0128). */
export const MARKDOWN_MEDIA_TYPE = 'text/markdown';

/** The sidecar a Markdown Resource's file names: its own `<id>.md`, beside its Resource file. */
export const markdownSidecarPath = (id: string): string => `${id}.md`;

/**
 * A Markdown Resource's content as its Resource file holds it (ADR 0128): a
 * locator naming its sidecar, in place of the source the sidecar holds. The
 * media type compares case-insensitively; that the path is the Resource's own
 * `<id>.md` is intake's to check, since the schema does not see the id.
 */
export const markdownFileContentSchema = z
  .object({
    path: z.string(),
    mediaType: z.string().refine((mediaType) => mediaType.toLowerCase() === MARKDOWN_MEDIA_TYPE, {
      message: `A Markdown Resource's sidecar is ${MARKDOWN_MEDIA_TYPE}`,
    }),
  })
  .strict();
