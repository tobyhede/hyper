export interface CardRendererProps {
  title: string;
  markdown: string;
  /** Rendered smaller when shown as a graph node vs. a presentation slide. */
  variant?: 'node' | 'slide';
}

/**
 * Renders a card's title and its Markdown **source**, verbatim and read-only.
 *
 * Opening a card is a view-source gesture, not a rendered read (ADR 0011): the
 * deck (`marked`) is the one place Markdown is parsed, so there is no second
 * renderer here to diverge from it. Do not reintroduce a Markdown parser on this
 * surface to show formatted prose — that re-creates exactly the divergence ADR
 * 0011 removed. To see a card rendered, present it.
 *
 * Pure presentation — no knowledge of the graph, React Flow, or navigation.
 */
export function CardRenderer({ title, markdown, variant = 'node' }: CardRendererProps) {
  return (
    <article className={`card card--${variant}`} data-testid="card">
      <h2 className="card__title">{title}</h2>
      <pre className="card__source">{markdown}</pre>
    </article>
  );
}
