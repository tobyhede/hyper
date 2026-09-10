/**
 * The LayoutStrategy contract: a named strategy for arranging a space's things.
 *
 * A strategy is behaviour; a **Diagram** (`@project/core`) is the authored data
 * one of them reads. ADR 0005 gave the strategy the noun that is now the
 * Diagram's, which ADR 0014 corrected once the authored kind became a value
 * you can hold.
 *
 * Modelled on how ELK does it, deliberately. Geometry lives as *optional fields
 * on the elements* — a thing carries `x`/`y`, a port carries its offset — and a
 * strategy takes a layout-strategy graph and returns the same value with those fields populated.
 * There is no separate arranged-result type; `CONTEXT.md` lists "arrangement"
 * under _Avoid_ and ADR 0005 records why.
 *
 * Which things a strategy arranges is decided by the view before it runs. A
 * strategy is free to ignore parts of the graph it has no use for — a grid never
 * looks at the edges, exactly as ELK's own algorithms differ in what they
 * consume.
 */

import type { ThingId } from '@project/core';
import type { ThingHandleSet, GraphRenderEdge } from './graph-rendering';

/** A port on a thing, by the handle id the render layer knows it by. */
export interface LayoutStrategyPort {
  id: string;
  /** Inbound ports sit on the thing's left, outbound on its right. */
  side: 'in' | 'out';
  /** Offset from the thing's top-left corner, once a strategy has placed it. */
  x?: number;
  y?: number;
}

export interface LayoutStrategyThing {
  id: ThingId;
  width: number;
  height: number;
  ports: LayoutStrategyPort[];
  x?: number;
  y?: number;
}

/**
 * A coordinate a strategy computed. Engine output, not authored content: no
 * author wrote one, no schema parses one, and nothing round-trips one to disk.
 *
 * Deliberately **not** `core`'s `DiagramPosition`, which is what an author
 * stored in a Diagram. The two were one type until ADR 0085 split them, and the
 * comment that used to stand here recorded why that was wrong while deferring
 * the call: a constraint added to `diagramPositionSchema` for the sake of
 * authored placement — a bound, an integer, a non-negative x — would have
 * landed here too, silently, on geometry the constraint has nothing to say
 * about. ADR 0038 said a point has one type and this does not reopen it; these
 * were never one point.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * A routed span of an edge: where it starts, where it ends, and the corners it
 * turns through in between. Mirrors ELK's `ElkEdgeSection` — an orthogonal
 * back-edge routes *around* the things as a channel rather than cutting straight
 * across them, and the bend points are how it does that.
 */
export interface LayoutStrategyEdgeSection {
  startPoint: Point;
  endPoint: Point;
  bendPoints?: Point[];
}

export interface LayoutStrategyEdge {
  id: string;
  source: ThingId;
  target: ThingId;
  sourceHandle: string;
  targetHandle: string;
  /**
   * The routed geometry, once a routing strategy has placed it. Optional like the
   * things' `x`/`y`: a routing strategy (ELK) populates it; a placement-only one
   * (grid) leaves it undefined and the render layer falls back to a plain curve.
   */
  sections?: LayoutStrategyEdgeSection[];
}

export interface LayoutStrategyGraph {
  things: LayoutStrategyThing[];
  edges: LayoutStrategyEdge[];
}

/**
 * A layout strategy: takes a graph and returns it with geometry filled in.
 *
 * Always async. Engine-backed strategies (ELK) are inherently asynchronous; the
 * arithmetic ones (grid, positioned) resolve immediately but still return a
 * promise, so every caller handles a single shape. The type once carried a
 * `LayoutStrategyGraph | Promise<LayoutStrategyGraph>` union, but nothing exercised the sync
 * branch — `App` awaited every strategy regardless — so it was collapsed to
 * async-only (`.scratch/layout-seam/issues/06-revisit-async-optionality.md`).
 */
export type LayoutStrategy = (strategyGraph: LayoutStrategyGraph) => Promise<LayoutStrategyGraph>;

/**
 * Assemble the graph to arrange, from things the view has already chosen plus the
 * handles and edges derived from the graphs running through them.
 */
export function buildLayoutStrategyGraph(
  thingIds: readonly ThingId[],
  handlesByThing: ReadonlyMap<ThingId, ThingHandleSet>,
  edges: readonly GraphRenderEdge[],
  sizeOf: (thingId: ThingId) => { width: number; height: number },
): LayoutStrategyGraph {
  const visible = new Set(thingIds);

  return {
    things: thingIds.map((id) => {
      const handles = handlesByThing.get(id);
      const thingSize = sizeOf(id);
      return {
        id,
        width: thingSize.width,
        height: thingSize.height,
        ports: [
          ...(handles?.targetHandles ?? []).map((h) => ({ id: h.id, side: 'in' as const })),
          ...(handles?.sourceHandles ?? []).map((h) => ({ id: h.id, side: 'out' as const })),
        ],
      };
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
