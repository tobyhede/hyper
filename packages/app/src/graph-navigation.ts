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
