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

- [x] Make `owned` a `Map<string, ResourceId>` from `node.id` to `node.data.resourceId`. The filter becomes "has an owned identity", and the selection change reads the `ResourceId` from the same lookup — no new work per frame; the lookup is already paid.
- [x] Give `consumeSettledMoves` the owned identities and key its result through them.
- [x] `placementFromNodes` reads `node.data.resourceId`.
- [x] Delete the three `SAFETY:` comments with their assertions, and the stale "repairs below/above" references in the comments that remain (`:136`, `:144`).
- [x] Tests: an unowned (embedded) id in a mixed batch contributes neither a selection nor a settled move — neither `packages/app/test/render-adapter.test.ts` nor `SpaceCanvas.test.tsx` feeds an `embedded:` id today, so this is a new case, most cheaply in `render-adapter.test.ts`. Run `pnpm verify`, `pnpm e2e`; `--prune-suppressions` lowers `render-adapter.ts` from 8 to 5.

## Open: edges

Decide how `edgeSelectionOf` comes to know it is looking at a host Edge, rather than trusting its callers. The parsing alternative is still rejected for the reason the `:585` comment gives — a throw on the per-pointer-frame path for a failure that cannot happen — and that reasoning does not apply to a lookup that answers `null`.

- Resolving the React Flow Edge against the host projection's edges, as `changeEdges` already does, makes it host-only by construction. It moves the lookup into Edge Authoring's handlers, which currently receive React Flow's `Edge` directly.
- Carrying typed `from`/`to` on `RoutedEdgeData` removes the assertion but not the problem: an embedded edge spreads `data`, so it would then yield a well-typed selection of an Edge in another Space.
- Leaving it, with the `SAFETY:` comment rewritten to name the real invariant — embedded edges are neither reconnectable nor deletable, `embedded-map.ts` — is a legitimate outcome if the lookup costs more clarity than it buys.

If the chosen shape changes what the render adapter or the projection publishes, it earns its own ADR. Read `docs/agents/rendering.md` and ADR 0062 first.

## Progress — nodes built, edges open

Commit `27f61037` on `resource-identity-07`. In `packages/app/src/render-adapter.ts`, `changeNodes` builds `owned` as a `Map<string, ResourceId>` from `node.id` to `node.data.resourceId`; the ownership filter reads `owned.has`, the selection change reads its `ResourceId` from `owned.get`, and `consumeSettledMoves` takes `owned` and keys `moved` through it. `placementFromNodes` reads `node.data.resourceId`. The three node assertions and their `SAFETY:` comments are gone, as are the "repairs below/above" references in `edgeSelectionOf`'s doc comment and `SAFETY:` comment. `edgeSelectionOf`'s own two assertions are untouched. Lint's `--prune-suppressions` lowered `render-adapter.ts` in `eslint-suppressions.json` from 8 to 5.

The deleted selection-site comment was the `:585` comment the Edge section below cites. Its reasoning — no parse, so no throw on the per-pointer-frame path — still holds, and the section needs no rewording.

New case in `packages/app/test/render-adapter.test.ts`: *takes neither a selection nor a settled move from an embedded node in a mixed batch*. One batch sends a `select` and a settled `position` for `embeddedNodeId(RESOURCE_B, RESOURCE_C)` beside a settled host drag of `RESOURCE_A`. The selection stays `none` and the only completion is A's move. The case passed before the change too, because the ownership filter was already there. To show it is not vacuous, the filter was replaced with `true` on the pre-change source: the new case failed, along with *publishes nothing new for a change aimed at a node it does not own*.

Verification, run on the finished state while the machine was heavily loaded by other work (`uptime` load average between 60 and 220):

- `pnpm verify`: `typecheck:toolchain`, `typecheck`, `typecheck:packages`, `ui:catalog:check`, `lint`, `lint:anti-slop` and `format:check` pass. `test:coverage` failed 18 of 3116 tests in 5 files, mostly `Test timed out`. A second `pnpm test:coverage` failed 13 tests, a mostly different set, also in 5 files. Run in isolation with this change applied, each set's files pass: 121 of 122 for the first set, and that one failure passed when run alone, both with and without this change; 127 of 127 for the second set. No failing test touches the render adapter's node path. They are load-dependent, not caused by this change, but the full suite was not seen green in one run.
- `pnpm e2e`: 227 passed.
- `pnpm e2e:ladle`: not run. No component or story changed.

### Edge findings for the decision

The caller list above is incomplete. `edgeSelectionOf` has three more production callers, and two of them see embedded Edges today:

- `AuthorableEdge.tsx:72` renders every `routed` Edge. `embeddedMap` keeps the host Edge's `type` (`embedded-map.ts:324-334`), and `SpaceCanvas` gives React Flow host and embedded Edges together (`SpaceCanvas.tsx:675`, `:1131`). So this site builds an Edge subject whose `from`/`to` are `embedded:` placement ids. It is harmless only because that subject is used behind `props.selected`, and embedded Edges are `selectable: false` (`embedded-map.ts:335`).
- `CanvasContinuation.tsx:97` resolves against React Flow's synced `state.edges` (`:76`), which include embedded Edges. It is harmless only because `sameEdgeSubject` compares against a host subject, and a UUID never equals an `embedded:` string.
- `edge-authoring-react.tsx:544` (the decoration) reads the host `edges` `SpaceCanvas` passes in (`:507-509`), so it is host-only.

So the third option's rewritten comment ("embedded Edges are neither reconnectable nor deletable") would not cover these two sites: at each, the assertion is false at runtime. `data.graphId` is read by `edgeSelectionOf` alone (`render-adapter.ts:141`; nothing else in `packages/*/src` reads it). That suggests a fourth option, which the ticket should weigh: `embeddedMap` publishes embedded Edges without the host Edge's `graphId`, so `edgeSelectionOf` answers `null` for them by construction, in the module that mints them. Typed `from`/`to` on the published data (the second option) is then safe, and the `source`/`target` assertion goes. This changes what the projection publishes, so by the rule above it earns an ADR.

