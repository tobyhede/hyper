import { ViewportPortal, useConnection } from '@xyflow/react';
import { CanvasThing } from '@project/ui';
import { THING_SIZE } from '../thing';
import { dropTarget, newThingDrop, type ElementDropTarget } from '../edge-authoring';

export interface NewThingPreviewProps {
  /** Exact neutral title the authored Thing will carry. */
  readonly title: string;
  /** Alt/Option, tracked on `window` so it survives leaving the canvas. */
  readonly modifierHeld: boolean;
  /** The container-local classification of what the pointer is over. */
  readonly pointerOver: ElementDropTarget;
  readonly accepts: (from: string) => boolean;
}

/**
 * The Thing an Alt-drop would author, drawn where it would land.
 *
 * The endpoint comes from `useConnection`, which converts it to flow coordinates
 * before handing it over — so this needs no `screenToFlowPosition` and no
 * viewport subscription to stay put under pan and zoom. Tracking the point in
 * component state instead re-rendered the whole flow on every pointer frame.
 *
 * Both eligibility and position come from `newThingDrop`, which the release asks
 * as well: the ghost cannot appear where a release would refuse, and cannot land
 * anywhere but where a release would put it. Each selector stays primitive —
 * returning the assembled gesture from one `useConnection` would hand the store
 * a fresh object every frame.
 */
export function NewThingPreview({
  title,
  modifierHeld,
  pointerOver,
  accepts,
}: NewThingPreviewProps) {
  const endpoint = useConnection((connection) => (connection.inProgress ? connection.to : null));
  const overNode = useConnection(
    (connection) => connection.inProgress && connection.toNode !== null,
  );
  const sourceId = useConnection((connection) =>
    connection.inProgress ? connection.fromNode.id : null,
  );
  const drop = newThingDrop(
    endpoint === null || sourceId === null
      ? { kind: 'idle' }
      : {
          kind: 'dragging',
          sourceId,
          point: endpoint,
          over: dropTarget({ connectionTarget: overNode, element: pointerOver }),
          modifierHeld,
        },
    accepts,
  );
  if (drop === null) return null;

  return (
    <ViewportPortal>
      <div
        className="new-thing-preview"
        data-testid="new-thing-preview"
        // A ghost of a Thing the author has not created. It draws through the
        // production `CanvasThing` so the preview and the real thing cannot
        // drift, and that component names itself an `article` for the Thing it
        // is — which this is not one of yet. Hidden from the accessibility tree
        // so no Thing is announced before there is a Thing.
        aria-hidden="true"
        style={{
          transform: `translate(${drop.position.x}px, ${drop.position.y}px)`,
          width: THING_SIZE.width,
        }}
      >
        <CanvasThing
          front={{ kind: 'preview' }}
          state="rest"
          title={title}
          graphColor="var(--accent)"
        />
      </div>
    </ViewportPortal>
  );
}
