/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import type { ContentVia } from '../resource-content';
import { defineKind, type KindFileCodec } from './kind-module';

/** A Markdown Resource's content: the source its author wrote, which its file holds as the body. */
export const markdownResourceContentSchema = z.object({ source: z.string() }).strict();
type MarkdownResourceContent = z.infer<typeof markdownResourceContentSchema>;

/** The Markdown kind's id, declared before its module because the content it resolves to names it. */
const MARKDOWN_KIND_ID = 'markdown';

/** What a Markdown Resource's content resolves to: the source it shows. */
export interface MarkdownContent {
  readonly kind: typeof MARKDOWN_KIND_ID;
  readonly source: string;
  readonly via: ContentVia;
}

/** The media type of a Markdown Resource's sidecar (ADR 0128). */
export const MARKDOWN_MEDIA_TYPE = 'text/markdown';

/** The sidecar a Markdown Resource's file names: its own `<id>.md`, beside its Resource file. */
export const markdownSidecarPath = (id: string): string => `${id}.md`;

/**
 * A Markdown Resource's content as its Resource file holds it (ADR 0128): a
 * locator naming its sidecar, in place of the source the sidecar holds. The
 * media type compares case-insensitively; that the path is the Resource's own
 * `<id>.md` is the codec's to check, since the schema does not see the id.
 */
export const markdownFileContentSchema = z
  .object({
    path: z.string(),
    mediaType: z.string().refine((mediaType) => mediaType.toLowerCase() === MARKDOWN_MEDIA_TYPE, {
      message: `A Markdown Resource's sidecar is ${MARKDOWN_MEDIA_TYPE}`,
    }),
  })
  .strict();

/** A Markdown Resource's file holds a locator, and its source is the plain `<id>.md` beside it. */
const markdownFile: KindFileCodec<
  MarkdownResourceContent,
  z.infer<typeof markdownFileContentSchema>
> = {
  contentSchema: markdownFileContentSchema,
  sidecarNames: (id) => [markdownSidecarPath(id)],
  encode: (id, content) => {
    const path = markdownSidecarPath(id);
    return {
      content: { path, mediaType: MARKDOWN_MEDIA_TYPE },
      sidecars: [{ name: path, text: content.source }],
    };
  },
  decode: (id, content, sidecar) => {
    const own = markdownSidecarPath(id);
    if (content.path !== own) {
      return {
        ok: false,
        kind: 'invalid-resource-file',
        message: `content.path: a Markdown Resource's sidecar is its own "${own}", not "${content.path}"`,
      };
    }
    const source = sidecar(own);
    return source === undefined
      ? {
          ok: false,
          kind: 'missing-sidecar',
          message: `content.path: the sidecar "${own}" it names does not exist`,
        }
      : { ok: true, content: { source } };
  },
};

/** A Markdown Resource's content before its author writes any: a genuinely empty body. */
export const EMPTY_MARKDOWN: MarkdownResourceContent = { source: '' };

/**
 * The Markdown kind (ADR 0020): a content kind whose content is Markdown
 * source. Its content action is Edit, and Export writes its source with `\n`
 * line endings.
 */
export const markdownKind = defineKind({
  id: MARKDOWN_KIND_ID,
  contentSchema: markdownResourceContentSchema,
  flags: {
    takesResourceShape: false,
    canOpen: true,
    mayBeTarget: true,
    ownsReferencedSpaces: false,
  },
  facts: { action: 'edit-markdown', embedsMap: false, drawsContentArea: true },
  resolveContent: (content, via): MarkdownContent => ({
    kind: MARKDOWN_KIND_ID,
    source: content.source,
    via,
  }),
  canonicalContent: (content) => ({ source: content.source.replace(/\r\n?/g, '\n') }),
  file: markdownFile,
  newContent: EMPTY_MARKDOWN,
});

/** The Markdown kind's id. */
export type MarkdownKindId = typeof markdownKind.id;
