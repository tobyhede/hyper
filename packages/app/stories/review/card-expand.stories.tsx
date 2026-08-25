import type { CSSProperties } from 'react';
import type { Story } from '@ladle/react';
import { CanvasCard, MarkdownCardBody } from '@project/ui';

export default { title: 'Review/Card' };

type CardFrameStyle = CSSProperties & {
  readonly '--card-width': string;
  readonly '--card-height': string;
};

const compactFrame: CardFrameStyle = {
  '--card-width': '240px',
  '--card-height': '135px',
};

const expandedFrame: CardFrameStyle = {
  '--card-width': '480px',
  '--card-height': '360px',
  width: '480px',
  height: '360px',
};

const markdown = `## Placement is authored

A **Layout** owns explicit Card rects. The strategy only supplies a computed View.

- Open in place
- Edit the source
- Keep the canvas beneath it`;

function ExpandedCard({ title, source }: { readonly title: string; readonly source: string }) {
  return (
    <div style={expandedFrame}>
      <CanvasCard
        front={{ kind: 'markdown' }}
        state="rest"
        title={title}
        graphColor="#ffc53d"
        content={<MarkdownCardBody source={source} ariaLabel={`Markdown source of ${title}`} />}
      />
    </div>
  );
}

export const Expand: Story = () => (
  <div className="flex flex-wrap items-start gap-8 p-8">
    <section aria-label="Compact Card" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Compact</p>
      <div style={compactFrame}>
        <CanvasCard
          front={{ kind: 'markdown' }}
          state="rest"
          title="Strategies"
          graphColor="#ffc53d"
        />
      </div>
    </section>
    <section aria-label="Expanded Card" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Expanded</p>
      <ExpandedCard title="Strategies" source={markdown} />
    </section>
    <section aria-label="Long Expanded Card" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Long Markdown</p>
      <ExpandedCard
        title="Long Markdown"
        source={`${markdown}\n\n### A deliberately long section\n\n${markdown}\n\n${markdown}`}
      />
    </section>
  </div>
);
