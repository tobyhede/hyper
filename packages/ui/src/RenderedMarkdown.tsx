import { useMemo } from 'react';
import { marked, type TokensList } from 'marked';
import DOMPurify from 'dompurify';

interface RenderedMarkdownProps {
  readonly markdown: string;
  readonly className?: string;
  /**
   * A name already drawn above the body. A first heading that only repeats it
   * is left out, so a presented Resource whose source opens with its own Title
   * does not show the Title twice.
   */
  readonly drawnName?: string;
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
export function RenderedMarkdown({ markdown, className, drawnName }: RenderedMarkdownProps) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parser(withoutRepeatedName(marked.lexer(markdown), drawnName))),
    [markdown, drawnName],
  );

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

const comparable = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase();

/** The source's tokens without a first heading whose text is `name`, ignoring case and spacing. */
function withoutRepeatedName(tokens: TokensList, name: string | undefined): TokensList {
  if (name === undefined) return tokens;
  const first = tokens.findIndex((token) => token.type !== 'space');
  const heading = tokens[first];
  if (heading?.type !== 'heading') return tokens;
  // `marked`'s token union carries a generic member, so `text` is untyped here.
  if (comparable(String(heading.text)) !== comparable(name)) return tokens;
  return Object.assign(
    tokens.filter((_, index) => index !== first),
    { links: tokens.links },
  );
}
