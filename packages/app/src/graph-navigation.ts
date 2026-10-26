/**
 * Graph navigation over a drawn Graph: from one Resource to the next, the way
 * the canvas's Tab and arrow keys do (`.scratch/keyboard-shortcuts/issues/02-tab-walks-the-active-graph.md`,
 * `03-arrows-follow-the-graph.md`).
 *
 * Pure, over the Edges the canvas draws, so it answers in a node test. Only the
 * Active Graph's Edges are passed in: the keys follow that Graph and no other.
 */

export interface NavigatedEdge<Id extends string = string> {
  readonly source: Id;
  readonly target: Id;
}

/**
 * The Resource one step along the Graph from `from`: forward follows the first
 * outgoing Edge in the order the author drew them, as presenting's default move
 * does; back follows the first incoming Edge. `undefined` when there is none,
 * so the key is left to the browser and focus leaves the canvas.
 */
export function stepAlongGraph<Id extends string>(
  edges: readonly NavigatedEdge<Id>[],
  from: Id,
  direction: 'forward' | 'back',
): Id | undefined {
  if (direction === 'forward') return edges.find((edge) => edge.source === from)?.target;
  return edges.find((edge) => edge.target === from)?.source;
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

/** Where a run of Tab presses in one direction has been, ending at `at`. */
export interface TabRun<Id extends string = string> {
  readonly direction: 'forward' | 'back';
  readonly at: Id;
  readonly visited: readonly Id[];
}

/**
 * The next Resource a Tab press takes focus to, and the run that leaves, or
 * `undefined` when the key should be the browser's.
 *
 * A run goes on while each press starts where the last one ended and goes the
 * same way; anything else starts a new one at `from`. A press whose next
 * Resource the run has already visited ends it, so a cyclic Graph lets focus
 * leave the canvas after one lap rather than holding it.
 */
export function nextTabStop<Id extends string>(
  run: TabRun<Id> | null,
  edges: readonly NavigatedEdge<Id>[],
  from: Id,
  direction: 'forward' | 'back',
): { readonly to: Id; readonly run: TabRun<Id> } | undefined {
  const visited =
    run !== null && run.at === from && run.direction === direction ? run.visited : [from];
  const to = stepAlongGraph(edges, from, direction);
  if (to === undefined || visited.includes(to)) return undefined;
  return { to, run: { direction, at: to, visited: [...visited, to] } };
}
