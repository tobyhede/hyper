import { useMemo } from 'react';
import { marked } from 'marked';

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
 * The HTML is inserted directly. A card's content is a local file the author
 * wrote and the app never loads a space it was not pointed at (ADR 0018), so the
 * markdown is as trusted as the code around it. That stops being true the day a
 * space can be fetched from somewhere, and this is the line that has to change.
 */
export function CardContent({ title, markdown }: CardContentProps) {
  const html = useMemo(() => marked.parse(markdown, { async: false }), [markdown]);

  return (
    <article className="card card--full" data-testid="card-content">
      <h2 className="card__title">{title}</h2>
      <div className="card__body" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
