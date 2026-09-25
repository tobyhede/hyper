import { ViewportPortal, useConnection } from '@xyflow/react';
import { CanvasResource } from '@project/ui';
import { RESOURCE_SIZE } from '../resource';
import { dropTarget, newResourceDrop, type ElementDropTarget } from '../edge-authoring';

export interface NewResourcePreviewProps {
  /** Exact neutral title the authored Resource will carry. */
  readonly title: string;
  /** Alt/Option, tracked on `window` so it survives leaving the canvas. */
  readonly modifierHeld: boolean;
  /** The container-local classification of what the pointer is over. */
  readonly pointerOver: ElementDropTarget;
  readonly accepts: (from: string) => boolean;
}

/**
 * The Resource an Alt-drop would author, drawn where it would land.
 *
 * The endpoint comes from `useConnection`, which converts it to flow coordinates
 * before handing it over — so this needs no `screenToFlowPosition` and no
 * viewport subscription to stay put under pan and zoom. Do not track the point
 * in component state: that re-renders the whole flow on every pointer frame.
 *
 * Both eligibility and position come from `newResourceDrop`, which the release asks
 * as well: the ghost cannot appear where a release would refuse, and cannot land
 * anywhere but where a release would put it. Each selector stays primitive —
 * returning the assembled gesture from one `useConnection` would hand the store
 * a fresh object every frame.
 */
export function NewResourcePreview({
  title,
  modifierHeld,
  pointerOver,
  accepts,
}: NewResourcePreviewProps) {
  const endpoint = useConnection((connection) => (connection.inProgress ? connection.to : null));
  const overNode = useConnection(
    (connection) => connection.inProgress && connection.toNode !== null,
  );
  const sourceId = useConnection((connection) =>
    connection.inProgress ? connection.fromNode.id : null,
  );
  const drop = newResourceDrop(
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
        className="new-resource-preview"
        data-testid="new-resource-preview"
        // A ghost of a Resource the author has not created. It draws through the
        // production `CanvasResource` so the preview and the rendered Resource cannot
        // drift, and that component names itself an `article` for the Resource it
        // is — which this is not one of yet. Hidden from the accessibility tree
        // so no Resource is announced before there is a Resource.
        aria-hidden="true"
        style={{
          transform: `translate(${drop.position.x}px, ${drop.position.y}px)`,
          width: RESOURCE_SIZE.width,
        }}
      >
        <CanvasResource
          front={{ kind: 'preview' }}
          state="rest"
          title={title}
          graphColor="var(--accent)"
        />
      </div>
    </ViewportPortal>
  );
}
