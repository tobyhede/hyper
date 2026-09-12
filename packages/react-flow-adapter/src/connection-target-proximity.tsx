import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';
import { useStore } from '@xyflow/react';
import {
  CONNECTION_TARGET_PROXIMITY,
  connectionPointerInFlow,
  isNearConnectionTarget,
  type CanvasPoint,
  type CanvasRect,
} from './connection-target-reveal';

/**
 * Pure half of the proximity magnet: whether the live connection pointer is
 * within range of a node's axis-aligned bounds.
 */
export function connectionTargetProximity(
  inProgress: boolean,
  pointer: CanvasPoint | null,
  bounds: CanvasRect | null,
): boolean {
  if (!inProgress || pointer === null || bounds === null) return false;
  return isNearConnectionTarget(pointer, bounds, CONNECTION_TARGET_PROXIMITY);
}

/**
 * Node ids whose seeking-end handles may be revealed for the live connection
 * pointer — computed once per store update rather than once per Thing.
 *
 * Absent (null) means no provider: seeking reveal stays off. Production always
 * provides through Edge Authoring's `provide`; unit tests mock
 * {@link useConnectionTargetProximity} instead of mounting this.
 */
const ConnectionTargetNearIdsContext = createContext<ReadonlySet<string> | null>(null);

const EMPTY_NEAR: ReadonlySet<string> = new Set();

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
}

/**
 * One React Flow store subscription that answers which Things are within the
 * product proximity magnet. `ThingNode` reads membership; it does not subscribe.
 */
export function ConnectionTargetProximityProvider({ children }: { readonly children: ReactNode }) {
  const retained = useRef(EMPTY_NEAR);
  const nearIds = useStore(
    useCallback((state) => {
      const { connection } = state;
      if (!connection.inProgress) {
        return retained.current.size === 0 ? retained.current : EMPTY_NEAR;
      }
      // `connection.pointer` is container coordinates (see XYHandle's
      // `getEventPosition`); node `positionAbsolute` is flow coordinates. Convert
      // before measuring AABB distance or every Thing looks far away.
      const pointer = connectionPointerInFlow(connection.pointer, state.transform);
      const next = new Set<string>();
      for (const [id, node] of state.nodeLookup) {
        const width = node.measured.width ?? node.width ?? 0;
        const height = node.measured.height ?? node.height ?? 0;
        if (
          connectionTargetProximity(true, pointer, {
            x: node.internals.positionAbsolute.x,
            y: node.internals.positionAbsolute.y,
            width,
            height,
          })
        ) {
          next.add(id);
        }
      }
      if (sameSet(retained.current, next)) return retained.current;
      retained.current = next;
      return next;
    }, []),
  );

  return (
    <ConnectionTargetNearIdsContext.Provider value={nearIds}>
      {children}
    </ConnectionTargetNearIdsContext.Provider>
  );
}

/** Whether the live connection pointer is within the product proximity of this Thing. */
export function useConnectionTargetProximity(nodeId: string): boolean {
  const nearIds = useContext(ConnectionTargetNearIdsContext);
  return nearIds?.has(nodeId) ?? false;
}
