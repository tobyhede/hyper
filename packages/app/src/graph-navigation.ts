/**
 * Graph navigation over a drawn Graph: from one Resource to the next, the way
 * the canvas's Tab does (`.scratch/keyboard-shortcuts/issues/02-tab-walks-the-active-graph.md`).
 *
 * Pure, over the Edges the canvas draws, so it answers in a node test. Only the
 * Active Graph's Edges are passed in: Tab follows that Graph and no other.
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
