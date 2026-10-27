/**
 * Graph navigation over a drawn Graph: from one Resource to the next, the way
 * the canvas's arrow keys do (`.scratch/keyboard-shortcuts/issues/03-arrows-follow-the-graph.md`).
 *
 * Pure, over the Edges the canvas draws, so it answers in a node test. Only the
 * Active Graph's Edges are passed in: the keys follow that Graph and no other.
 */

export interface NavigatedEdge<Id extends string = string> {
  readonly source: Id;
  readonly target: Id;
}

/** The Resources one Edge away from `from`, either way, in Edge order and once each. */
export function graphNeighbours<Id extends string>(
  edges: readonly NavigatedEdge<Id>[],
  from: Id,
): readonly Id[] {
  const found: Id[] = [];
  for (const edge of edges) {
    const other =
      edge.source === from ? edge.target : edge.target === from ? edge.source : undefined;
    if (other !== undefined && other !== from && !found.includes(other)) found.push(other);
  }
  return found;
}

export type NavigationDirection = 'left' | 'right' | 'up' | 'down';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Screen axes: y grows downward, as the canvas draws it. */
const AXES = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
} as const satisfies Record<NavigationDirection, Point>;

/**
 * The candidate lying in `direction` from `from`, the way the canvas's arrow
 * keys follow a Graph (`.scratch/keyboard-shortcuts/issues/03-arrows-follow-the-graph.md`).
 *
 * A candidate lies that way when its centre is within 45° of the pressed axis,
 * so every candidate is reachable by at least one arrow. The one nearest the
 * axis wins, then the nearer one. `undefined` when none lies that way: the key
 * then does nothing rather than jumping to a Resource the Graph does not join.
 */
export function neighbourToward<Id extends string>(
  from: Point,
  candidates: readonly { readonly id: Id; readonly centre: Point }[],
  direction: NavigationDirection,
): Id | undefined {
  const axis = AXES[direction];
  let best: { readonly id: Id; readonly slope: number; readonly distance: number } | undefined;
  for (const candidate of candidates) {
    const dx = candidate.centre.x - from.x;
    const dy = candidate.centre.y - from.y;
    const along = dx * axis.x + dy * axis.y;
    const across = Math.abs(dx * axis.y - dy * axis.x);
    if (along <= 0 || across > along) continue;
    const slope = across / along;
    const distance = Math.hypot(dx, dy);
    if (
      best === undefined ||
      slope < best.slope ||
      (slope === best.slope && distance < best.distance)
    ) {
      best = { id: candidate.id, slope, distance };
    }
  }
  return best?.id;
}
