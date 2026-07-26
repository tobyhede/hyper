import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export interface CardContentProps {
  title: string;
  markdown: string;
}

/**
 * Renders a card's title and its Markdown content, **parsed**.
 *
 * The counterpart to {@link CardRenderer}, which shows the source verbatim.
 * Opening a card is a view-source gesture and presenting is the one place a
 * card's Markdown is drawn rendered (ADR 0011) — the noun changed when the deck
 * went (ADR 0024), the distinction did not. This is now the only Markdown parser
 * in the app; do not add a second, which is the divergence ADR 0011 removed.
 *
 * **Sanitised before insertion.** This used to go in raw, on the reasoning that
 * a card is a local file the author wrote and the app never loads a space it was
 * not pointed at (ADR 0018). The reasoning was sound; the premise was not. The
 * save endpoint was reachable by DNS rebinding, so a page the author merely had
 * open could write a card into the space they *were* pointed at — and `marked`
 * has had no `sanitize` option since v5, so `<img src=x onerror=…>`, a
 * `javascript:` href and `<iframe src=javascript:>` all passed through intact
 * and ran in the dev server's origin.
 *
 * That hole is closed too (`vite-space-file-plugin.ts`), which is what makes
 * this defence in depth rather than the only thing holding. Keep both: the
 * trust argument recovers its premise only for as long as nothing else can
 * write a card, and "nothing else can write" is not a property to bet the
 * origin on.
 */
export function CardContent({ title, markdown }: CardContentProps) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(markdown, { async: false })),
    [markdown],
  );

  return (
    <article className="card card--full" data-testid="card-content">
      <h2 className="card__title">{title}</h2>
      <div className="card__body" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
