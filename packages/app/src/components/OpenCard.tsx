import { CardRenderer, Button } from '@project/ui';

export interface OpenCardProps {
  title: string;
  markdown: string;
  onClose: () => void;
}

/**
 * A card opened for reading, shown over the graph.
 *
 * The graph draws titles (ADR 0006); this is where a card's content is actually
 * read. Kept free of route and step concepts — opening a card is not presenting,
 * and a space card opened to explore its nested graph should be able to reuse
 * this shell.
 */
export function OpenCard({ title, markdown, onClose }: OpenCardProps) {
  return (
    <div className="open-card" data-testid="open-card">
      <div className="open-card__panel">
        <CardRenderer title={title} markdown={markdown} variant="slide" />
        <div className="open-card__actions">
          <Button variant="secondary" data-testid="close-card" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
