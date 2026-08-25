import { useRef, useState } from 'react';
import type { Story } from '@ladle/react';
import { CanvasCard } from '@project/ui';
import { cardSizeVars } from '#src/card';

export default { title: 'Components/Card/Editing' };

/**
 * The Card's own title editor, entirely private to this component: begins from
 * the Title's native control, keeps a refused draft local with a field-local
 * error, completes and exits on Enter, cancels on Escape, and returns focus to
 * the Card around it.
 */
export const Title: Story = () => {
  const [title, setTitle] = useState('Draft entry');
  const [editing, setEditing] = useState(false);
  const group = useRef<HTMLDivElement>(null);

  return (
    <div style={cardSizeVars}>
      <div
        role="group"
        aria-label={`${title} on the canvas`}
        tabIndex={-1}
        ref={group}
        data-testid="card-group"
      >
        {editing ? (
          <CanvasCard
            front={{ kind: 'markdown' }}
            state="editing"
            title={title}
            graphColor="#ffc53d"
            onCompleteTitleEdit={(draft) => {
              if (draft.trim().length === 0) return 'A Card title is required.';
              setTitle(draft);
              setEditing(false);
              return null;
            }}
            onCancelTitleEdit={() => setEditing(false)}
            onReturnFocus={() => group.current?.focus()}
          />
        ) : (
          <CanvasCard
            front={{ kind: 'markdown' }}
            state="rest"
            title={title}
            graphColor="#ffc53d"
            onBeginTitleEdit={() => setEditing(true)}
          />
        )}
      </div>
    </div>
  );
};
