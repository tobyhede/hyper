import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface RenderedMarkdownProps {
  readonly markdown: string;
  readonly className?: string;
}

/**
 * The one Markdown parser and sanitiser shared by every rendered Resource body,
 * presented and Open alike. Editing swaps an Open body for
 * `MarkdownSourceEditor`, the one place source is shown. This module is the
 * app's only Markdown parser; do not add a second, or the rendered and
 * presented forms of one Resource can diverge.
 *
 * **Sanitised before insertion.** A Resource body is untrusted input: it arrives
 * from a database over HTTP, and `POST /api/spaces` accepts a commit carrying
 * Resource bodies without checking Origin or Host, so a page in the author's
 * browser that can reach the host can write one. `marked` has no `sanitize`
 * option, so `<img src=x onerror=…>`, a `javascript:` href and
 * `<iframe src=javascript:>` would otherwise run in the app's origin. Do not
 * insert parsed Markdown without passing it through DOMPurify.
 */
export function RenderedMarkdown({ markdown, className }: RenderedMarkdownProps) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(markdown, { async: false })),
    [markdown],
  );

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
