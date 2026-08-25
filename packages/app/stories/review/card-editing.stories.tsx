import { useState, type CSSProperties } from 'react';
import type { Story } from '@ladle/react';
import { Button, CanvasCard, MarkdownCardBody } from '@project/ui';

export default { title: 'Review/Card/Editing' };

type CardFrameStyle = CSSProperties & {
  readonly '--card-width': string;
  readonly '--card-height': string;
};

const frame: CardFrameStyle = {
  '--card-width': '480px',
  '--card-height': '360px',
  width: '480px',
  height: '360px',
};

const markdown = `## Placement is authored

A **Layout** owns explicit Card rects. The strategy only supplies a computed View.`;

type Mode = 'rendered' | 'focused' | 'unfocused';

export const Markdown: Story = () => {
  const [source, setSource] = useState(markdown);
  const [mode, setMode] = useState<Mode>('rendered');
  const editing = mode !== 'rendered';

  const body = editing ? (
    <MarkdownCardBody
      source={source}
      ariaLabel="Markdown source of Strategies"
      onBeginEdit={() => setMode('focused')}
      autoFocus={mode === 'focused'}
      editor={{
        onComplete: setSource,
        onEnd: () => setMode('rendered'),
      }}
    />
  ) : (
    <MarkdownCardBody
      source={source}
      ariaLabel="Markdown source of Strategies"
      onBeginEdit={() => setMode('focused')}
    />
  );

  return (
    <div className="flex flex-col items-start gap-3 p-8">
      <div className="flex gap-2" aria-label="Markdown editing state">
        <Button type="button" variant="ghost" onClick={() => setMode('rendered')}>
          Rendered
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode('focused')}>
          Focused edit
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode('unfocused')}>
          Unfocused edit
        </Button>
      </div>
      <div style={frame}>
        <CanvasCard
          front={{ kind: 'markdown' }}
          state="rest"
          title="Strategies"
          graphColor="#ffc53d"
          content={body}
          onBeginContentEdit={() => setMode('focused')}
        />
      </div>
    </div>
  );
};
