# Render ELK's edge routing instead of default beziers

Status: resolved
Blocked by: 02 (resolved), 07 (resolved)

## Context

ELK computes routed edge geometry, and the app throws it away. `getElkLayout` reads only `layouted.children` (node boxes and port offsets) and never touches `layouted.edges`. React Flow then draws its own default bezier between the ELK-placed handles, knowing nothing about the other cards or ELK's routed path.

Consequence: a back-edge (target physically left of source) forces the bezier out rightward and hooks it back to a left-side handle, so it curls into itself and reads as a broken stub. ELK had already routed that edge sanely. See `.scratch/multiple-routes/findings.md` Finding 4 — same layout, opposite legibility.

## Task

Return `edge.sections` from the layout and draw them with a custom React Flow edge type.

## Acceptance

- Back-edges read as channels routing around the cards rather than stubs.
- Compatible (acyclic) route sets look no worse.
- Prerequisite for any view that shows conflicting routes together (ADR 0003).

## Answer

Resolved. The `Layout` contract now carries routed geometry as optional fields on
the edge — `LayoutEdge.sections` (`{ startPoint, endPoint, bendPoints? }`,
mirroring ELK's `ElkEdgeSection`) — the same "geometry lands on the elements"
shape ADR 0005 already uses for a card's `x`/`y`, so no new contract type and no
new ADR. A placement-only layout (`gridLayout`) simply leaves it undefined.

- `elkLayout` reads `laid.edges` and maps ELK's `sections` back onto each edge.
  `elk.edgeRouting: ORTHOGONAL` is now stated explicitly in the options (it was
  ELK's default; we now actually consume it).
- New `RoutedEdge` custom edge (`react-flow-adapter`), registered via `edgeTypes`
  alongside `nodeTypes` and wired into `GraphView`. It draws the flattened
  `start → bends → end` polyline; ELK's points share the node-position coordinate
  space, so they map straight onto React Flow's. It falls back to a bezier when a
  layout placed no routing (grid) or before ELK resolves on first paint.
- `projectRouteEdges` takes the laid-out graph, looks the routing up by edge id,
  and hands the points to the edge via `data`.

Proven at two levels: a unit test (`elk-layout.test.ts`) runs ELK on a graph
containing a back-edge (`… → C → B`) and asserts it returns bend points — the
deterministic correctness proof, no app needed — and an e2e asserts every edge in
the app is drawn as a polyline along ELK's routing (`L` segments, no cubic `C`),
i.e. beziers are gone.

Follow-on (ADR 0012): a *single* route may no longer revisit a card, so a
single-route back-edge no longer exists — the fixture's back-edge collection was
removed. A back-edge now arises only from two routes disagreeing on order (ADR
0003), which this rendering still handles; the unit test drives it at the adapter
level (which doesn't enforce the domain rule). So `03` is not wasted — it still
improves every forward edge and renders cross-route conflicts — it simply stopped
being the thing holding up a self-return.
