import type { Manifest } from '@project/core';

/**
 * Derives the graph's ports and connections from its presentation paths.
 *
 * The model: every path that steps through a card gives that card one inbound
 * port (`<pathId>::in`, on the left) and one outbound port (`<pathId>::out`, on
 * the right). Consecutive steps become a port-to-port edge belonging to that
 * path. This is what makes each path render as its own "rail" through the graph
 * and drives the ELK multiple-handles layout.
 */

export interface PathHandleRef {
  /** Handle id, also used as the ELK port id. */
  id: string;
  pathId: string;
}

export interface CardHandleSet {
  /** Outbound ports (right / EAST). */
  sourceHandles: PathHandleRef[];
  /** Inbound ports (left / WEST). */
  targetHandles: PathHandleRef[];
}

export interface PathEdge {
  id: string;
  pathId: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  /** Index of the originating step within the path. */
  stepIndex: number;
}

export const outHandleId = (pathId: string): string => `${pathId}::out`;
export const inHandleId = (pathId: string): string => `${pathId}::in`;

/** Map each card id to the in/out ports contributed by the paths through it. */
export function buildCardHandles(manifest: Manifest): Map<string, CardHandleSet> {
  const map = new Map<string, CardHandleSet>();
  const ensure = (cardId: string): CardHandleSet => {
    let set = map.get(cardId);
    if (!set) {
      set = { sourceHandles: [], targetHandles: [] };
      map.set(cardId, set);
    }
    return set;
  };

  for (const path of manifest.paths) {
    path.steps.forEach((step, index) => {
      const set = ensure(step.target);
      const isFirst = index === 0;
      const isLast = index === path.steps.length - 1;

      if (!isLast) {
        const id = outHandleId(path.id);
        if (!set.sourceHandles.some((h) => h.id === id)) {
          set.sourceHandles.push({ id, pathId: path.id });
        }
      }
      if (!isFirst) {
        const id = inHandleId(path.id);
        if (!set.targetHandles.some((h) => h.id === id)) {
          set.targetHandles.push({ id, pathId: path.id });
        }
      }
    });
  }

  return map;
}

/** The distinct card ids a path visits, in first-visit order. */
export function pathCardIds(manifest: Manifest, pathId: string): string[] {
  const path = manifest.paths.find((p) => p.id === pathId);
  if (!path) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const step of path.steps) {
    if (!seen.has(step.target)) {
      seen.add(step.target);
      ids.push(step.target);
    }
  }
  return ids;
}

/** Keep only the handles belonging to a single path. */
export function filterHandlesByPath(
  handlesByCard: ReadonlyMap<string, CardHandleSet>,
  pathId: string,
): Map<string, CardHandleSet> {
  const filtered = new Map<string, CardHandleSet>();
  for (const [cardId, set] of handlesByCard) {
    const sourceHandles = set.sourceHandles.filter((h) => h.pathId === pathId);
    const targetHandles = set.targetHandles.filter((h) => h.pathId === pathId);
    if (sourceHandles.length || targetHandles.length) {
      filtered.set(cardId, { sourceHandles, targetHandles });
    }
  }
  return filtered;
}

/** Build the colored port-to-port edges implied by each path's step order. */
export function buildPathEdges(manifest: Manifest): PathEdge[] {
  const edges: PathEdge[] = [];

  for (const path of manifest.paths) {
    for (let i = 0; i < path.steps.length - 1; i += 1) {
      const from = path.steps[i];
      const to = path.steps[i + 1];
      if (!from || !to) continue;
      edges.push({
        id: `${path.id}::${i}`,
        pathId: path.id,
        source: from.target,
        target: to.target,
        sourceHandle: outHandleId(path.id),
        targetHandle: inHandleId(path.id),
        stepIndex: i,
      });
    }
  }

  return edges;
}
