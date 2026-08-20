import type { Story } from '@ladle/react';
import { Button, CanvasCard, ConnectIcon, EditIcon } from '@project/ui';
import { cardSizeVars } from '#src/card';

export default { title: 'Components/Canvas Card' };

/** The exported production component, shown across its authored kinds and states. */
export const States: Story = () => (
  <div className="flex flex-wrap gap-8 p-8" style={cardSizeVars}>
    <CanvasCard
      kind="markdown"
      state="rest"
      title="Strategies"
      graphColor="#ffc53d"
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="card__connect"
          aria-label="Connect from Strategies"
        >
          <ConnectIcon />
        </Button>
      }
    />
    <CanvasCard
      kind="markdown"
      state="selected"
      title="Traversal"
      graphColor="#ffc53d"
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            className="card__connect"
            aria-label="Connect from Traversal"
          >
            <ConnectIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="card__edit"
            aria-label="Edit Card Traversal"
          >
            <EditIcon />
          </Button>
        </>
      }
    />
    <CanvasCard
      kind="alias"
      state="selected-hover"
      title="Opening, again"
      aliasOf="Opening"
      graphColor="#35d6c3"
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="card__connect"
          aria-label="Connect from Opening, again"
        >
          <ConnectIcon />
        </Button>
      }
    />
    <CanvasCard kind="markdown" state="dragging" title="Closing" graphColor="#ffc53d" />
  </div>
);
