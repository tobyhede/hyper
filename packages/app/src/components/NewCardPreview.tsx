import { ViewportPortal, useConnection } from '@xyflow/react';
import { CanvasCard } from '@project/ui';
import { CARD_SIZE } from '../card';
import { newCardDrop, type DropTarget } from '../edge-authoring';

export interface NewCardPreviewProps {
  /** Exact neutral title the authored Card will carry. */
  readonly title: string;
  /** Alt/Option, tracked on `window` so it survives leaving the canvas. */
  readonly modifierHeld: boolean;
  /** The container-local classification of what the pointer is over. */
  readonly pointerOver: DropTarget;
  readonly accepts: (from: string) => boolean;
}

/**
 * The Card an Alt-drop would author, drawn where it would land.
 *
 * The endpoint comes from `useConnection`, which converts it to flow coordinates
 * before handing it over — so this needs no `screenToFlowPosition` and no
 * viewport subscription to stay put under pan and zoom. Tracking the point in
 * component state instead re-rendered the whole flow on every pointer frame.
 *
 * Both eligibility and position come from `newCardDrop`, which the release asks
 * as well: the ghost cannot appear where a release would refuse, and cannot land
 * anywhere but where a release would put it. Each selector stays primitive —
 * returning the assembled gesture from one `useConnection` would hand the store
 * a fresh object every frame.
 */
export function NewCardPreview({ title, modifierHeld, pointerOver, accepts }: NewCardPreviewProps) {
  const endpoint = useConnection((connection) => (connection.inProgress ? connection.to : null));
  const overNode = useConnection(
    (connection) => connection.inProgress && connection.toNode !== null,
  );
  const sourceId = useConnection((connection) =>
    connection.inProgress ? connection.fromNode.id : null,
  );
  const drop = newCardDrop(
    endpoint === null || sourceId === null
      ? { kind: 'idle' }
      : {
          kind: 'dragging',
          sourceId,
          point: endpoint,
          over: overNode ? 'connection-target' : pointerOver,
          modifierHeld,
        },
    accepts,
  );
  if (drop === null) return null;

  return (
    <ViewportPortal>
      <div
        className="new-card-preview"
        data-testid="new-card-preview"
        // A ghost of a Card the author has not created. It draws through the
        // production `CanvasCard` so the preview and the real thing cannot
        // drift, and that component names itself an `article` for the Card it
        // is — which this is not one of yet. Hidden from the accessibility tree
        // so no Card is announced before there is a Card.
        aria-hidden="true"
        style={{
          transform: `translate(${drop.position.x}px, ${drop.position.y}px)`,
          width: CARD_SIZE.width,
        }}
      >
        <CanvasCard
          front={{ kind: 'markdown' }}
          state="rest"
          title={title}
          graphColor="var(--accent)"
        />
      </div>
    </ViewportPortal>
  );
}
