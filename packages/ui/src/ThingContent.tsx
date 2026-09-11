import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { titleName } from '@project/core';

export interface ThingContentProps {
  /**
   * The Thing's Title, whole. Presenting draws its **name** — the first line —
   * because the Title ladder belongs to the Thing front and nothing else
   * (ADR 0083), and a presented Thing is a different surface with a different
   * frame around it.
   */
  title: string;
  markdown: string;
}

interface RenderedMarkdownProps {
  readonly markdown: string;
  readonly className?: string;
}

/**
 * The one Markdown parser and sanitiser shared by every rendered Thing body.
 *
 * Kept separate from {@link ThingContent} so an Expanded Thing can reuse the
 * presentation-mode rendering without also drawing presentation mode's title
 * and outer frame.
 */
export function RenderedMarkdown({ markdown, className }: RenderedMarkdownProps) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(markdown, { async: false })),
    [markdown],
  );

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Renders a thing's title and its Markdown content, **parsed**.
 *
 * The counterpart to the opened Thing's editor, which shows the source verbatim
 * in a `<textarea>`. There is no second component beside this one: the
 * `ThingRenderer` that drew source in a `<pre>` went with the reading surface
 * (ADR 0037), leaving the editor as the only place source is shown.
 * Opening a thing is a view-source gesture and presenting is the one place a
 * thing's Markdown is drawn rendered (ADR 0011) — the noun changed when the deck
 * went (ADR 0024), the distinction did not. This is now the only Markdown parser
 * in the app; do not add a second, which is the divergence ADR 0011 removed.
 *
 * **Sanitised before insertion.** This used to go in raw, on the reasoning that
 * a thing is a local file the author wrote and the app never loads a space it was
 * not pointed at (ADR 0018). The reasoning was sound; the premise was not. The
 * save endpoint was reachable by DNS rebinding, so a page the author merely had
 * open could write a thing into the space they *were* pointed at — and `marked`
 * has had no `sanitize` option since v5, so `<img src=x onerror=…>`, a
 * `javascript:` href and `<iframe src=javascript:>` all passed through intact
 * and ran in the dev server's origin.
 *
 * The file write-back went with ADR 0030, but the premise did not come back with
 * it: `PUT /api/spaces/:id` accepts a whole snapshot, thing bodies included, and
 * checks neither Origin nor Host. A write path a page in the author's browser
 * can reach is still a write path, so this is not defence in depth behind a
 * closed hole — it is load-bearing. Thing bodies now arrive from a database over
 * HTTP, which is not a property to bet the origin on either.
 */
export function ThingContent({ title, markdown }: ThingContentProps) {
  return (
    <article className="thing thing--full" data-testid="thing-content">
      <h2 className="thing__title">{titleName(title)}</h2>
      <RenderedMarkdown className="thing__body" markdown={markdown} />
    </article>
  );
}
