# 02 — Space Authoring stops keeping its own placement

Status: ready-for-agent
Blocked by: none

**What to build:** Space Authoring derives every Edit from `Placement.fromDiagram` of the Diagram the Edit acts on, read from the working snapshot at derivation. The retained placement beside that Diagram is deleted, along with everything that feeds or reads it: Authoring's own members, the render adapter's reports and its resize seed, the composition's opening value, the browser location's replace, and the `placement-pending` refusal. See `../spec.md`, "Authoring keeps two placements", for why the copy existed and the trace showing it is vestigial.

**Why:** ADR 0086 and ADR 0084 removed both reasons for the copy: render-time layout strategies, and a drawn position differing from an authored one. What is left is a second source of positions that every Edit writes whole into the Diagram, so whatever Edit comes next authors any disagreement between the two. The embedded Diagram path already works without one (`EmbeddedDiagramAuthoring.tsx:72`, `embedded-authoring.ts:116-123`).

Line numbers below are as of `d73fb0a8`. Symbol names are the reference; lines are a convenience.

## Red first

Each suspected defect below was found by reading and has **not** been reproduced. Write each as a failing test before changing the implementation. A test that will not fail against `main` is struck from this ticket with a note in Comments and never claimed as fixed.

- [ ] **Diagram delete draws the right geometry.** After a coordinated Diagram delete (`App.tsx:907-919`, `space-thing-context-commands.ts:81-94`), a Thing in both the deleted Diagram and the newly selected one is drawn and authored at the **newly selected** Diagram's position. Suspected cause: `navigation.selectDiagram(result.diagramId)` is not followed by a placement replace, and `reconcilePlacement` (`space-authoring.ts:932`) fixes membership only, so shared Things keep the deleted Diagram's coordinates. Only `browser-location.ts:225` pairs a selection with a replace.
- [ ] **Entering draws the entered Diagram's geometry.** After Enter seeds a selection (`open-spaces.ts:428`), the next Edit writes that Diagram's own positions, not another Diagram's. Same suspected cause.
- [ ] **An embedded delete in an unselected Diagram leaves no stale member.** After an embedded `deleted-thing` in a Diagram that is not selected (`space-authoring.ts:1868-1870`), the next top-level Edit produces a snapshot that intake accepts. Suspected cause: nothing is installed, reconciliation is gated by `installing`, and the stale member is written back.
- [ ] **A queued drag holds its drop point.** A `settled-thing-movement` that queues behind an in-flight commit stays drawn at its drop point until it is derived and lands there. This test guards the change rather than a defect, and must pass before and after.

## Build

### Space Authoring

- [ ] Delete the following, and derive from the snapshot's Diagram instead:
  - the state and its writers: `let placement`, `install`, `mergeBase`, `reportRendered` and `reconcilePlacement` (`space-authoring.ts:836-994`)
  - the accessors in the returned interface: `authoredPlacement`, `reportRendered` and `replacePlacement` (`:340-343`, `:2033-2036`)
  - the `initialPlacement` dependency (`:487`, `:832`)
- [ ] Delete both `placement-pending` gates and the refusal:
  - the Edit-derivation gate on `reportedPlacement` (`:1368-1370`)
  - the reconnect gate in `edgeEligibility` (`:1193-1199`), which also passes `placement` to `reconnectOutcome` as geometry. Reconnect eligibility must read `Placement.fromDiagram` of the Diagram that owns `proposal.graphId` (`ownedGraph`, `:1104`), not the selected Diagram's.
  - the union member (`:267`) and its rows in `authoring-refusal.ts` (`:36`, `:120`)
- [ ] `settled-thing-movement` carries the moved Things' drop points explicitly. They are applied over the Diagram's positions when the Edit is **derived**, not when `complete()` is called (`:1893-1916`). `ReportedCompletion.placement` (`:441`) and the copy each `QueuedCompletion` inherits go with it, so a queued drag is merged against the Diagram as it stands when the drain reaches it.
- [ ] `connected-things` and `create-and-connect` stop carrying `rendered` (`:125`, `:141`). Their `placed` was always empty.
- [ ] Remove `CompletedEdit.placement` (`:401`) if nothing reads it once `install` is gone (`:1846`, `:1870`). Keep it only if a named reader remains.
- [ ] `renamed-space` stops reading `reportedPlacement ?? Placement.fromDiagram(diagram)` (`:1323-1334`). With no copy, the Diagram is the only answer.

### Render adapter and canvas

