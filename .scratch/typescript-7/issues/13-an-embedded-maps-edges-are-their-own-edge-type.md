# 13 — An embedded Map's Edges are their own Edge type

**What to build:** An Edge drawn inside an Open Space Resource's embedded Map is never read as an Edge of the Map on the canvas. Every place that turns a React Flow Edge into a Selected Edge candidate answers nothing for it, and that holds because the module that mints embedded Edges marks them — not because of interaction flags set elsewhere, and not because an `embedded:` placement id happens never to equal a Resource id. The Edge Authoring control never mounts on an embedded Edge, and Edit continuation never considers one. Embedded Edges look exactly as they do today.

**Blocked by:** 07 — Prove Resource identity across the React Flow boundary (the node half, on the same branch and in the same module).

**Status:** resolved

**Tags:** Cleanup

## Why

One React Flow instance draws the Map on the canvas and every embedded Map. An embedded Edge is minted by copying an Edge of the target Space's Map, so it keeps that Edge's React Flow type and its Graph id, while its endpoints are re-keyed to embedded placement ids. The conversion from a React Flow Edge to an Edge selection therefore asserts `ResourceId` endpoints that are false for an embedded Edge, and two callers reach it with one today: the Edge Authoring control, mounted for every Edge of the routed type, and Edit continuation, which searches every drawn Edge. Neither misbehaves, but only by coincidence (see 07's Edge findings).

The domain fact that makes a marker correct: **an embedded Edge always belongs to another Space's Map**, because Space Resource references may converge but never cycle (`CONTEXT.md`, ADR 0068). A Space never embeds itself, so no embedded Edge is ever an Edge of the Map on the canvas.

## The decision

The embedding mints its Edges with a distinct React Flow Edge type, drawn by the plain routed Edge renderer, and the conversion answers only for the routed type — the one type the canvas projection alone writes, from Resource ids. Recorded here so it is not reopened without a new reason:

- **Rejected: a lookup the render adapter owns** (Edge id → Edge selection, published with the projection, typed endpoints on the Edge data). Strongest locality and removes both remaining assertions, but changes what the render adapter and the projection publish (an ADR), touches about eight modules and every projection fixture, and still mounts the authoring control on embedded Edges. Its only gain over this decision is two assertions whose invariant this decision already makes true and local — the baseline-draining motive ADR 0062 rejects. Revisit if a third minter of Edges appears.
- **Rejected: caller-first hybrid** (marker plus typed endpoints plus an id lookup inside Edge Authoring, and Edit continuation minting the Edge id from the Graph module's id format). Same projection change and ADR; the continuation change reverses the documented choice to resolve against the list the DOM is keyed off.
- **Rejected: stripping the Graph id from embedded Edges.** It encodes "not this Map's" as an absence a later full copy of the Edge data silently undoes, and makes a required field optional for every reader.
- **Rejected: a Map id on Edges.** The Graph id already determines the Map (a Map owns its Graphs); the cost of a membership check is wiring the drawn Map to every caller, not the data.
- **Not coupled: dropping Edge reconnection.** It removes only callers that embedded Edges never reach, and is a product change (the Selected Edge's controls in `CONTEXT.md`, ADRs 0087 and 0090).

The `edge.data` narrowing stays: an Edge's `type` is a plain `string` on React Flow's `Edge`, not a discriminant of its `data`, and a type predicate would be the same assertion under another name. The source/target narrowing stays too. Both stand under one `SAFETY:` comment naming the single fact above. The suppressions count for the render adapter is unchanged; that is expected.

## Watch for

- **Register the embedded type in the table the canvas actually uses** — Edge Authoring's, handed to the canvas — not the adapter package's own table, which only a story uses. An unregistered type falls back to React Flow's built-in default curve (its error 011) and embedded Edges lose their lane offset, end trim and anchor attachment; the e2e suites only count Edges and would not notice. Keep the embedded type's registration with the embedding, merged into the canvas table under a stable identity, so Edge Authoring learns nothing about embedded Maps (`docs/agents/rendering.md`).
- **The render adapter's Edge test fixture has no `type`.** Once the conversion gates on type, every Edge selection test answers `null` until the fixture carries the type the projection really mints.
- Do not use "host" in code, comments or tests; it is not domain vocabulary. Say the Map on the canvas (the containing Space's Map) and an embedded Map.

## Acceptance

- [x] An Edge minted by the embedding yields no Edge selection, and an Edge selection change naming one changes nothing.
- [x] Every Edge type the embedding mints is registered in the canvas's Edge type table — a test that fails if a new embedded type is added without a registration.
- [x] The embedding's own tests assert the minted type.
- [x] The render adapter's Edge fixture carries the routed type.
- [x] The unreachable missing-Graph-id branch goes, and one `SAFETY:` comment states the cross-Space fact.
- [x] Non-vacuity: with the type gate removed, the new cases fail.
- [x] The embedding bullet in `docs/agents/rendering.md` says embedded Edges are their own type and why.
- [x] Embedded Edges render unchanged (same curve, lane offset, trim, attachment).
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

## Resolved — 2026-09-23

Built on `resource-identity-07`, test-first.

- `embedded-map.ts` exports `EMBEDDED_EDGE_TYPE` (`'embedded'`) and `withEmbeddedEdgeTypes`, which adds that type to a given table, drawn by the plain `RoutedEdge`. `embeddedMap` mints every Edge with that type.
- `SpaceCanvas` hands React Flow `withEmbeddedEdgeTypes(edgeSurface.edgeTypes)` under a `useMemo` keyed on Edge Authoring's module-level table, so the identity is stable (#002) and Edge Authoring's `EDGE_TYPES` is untouched.
- `edgeSelectionOf` returns `null` for any type other than `routed`. The missing-Graph-id branch is gone, and one `SAFETY:` comment over the `return` covers the `data`, `source` and `target` narrowings, stating the cross-Space fact (ADR 0068). The suppressions count for `render-adapter.ts` stays at 5.
- Tests: `embedded-map.test.ts` asserts the minted type, that the projection's own Edges convert while every minted Edge answers `null`, and that `withEmbeddedEdgeTypes` keeps the given table and draws every minted type with `RoutedEdge`. The last of these is the one that fails if a new type is minted without being registered. `render-adapter.test.ts`'s `EDGE` fixture carries `type: 'routed'`, and a new case sends a selection change naming an embedded Edge id and checks it changes nothing.
- Non-vacuity: with the type gate removed, *mints its Edges as its own type, which never converts to an Edge selection* fails. The registration test failed before `withEmbeddedEdgeTypes` existed. The render-adapter selection-change case passes without the gate too, because `changeEdges` already resolves a change against the projection's own Edges. It guards that path and does not test the gate.
- Rendering unchanged: the embedded type is drawn by the same `RoutedEdge` that `AuthorableEdge` draws when it shows no controls. The e2e fixture gate fails a test on any React Flow warning, including #011 (unregistered type) and #002 (unstable `edgeTypes`), and both suites passed.
- `docs/agents/rendering.md`: the embedding bullet now says embedded Edges are their own type, why, and where the registration lives.

Verification on the finished state: `pnpm verify` exit 0 (240 files, 3106 passed, 13 skipped); `pnpm e2e` 227 passed; `pnpm e2e:ladle` 115 passed.
