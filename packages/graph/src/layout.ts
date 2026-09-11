/**
 * The LayoutStrategy contract: a named strategy for arranging a space's things.
 *
 * A strategy is behaviour; a **Diagram** (`@project/core`) is the authored data
 * one of them reads. ADR 0005 gave the strategy the noun that is now the
 * Diagram's, which ADR 0014 corrected once the authored kind became a value
 * you can hold.
 *
 * Geometry lives as *optional fields on the elements* — a thing carries `x`/`y`
 * — and a strategy takes a layout-strategy graph and returns the same value with
 * those fields populated. There is no separate arranged-result type;
 * `CONTEXT.md` lists "arrangement" under _Avoid_ and ADR 0005 records why.
 *
 * **A strategy answers positions and nothing else (ADR 0086).** A Diagram stores
 * a Thing and its position, so there is nowhere for a port offset or an Edge's
 * waypoints to land — routed geometry could only ever have been render-time,
 * and an automatic arrangement is an Edit over a Diagram rather than a render
 * path. The contract carried both until then and neither had a consumer; where
 * an Edge attaches is the render layer's own question (`.scratch/edge-attachment/`).
 *
 * Which things a strategy arranges is decided by the view before it runs. A
 * strategy is free to ignore parts of the graph it has no use for — a grid never
 * looks at the edges.
 */

import type { ThingId } from '@project/core';
import type { GraphRenderEdge } from './graph-rendering';

export interface LayoutStrategyThing {
  id: ThingId;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface LayoutStrategyEdge {
  id: string;
  source: ThingId;
  target: ThingId;
  sourceHandle: string;
  targetHandle: string;
}

export interface LayoutStrategyGraph {
  things: LayoutStrategyThing[];
  edges: LayoutStrategyEdge[];
}

/**
 * A layout strategy: takes a graph and returns it with geometry filled in.
 *
 * Always async, and it stays that way with no engine in the tree. Both surviving
 * strategies (grid, positioned) are arithmetic and resolve immediately, but an
 * engine-backed one is inherently asynchronous and ADR 0086 has Auto-arrange
 * returning as an Edit that runs one — so every caller handles a single shape.
 * Do not collapse this to sync: `placement-rendering.ts` awaits it. The type once carried a
 * `LayoutStrategyGraph | Promise<LayoutStrategyGraph>` union, but nothing exercised the sync
 * branch — `App` awaited every strategy regardless — so it was collapsed to
 * async-only (`.scratch/layout-seam/issues/06-revisit-async-optionality.md`).
 */
export type LayoutStrategy = (strategyGraph: LayoutStrategyGraph) => Promise<LayoutStrategyGraph>;

/**
 * Assemble the graph to arrange, from things the view has already chosen plus the
 * edges derived from the graphs running through them.
 */
export function buildLayoutStrategyGraph(
  thingIds: readonly ThingId[],
  edges: readonly GraphRenderEdge[],
  sizeOf: (thingId: ThingId) => { width: number; height: number },
): LayoutStrategyGraph {
  const visible = new Set(thingIds);

  return {
    things: thingIds.map((id) => {
      const thingSize = sizeOf(id);
      return { id, width: thingSize.width, height: thingSize.height };
    }),
    edges: edges
      .filter((e) => visible.has(e.source) && visible.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
  };
}
