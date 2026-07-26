import type { ReactNode } from 'react';
import { CardRenderer } from '@project/ui';

export interface OpenCardProps {
  title: string;
  markdown: string;
  /** Actions for this card — a close button, say. */
  footer: ReactNode;
}

/**
 * A card opened over the graph.
 *
 * The graph draws titles (ADR 0006); this is where a card is opened. Opening is
 * a view-source gesture — `CardRenderer` shows the Markdown verbatim, not
 * rendered (ADR 0011). Presenting is the other half of that distinction and is
 * where a card is drawn *rendered*; it walks the route on the graph canvas
 * rather than on a surface of its own (ADR 0024, 0027).
 *
 * Kept free of route concepts, so a space card opened to explore its nested
 * graph (ADR 0001) can reuse the shell.
 */
export function OpenCard({ title, markdown, footer }: OpenCardProps) {
  return (
    <div className="open-card" data-testid="open-card">
      <div className="open-card__panel">
        <div className="open-card__content">
          <CardRenderer title={title} markdown={markdown} variant="full" />
        </div>
        <div className="open-card__actions">{footer}</div>
      </div>
    </div>
  );
}
