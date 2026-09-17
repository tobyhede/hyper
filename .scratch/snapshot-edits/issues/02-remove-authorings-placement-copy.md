# 02 — Space Authoring stops keeping its own placement

Status: ready-for-agent
Blocked by: none

**What to build:** Space Authoring derives every Edit from `Placement.fromDiagram` of the selected Diagram in the working snapshot, and the retained placement it keeps beside that Diagram is deleted with everything that feeds or reads it. See `../spec.md`, "Authoring keeps two placements", for why the copy existed and the trace showing it is vestigial.

**Why:** Both reasons for the copy — render-time layout strategies and drawn ≠ authored displacement — were removed by ADR 0086 and ADR 0084. What is left is a second source of positions that every Edit writes whole into the Diagram, so any disagreement is authored by whatever Edit comes next. The embedded Diagram path already works without one (`EmbeddedDiagramAuthoring.tsx:72`, `embedded-authoring.ts:116`).

## Red first

Each suspected defect below was found by reading and has **not** been reproduced. Write each as a failing test before changing the implementation. One that will not fail against `main` is struck from this ticket with a note in Comments, never claimed as fixed.

- [ ] **Diagram delete draws the right geometry.** After a coordinated Diagram delete (`App.tsx:921`, `space-thing-context-commands.ts:94`), a Thing present in both the deleted Diagram and the newly selected one is drawn and authored at the **newly selected** Diagram's position. Suspected: `reconcilePlacement` keeps the deleted Diagram's coordinates and no placement replace follows `navigation.selectDiagram`.
- [ ] **Entering draws the entered Diagram's geometry.** After Enter seeds a selection (`open-spaces.ts:428`), the next Edit writes that Diagram's own positions, not another Diagram's. Same suspected cause.
- [ ] **An embedded delete in an unselected Diagram leaves no stale member.** After an embedded `deleted-thing` in a Diagram that is not selected (`space-authoring.ts:1869`), the next top-level Edit produces a snapshot intake accepts. Suspected: no install, reconciliation gated by `installing`, stale member written back.
- [ ] **A queued drag holds its drop point.** A `settled-thing-movement` that queues behind an in-flight commit stays drawn at its drop point until it is derived and lands there. This one guards the change rather than a defect: it must pass before and after.

## Build

- [ ] Authoring reads positions from the selected Diagram at derivation. Delete `let placement`, `install`, `mergeBase`, `reportRendered`, `replacePlacement`, `reconcilePlacement`, `authoredPlacement()`, `initialPlacement` in `SpaceAuthoringDependencies`, `openingPlacement` in `compose-app.ts`, and the `placement-pending` refusal with its gate (`space-authoring.ts:1365`) and its row in `authoring-refusal.ts`.
- [ ] `settled-thing-movement` carries the moved Things' drop points explicitly and they are applied over the Diagram's positions when the Edit is derived, not when `complete()` is called. `connected-things` and `create-and-connect` stop carrying `rendered`.
- [ ] The render adapter stops calling `reportRendered` (`render-adapter.ts:514`) and `replacePlacement` (`:524`); `selectDiagram` only resets its own projection state. `embedded-authoring.ts` drops its two no-op members.
- [ ] `App.tsx` builds the positioned strategy from `selectedDiagram` (already memoised on the working Space and `selectedDiagramId`) rather than `authoring.authoredPlacement()`. Confirm no extra re-layout: a drag frame must not change the strategy's identity.
- [ ] A **refused** drag snaps back to its stored position. If an existing test asserts a refused drop point is retained, rewrite it to the new behaviour and name it in the commit.

## Tests

- [ ] Delete the `render-adapter.test.ts` tests whose subject is the install sequence (the stub spy recording `reportRendered`/`replacePlacement`).
- [ ] Re-seed geometry through the snapshot's Diagram positions in: `space-authoring-operations.test.ts` (`initialPlacement: null`, the `place()` helper, `replacePlacement`), `space-authoring.property.test.ts`, `displacement.property.test.ts`, `space-thing-context-commands.test.ts`, `edge-authoring.test.ts`, `edge-authoring-react.test.tsx`, `chrome-continuation.test.tsx`, `continuation.test.ts`, `thing-deletion.test.ts`, and `render-adapter.test.ts`'s session-backed helper.
- [ ] Update `docs/agents/rendering.md` (the "SpaceAuthoring.install retains…" rule), the `Placement` module comment in `packages/graph/src/placement.ts` that names `SpaceAuthoring.install`, and the Authoring comments at `space-authoring.ts:840` and `:1319-1332`. Grep for `reportRendered`, `replacePlacement`, `authoredPlacement` and `placement-pending` across `packages/`, `docs/` and `test/` and leave none outside historical ADRs.

## Done when

- [ ] Every red test that survived passes.
- [ ] `pnpm verify`, `pnpm e2e` (drag, Open/Close, Diagram switching and Enter are all canvas behaviour) and, if any story reads the placement, `pnpm e2e:ladle` are green, with the commands run and any judged inapplicable named.

## Comments
