import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface CardRendererProps {
  title: string;
  markdown: string;
  /** Rendered smaller when shown as a graph node vs. a presentation slide. */
  variant?: 'node' | 'slide';
}

/**
 * Renders a card's title and its markdown content. Pure presentation — no knowledge of
 * the graph, React Flow, or navigation.
 */
export function CardRenderer({ title, markdown, variant = 'node' }: CardRendererProps) {
  return (
    <article className={`card card--${variant}`} data-testid="card">
      <h2 className="card__title">{title}</h2>
      <div className="card__body">
        <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
      </div>
    </article>
  );
}
