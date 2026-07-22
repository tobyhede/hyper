import type { ReactNode } from 'react';
import { CardRenderer } from '@project/ui';

export interface OpenCardProps {
  title: string;
  markdown: string;
  /** Actions for this card: a close button, or the presentation step controls. */
  footer: ReactNode;
}

/**
 * A card opened over the graph.
 *
 * The graph draws titles (ADR 0006); this is where a card is opened. Opening is
 * a view-source gesture — `CardRenderer` shows the Markdown verbatim, not
 * rendered (ADR 0011). Presenting is a separate surface, a reveal.js deck, and
 * the only place a card is drawn rendered (ADR 0008).
 *
 * Kept free of route and step concepts, so a space card opened to explore its
 * nested graph (ADR 0001) can reuse the shell.
 */
export function OpenCard({ title, markdown, footer }: OpenCardProps) {
  return (
    <div className="open-card" data-testid="open-card">
      <div className="open-card__panel">
        <div className="open-card__content">
          <CardRenderer title={title} markdown={markdown} variant="slide" />
        </div>
        <div className="open-card__actions">{footer}</div>
      </div>
    </div>
  );
}