- [ ] The render adapter stops calling `reportRendered` (`render-adapter.ts:514`) and `replacePlacement` (`:524`). `selectDiagram` takes no argument and only resets its own projection state.
- [ ] **Resize seeds from the Diagram.** `thingResize.beginResize` (`render-adapter.ts:440`) reads `authoring.authoredPlacement()` to seed `resizeDraft.placement`. It needs another source of the selected Diagram's placement: either passed in by the canvas, which already holds `selectedDiagram`, or read through a narrow accessor on the authoring seam that derives `fromDiagram`. Choose one and write the choice in Comments. `RenderAdapterAuthoring`'s `Pick` (`:420-423`) loses the three members.
- [ ] `embedded-authoring.ts` drops `authoredPlacement`, `reportRendered` and `replacePlacement` (`:116-123`). That is three members, not two.
- [ ] `browser-location.ts:225` stops calling `openingPlacement` and calls the argument-free `selectDiagram()`, keeping its `changesDiagram` guard.
- [ ] `compose-app.ts` deletes `openingPlacement` (`:160`) and the `initialPlacement` option and its plumbing (`:69`, `:189-207`).
- [ ] `App.tsx` stops reading `authoring.authoredPlacement()` (`:606-614`, with its comment) and hands `usePlacementRendering` the selected Diagram's placement, derived from `selectedDiagram`, which is already memoised on the working Space and `selectedDiagramId`.
- [ ] `placement-rendering.ts` takes a non-null `Placement`. Rewrite or delete its identity comment, which cites Space Authoring keeping the identity stable, for the new source. Confirm that a drag frame does not change the strategy's identity, so there is no extra re-layout.
- [ ] A **refused** drag snaps back to its stored position. If an existing test asserts that a refused drop point is retained, rewrite it to the new behaviour and name it in the commit.

## Tests

- [ ] Delete the `render-adapter.test.ts` tests whose subject is the install sequence (the stub spy recording `reportRendered` and `replacePlacement`).
- [ ] Re-seed geometry through the snapshot's Diagram positions in the files the original ticket named:
  - `space-authoring-operations.test.ts`: `initialPlacement: null`, the `place()` helper and `replacePlacement`
  - `space-authoring.property.test.ts`
  - `displacement.property.test.ts`
  - `space-thing-context-commands.test.ts`
  - `edge-authoring.test.ts`
  - `edge-authoring-react.test.tsx`
  - `chrome-continuation.test.tsx`
  - `continuation.test.ts`
  - `thing-deletion.test.ts`
  - `render-adapter.test.ts`'s session-backed helper
- [ ] Re-seed geometry in the four files the original ticket missed, all of which name something this ticket deletes:
  - `compose-app.test.ts:105`, which asserts `authoredPlacement()`
  - `active-graph-after-coordinated-recovery.test.ts:282`, which reads `authoredPlacement()`
  - `authoring-refusal.test.ts:21`: delete the `placement-pending` row
  - `coordinated-context-create.test.ts:34`, which uses `placement-pending` as a stand-in refusal: substitute another code
- [ ] Re-check `placement-rendering.test.tsx` and `space-authoring.test.ts`. `docs/agents/rendering.md:23` says they pin the completed-Edit re-layout.
- [ ] **Keep the `operational-feedback-placement-pending` parity claim** (`stories/parity-claims.ts:530`, `ladle-e2e/operational-feedback.spec.ts:44`). It shares a spelling with the refusal but is about something else: the canvas's "Arranging…" busy state, `PlacementRenderingState`'s `pending` arm, which survives this ticket because a strategy is still resolved asynchronously. Don't delete it as part of the refusal sweep.

## Docs

- [ ] `docs/agents/rendering.md:23`: remove the rule "`SpaceAuthoring.install` retains what it is given…" and the sentence about `syncProjection` reporting rendered geometry.
- [ ] `docs/agents/authoring-refusal-cascade.md:33` and `:129`: drop the "Placement reported?" step and correct the contextual-refusal count.
- [ ] Rewrite these comments for a module with no copy:
  - the `Placement` module comment in `packages/graph/src/placement.ts:42`, which names `SpaceAuthoring.install`
  - in `space-authoring.ts`: the `renamed-space` doc comment (`:178-193`), the `SpaceAuthoringState` comment (`:305-313`), the `install` comment (`:841-848`) and the `renamed-space` derivation comments (`:1300-1334`)
  - the Graph-command comment in `App.tsx:1659`
- [ ] Grep for `reportRendered`, `replacePlacement`, `authoredPlacement`, `initialPlacement`, `openingPlacement` and `placement-pending` across `packages/*/src`, `packages/app/{test,stories,ladle-e2e}`, `docs/` and `test/`. Leave none outside historical ADRs, except the parity-claim id and tag above, which name the busy state rather than the refusal.

## Done when

- [ ] Every red test that survived passes.
- [ ] `pnpm verify` and `pnpm e2e` are green, with the commands run. `e2e` is required because drag, resize, Open/Close, Diagram switching and Enter are all canvas behaviour.
- [ ] `pnpm e2e:ladle` is green if any story or component touched here changed, most likely through `placement-rendering.ts` or `EmbeddedDiagramAuthoring.tsx`. If it was not run, name it as judged inapplicable and say why.

## Comments

- 2026-09-18 — Audited against `d73fb0a8` after tickets 04–07 landed, and rewritten.
  - The original missed the resize seed in `render-adapter.ts:440`, the reconnect `placement-pending` gate in `edgeEligibility`, the `openingPlacement` caller in `browser-location.ts:225`, the `authoredPlacement` parameter in `placement-rendering.ts`, and `ReportedCompletion.placement`.
  - It also missed four tests and `authoring-refusal-cascade.md`.
  - The audit first read `operational-feedback-placement-pending` as the refusal's Ladle evidence. It isn't: it is the "Arranging…" busy state, and it stays.
  - Line numbers were refreshed. The suspected defects are still unreproduced.
