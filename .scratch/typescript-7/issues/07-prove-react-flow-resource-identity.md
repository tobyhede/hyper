# 07 — Prove Resource identity across the React Flow boundary

**What to build:** Derive a node change's `ResourceId` from the ownership lookup `changeNodes` already performs, and read a node's from its typed `data`, so the three node assertions in `render-adapter.ts` go with the comments that misstate why they hold. Then decide the Edge question below; it is not settled.

**Status:** needs-triage

**Tags:** Cleanup

**Why this is worth doing:** not to drain the suppressions baseline — ADR 0062 rejects that, and it remains no reason here. It is worth doing because the `SAFETY:` comments at these sites name the wrong invariant. Each says the id is a `ResourceId` "widened to `string` by React Flow's `Node` type", citing its neighbours. What actually makes it true is an ownership fact the comments do not state, held in one case by the code a few lines up and in the other by flags set in a different module. ADR 0062's stated worry is exactly this: a comment that argues convincingly, cross-references another site, and is checked by nothing.

## What makes the ids true

**One React Flow instance draws the host Map and every embedded Map.** `SpaceCanvas`'s `changeCanvasNodes` (`packages/app/src/components/SpaceCanvas.tsx:678`) hands every node-change batch both to the render adapter and to each live embedding. Embedded nodes carry placement ids, not Resource ids — `embeddedNodeId` mints `embedded:<parentId>:<resourceId>` (`packages/app/src/embedded-map.ts:14`) — so a batch routinely holds ids that are not `ResourceId`s.

**Nodes.** `changeNodes` (`packages/app/src/render-adapter.ts:550`) builds `owned = new Set(projection.nodes.map((node) => node.id))` on every call and drops each change whose id it does not own (`:562`, `:572`). That filter, not React Flow's type, is why `change.id as ResourceId` is true at `:328` (`consumeSettledMoves`, over the position changes that survive it) and `:589` (the selection change). Meanwhile every host node already carries its identity typed: `ResourceNodeData.resourceId: ResourceId` (`packages/react-flow-adapter/src/projection.ts:43`), which `placementFromNodes` (`:288`) ignores in favour of asserting `node.id`.

**Edges.** `edgeSelectionOf` (`:138`) asserts `edge.source`/`edge.target` are `ResourceId`s (`:149`). Embedded edges falsify that: `embeddedMap` spreads the host edge — so `data.graphId` survives and `edgeSelectionOf` does not return `null` — then rewrites `source` and `target` to `embedded:` placement ids (`embedded-map.ts:324-334`). The assertion holds only because every caller except one is an Edge Authoring reconnect or delete handler (`packages/app/src/edge-authoring-react.tsx:412`, `:432`, `:471`, `:500`), and `embeddedMap` sets `reconnectable: false` and `deletable: false`. The exception, `changeEdges` (`render-adapter.ts:634`), already resolves the change against the host projection's own `projection.edges` first, which makes it true by construction. Nothing is wrong today; the invariant just lives in another module.

The other three assertions the baseline records for `render-adapter.ts` are out of scope: two narrow a discriminant after an equality guard (`:107`, `:114`), one narrows `edge.data` to `RoutedEdgeData`, of which the adapter is the sole producer (`:142`). Every other production site belongs to issue 09. An earlier revision of this ticket counted 13 sites including `packages/graph/src/placement.ts` and `AuthorableEdge.tsx`; neither is a React Flow erasure.

## Build: nodes

- [ ] Make `owned` a `Map<string, ResourceId>` from `node.id` to `node.data.resourceId`. The filter becomes "has an owned identity", and the selection change reads the `ResourceId` from the same lookup — no new work per frame; the lookup is already paid.
- [ ] Give `consumeSettledMoves` the owned identities and key its result through them.
- [ ] `placementFromNodes` reads `node.data.resourceId`.
- [ ] Delete the three `SAFETY:` comments with their assertions, and the stale "repairs below/above" references in the comments that remain (`:136`, `:144`).
- [ ] Tests: an unowned (embedded) id in a mixed batch contributes neither a selection nor a settled move — neither `packages/app/test/render-adapter.test.ts` nor `SpaceCanvas.test.tsx` feeds an `embedded:` id today, so this is a new case, most cheaply in `render-adapter.test.ts`. Run `pnpm verify`, `pnpm e2e`; `--prune-suppressions` lowers `render-adapter.ts` from 8 to 5.

## Open: edges

Decide how `edgeSelectionOf` comes to know it is looking at a host Edge, rather than trusting its callers. The parsing alternative is still rejected for the reason the `:585` comment gives — a throw on the per-pointer-frame path for a failure that cannot happen — and that reasoning does not apply to a lookup that answers `null`.

- Resolving the React Flow Edge against the host projection's edges, as `changeEdges` already does, makes it host-only by construction. It moves the lookup into Edge Authoring's handlers, which currently receive React Flow's `Edge` directly.
- Carrying typed `from`/`to` on `RoutedEdgeData` removes the assertion but not the problem: an embedded edge spreads `data`, so it would then yield a well-typed selection of an Edge in another Space.
- Leaving it, with the `SAFETY:` comment rewritten to name the real invariant — embedded edges are neither reconnectable nor deletable, `embedded-map.ts` — is a legitimate outcome if the lookup costs more clarity than it buys.

If the chosen shape changes what the render adapter or the projection publishes, it earns its own ADR. Read `docs/agents/rendering.md` and ADR 0062 first.
