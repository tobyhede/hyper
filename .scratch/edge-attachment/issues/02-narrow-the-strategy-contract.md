# 02 — Narrow the LayoutStrategy contract to what a Diagram can hold

Status: resolved
Blocked by: 01

**What to build:** Remove the routing half of the strategy contract. A Diagram stores placements — a Thing and its position — and nothing else, so routed Edge geometry can never be persisted by an Edit and can no longer be produced at render. It is unusable in both directions rather than merely unused, which is the argument ADR 0086 makes for deleting it rather than leaving it for a future automatic arrangement.

The even spread of a Thing's per-Graph ports over its height stops being a fallback for a strategy that never placed them and becomes the only rule. Behaviour does not change: the fallback is already the only branch that executes.

- [x] The strategy contract describes positions only — no port collection on a Thing, no routed sections on an Edge, and no section type on the package surface.
- [x] The graph package's curated index and the surface test that gates it no longer name the removed types.
- [x] The routed-Edge component draws one curve between its anchors, with no polyline branch and no routed-point flattening behind it.
- [x] Handle offsets come from the even spread alone, with no lookup that can override it.
- [x] The canvas projection no longer special-cases a moved Thing when building Edge options; it built two identical results.
- [x] The tracked fixture renders identically.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.

## Answer

The contract answers positions and nothing else. `LayoutStrategyPort`, `LayoutStrategyEdgeSection`, `Point`, `LayoutStrategyThing.ports` and `LayoutStrategyEdge.sections` are deleted, and the curated index and `graph-package-surface.test.ts` no longer name them. `buildLayoutStrategyGraph` lost its `handlesByThing` parameter — the handle map still reaches `projectThingNodes`, which is the only thing that ever needed it.

`RoutedEdge` draws one bezier. `polyline`, `polylineMidpoint`, `roundCoordinate`, `routedPoints` and `RoutedEdgeData.points` are gone, and `routedEdgeGeometry` has a single branch, so the Edge's drawn path and the point `AuthorableEdge` hangs its controls on still cannot disagree. `resolveHandles` computes the even spread with no lookup that could override it, and the `moved` special-case on the Edge options is gone.

Behaviour is unchanged in every case, because each deleted branch was one no strategy in the tree could take: `port?.y ?? evenSpread` always fell right, and `data.points` was never populated, so `routedEdgeGeometry` always took the bezier. The even spread is now stated as a rule of its own in `docs/agents/rendering.md`, where it had been a fallback, so the lead-in there counts five rules rather than four; ADR 0086's own list marks this ticket built.

`moved` itself went too, in review rather than in the original commit. Deleting its one reader left a field written by the render adapter on every settled drag, subscribed in `App`, threaded through `CanvasInteraction` and listed in two `useMemo` dependency arrays — so the first drag of a session recomputed the whole projection to produce an identical value. It was parked at first for `03`, on the chance attachment geometry would want to know a drag had happened. It cannot serve that: `04` requires attachment follow a drag continuously, which is read per frame off the node positions React Flow already publishes, and `moved` is a latch set once per gesture and cleared on Diagram selection. `packages/graph`'s point type is likewise not re-declared — `point-type-identity.test.ts` now reads for none.

One thing deliberately left alone: `LayoutStrategyEdge` keeps `sourceHandle` and `targetHandle`, which `buildLayoutStrategyGraph` writes and nothing now reads — `projectGraphEdges` takes its handle ids from `GraphRenderEdge`. They are endpoint references rather than geometry, and `03` is where the fate of the per-Graph anchor family is decided; removing them now would pre-empt that call in the direction of a future automatic strategy that may want them.

`pnpm verify` exit 0 (196 files, 2440 passed), `pnpm e2e` 180 passed, `pnpm e2e:ladle` 83 passed.
