/**
 * The LayoutStrategy contract: a named strategy for arranging a space's resources.
 *
 * A strategy is behaviour; a **Map** (`@project/core`) is the authored data
 * one of them reads.
 *
 * Geometry lives as *optional fields on the elements* — a resource carries `x`/`y`
 * — and a strategy takes a layout-strategy graph and returns the same value with
 * those fields populated. There is no separate arranged-result type;
 * `CONTEXT.md` lists "arrangement" under _Avoid_ and ADR 0005 records why.
 *
 * **A strategy answers positions and nothing else (ADR 0086).** A Map stores
 * a Resource and its position, so there is nowhere for a port offset or an Edge's
 * waypoints to land — routed geometry could only ever have been render-time,
 * and an automatic arrangement is an Edit over a Map rather than a render
 * path. An Edge names no handle, and the side it attaches to is chosen while it
 * is drawn from where its two Resources are at that moment. So an Edge reaches a
 * strategy as the pair of Resources it joins, which is all a strategy reads.
 *
 * Which resources a strategy arranges is decided by the view before it runs. A
 * strategy is free to ignore parts of the graph it has no use for — a grid never
 * looks at the edges.
 */

import type { ResourceId } from '@project/core';
import type { GraphRenderEdge } from './graph-rendering';

export interface LayoutStrategyResource {
  id: ResourceId;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface LayoutStrategyEdge {
  id: string;
  source: ResourceId;
  target: ResourceId;
}

export interface LayoutStrategyGraph {
  resources: LayoutStrategyResource[];
  edges: LayoutStrategyEdge[];
}

/**
 * A layout strategy: takes a graph and returns it with geometry filled in.
 *
 * Always async. Both strategies (grid, positioned) are arithmetic and resolve
 * immediately, but an engine-backed one is inherently asynchronous and ADR 0086
 * has Auto-arrange returning as an Edit that runs one — so every caller handles
 * a single shape. Do not collapse this to sync: `placement-rendering.ts` awaits
 * it.
 */
export type LayoutStrategy = (strategyGraph: LayoutStrategyGraph) => Promise<LayoutStrategyGraph>;

/**
 * Assemble the graph to arrange, from resources the view has already chosen plus the
 * edges derived from the graphs running through them.
 */
export function buildLayoutStrategyGraph(
  resourceIds: readonly ResourceId[],
  edges: readonly GraphRenderEdge[],
  sizeOf: (resourceId: ResourceId) => { width: number; height: number },
): LayoutStrategyGraph {
  const visible = new Set(resourceIds);

  return {
    resources: resourceIds.map((id) => {
      const resourceSize = sizeOf(id);
      return { id, width: resourceSize.width, height: resourceSize.height };
    }),
    edges: edges
      .filter((e) => visible.has(e.source) && visible.has(e.target))
      .map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}
