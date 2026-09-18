# 02 — Space Authoring stops keeping its own placement

Status: done
Blocked by: none

**What to build:** Space Authoring derives every Edit from `Placement.fromDiagram` of the Diagram the Edit acts on, read from the working snapshot at derivation. The retained placement beside that Diagram is deleted, along with everything that feeds or reads it: Authoring's own members, the render adapter's reports and its resize seed, the composition's opening value, the browser location's replace, and the `placement-pending` refusal. See `../spec.md`, "Authoring keeps two placements", for why the copy existed and the trace showing it is vestigial.

**Why:** ADR 0086 and ADR 0084 removed both reasons for the copy: render-time layout strategies, and a drawn position differing from an authored one. What is left is a second source of positions that every Edit writes whole into the Diagram, so whatever Edit comes next authors any disagreement between the two. The embedded Diagram path already works without one (`EmbeddedDiagramAuthoring.tsx:72`, `embedded-authoring.ts:116-123`).

Line numbers below are as of `d73fb0a8`. Symbol names are the reference; lines are a convenience.

## Red first

Each suspected defect below was found by reading and has **not** been reproduced. Write each as a failing test before changing the implementation. A test that will not fail against `main` is struck from this ticket with a note in Comments and never claimed as fixed.

- [x] **Diagram delete draws the right geometry.** After a coordinated Diagram delete (`App.tsx:907-919`, `space-thing-context-commands.ts:81-94`), a Thing in both the deleted Diagram and the newly selected one is drawn and authored at the **newly selected** Diagram's position. Suspected cause: `navigation.selectDiagram(result.diagramId)` is not followed by a placement replace, and `reconcilePlacement` (`space-authoring.ts:932`) fixes membership only, so shared Things keep the deleted Diagram's coordinates. Only `browser-location.ts:225` pairs a selection with a replace. — Green: fixed by deriving `Placement.fromDiagram` fresh at every Edit, so there is no stale copy left to disagree with the newly selected Diagram.
- [x] **Entering draws the entered Diagram's geometry.** After Enter seeds a selection (`open-spaces.ts:428`), the next Edit writes that Diagram's own positions, not another Diagram's. Same suspected cause. — Green, same fix.
- [x] ~~An embedded delete in an unselected Diagram leaves no stale member.~~ Struck — not reproduced, and not reproducible: see Comments.
- [x] **A queued drag holds its drop point.** A `settled-thing-movement` that queues behind an in-flight commit stays drawn at its drop point until it is derived and lands there. This test guards the change rather than a defect, and must pass before and after. — Stayed green throughout.

## Build

### Space Authoring

- [x] Delete the following, and derive from the snapshot's Diagram instead:
  - the state and its writers: `let placement`, `install`, `mergeBase`, `reportRendered` and `reconcilePlacement` (`space-authoring.ts:836-994`)
  - the accessors in the returned interface: `authoredPlacement`, `reportRendered` and `replacePlacement` (`:340-343`, `:2033-2036`)
  - the `initialPlacement` dependency (`:487`, `:832`)
- [x] Delete both `placement-pending` gates and the refusal:
  - the Edit-derivation gate on `reportedPlacement` (`:1368-1370`)
  - the reconnect gate in `edgeEligibility` (`:1193-1199`), which also passes `placement` to `reconnectOutcome` as geometry. Reconnect eligibility must read `Placement.fromDiagram` of the Diagram that owns `proposal.graphId` (`ownedGraph`, `:1104`), not the selected Diagram's.
  - the union member (`:267`) and its rows in `authoring-refusal.ts` (`:36`, `:120`)
- [x] `settled-thing-movement` carries the moved Things' drop points explicitly. They are applied over the Diagram's positions when the Edit is **derived**, not when `complete()` is called (`:1893-1916`). `ReportedCompletion.placement` (`:441`) and the copy each `QueuedCompletion` inherits go with it, so a queued drag is merged against the Diagram as it stands when the drain reaches it.
- [x] `connected-things` and `create-and-connect` stop carrying `rendered` (`:125`, `:141`). Their `placed` was always empty.
- [x] Remove `CompletedEdit.placement` (`:401`) if nothing reads it once `install` is gone (`:1846`, `:1870`). Keep it only if a named reader remains. — Removed; no reader remained.
- [x] `renamed-space` stops reading `reportedPlacement ?? Placement.fromDiagram(diagram)` (`:1323-1334`). With no copy, the Diagram is the only answer.

### Render adapter and canvas

- [x] The render adapter stops calling `reportRendered` (`render-adapter.ts:514`) and `replacePlacement` (`:524`). `selectDiagram` takes no argument and only resets its own projection state.
- [x] **Resize seeds from the Diagram.** `thingResize.beginResize` (`render-adapter.ts:440`) reads `authoring.authoredPlacement()` to seed `resizeDraft.placement`. It needs another source of the selected Diagram's placement: either passed in by the canvas, which already holds `selectedDiagram`, or read through a narrow accessor on the authoring seam that derives `fromDiagram`. Choose one and write the choice in Comments. `RenderAdapterAuthoring`'s `Pick` (`:420-423`) loses the three members. — Chose the narrow-accessor option; see Comments.
- [x] `embedded-authoring.ts` drops `authoredPlacement`, `reportRendered` and `replacePlacement` (`:116-123`). That is three members, not two.
- [x] `browser-location.ts:225` stops calling `openingPlacement` and calls the argument-free `selectDiagram()`, keeping its `changesDiagram` guard.
- [x] `compose-app.ts` deletes `openingPlacement` (`:160`) and the `initialPlacement` option and its plumbing (`:69`, `:189-207`).
- [x] `App.tsx` stops reading `authoring.authoredPlacement()` (`:606-614`, with its comment) and hands `usePlacementRendering` the selected Diagram's placement, derived from `selectedDiagram`, which is already memoised on the working Space and `selectedDiagramId`.
- [x] `placement-rendering.ts` takes a non-null `Placement`. Rewrite or delete its identity comment, which cites Space Authoring keeping the identity stable, for the new source. Confirm that a drag frame does not change the strategy's identity, so there is no extra re-layout. — Done, with a deviation from the literal instruction: see Comments.
- [x] A **refused** drag snaps back to its stored position. If an existing test asserts that a refused drop point is retained, rewrite it to the new behaviour and name it in the commit. — No such test found; see Comments.

## Tests

- [x] Delete the `render-adapter.test.ts` tests whose subject is the install sequence (the stub spy recording `reportRendered` and `replacePlacement`).
- [x] Re-seed geometry through the snapshot's Diagram positions in the files the original ticket named:
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
- [x] Re-seed geometry in the four files the original ticket missed, all of which name something this ticket deletes:
  - `compose-app.test.ts:105`, which asserts `authoredPlacement()`
  - `active-graph-after-coordinated-recovery.test.ts:282`, which reads `authoredPlacement()`
  - `authoring-refusal.test.ts:21`: delete the `placement-pending` row
  - `coordinated-context-create.test.ts:34`, which uses `placement-pending` as a stand-in refusal: substitute another code
- [x] Re-check `placement-rendering.test.tsx` and `space-authoring.test.ts`. `docs/agents/rendering.md:23` says they pin the completed-Edit re-layout. — `space-authoring.test.ts` does not exist; see Comments.
- [x] **Keep the `operational-feedback-placement-pending` parity claim** (`stories/parity-claims.ts:530`, `ladle-e2e/operational-feedback.spec.ts:44`). It shares a spelling with the refusal but is about something else: the canvas's "Arranging…" busy state, `PlacementRenderingState`'s `pending` arm, which survives this ticket because a strategy is still resolved asynchronously. Don't delete it as part of the refusal sweep.

## Docs

- [x] `docs/agents/rendering.md:23`: remove the rule "`SpaceAuthoring.install` retains what it is given…" and the sentence about `syncProjection` reporting rendered geometry.
- [x] `docs/agents/authoring-refusal-cascade.md:33` and `:129`: drop the "Placement reported?" step and correct the contextual-refusal count. — Count corrected to 24 (1 contextual + 23 action-specific), the guard renumbered from two to one.
- [x] Rewrite these comments for a module with no copy:
  - the `Placement` module comment in `packages/graph/src/placement.ts:42`, which names `SpaceAuthoring.install`
  - in `space-authoring.ts`: the `renamed-space` doc comment (`:178-193`), the `SpaceAuthoringState` comment (`:305-313`), the `install` comment (`:841-848`) and the `renamed-space` derivation comments (`:1300-1334`)
  - the Graph-command comment in `App.tsx:1659`
  - (found in addition) `reconcileNavigation`'s own doc comment called itself "the sibling of `reconcilePlacement`"; rewritten
- [x] Grep for `reportRendered`, `replacePlacement`, `authoredPlacement`, `initialPlacement`, `openingPlacement` and `placement-pending` across `packages/*/src`, `packages/app/{test,stories,ladle-e2e}`, `docs/` and `test/`. Leave none outside historical ADRs, except the parity-claim id and tag above, which name the busy state rather than the refusal. — Output in the handoff report.

## Done when

- [x] Every red test that survived passes.
- [x] `pnpm verify` and `pnpm e2e` are green, with the commands run. `e2e` is required because drag, resize, Open/Close, Diagram switching and Enter are all canvas behaviour.
- [x] `pnpm e2e:ladle` is green if any story or component touched here changed, most likely through `placement-rendering.ts` or `EmbeddedDiagramAuthoring.tsx`. If it was not run, name it as judged inapplicable and say why. — Run: `App.tsx`, `render-adapter.ts` and `EmbeddedDiagramAuthoring.tsx` all changed and multiple Ladle stories (`command-dock.stories.tsx`, `things-popover.stories.tsx`) mount the real `composeApp` composition.

## Comments

- 2026-09-18 — Audited against `d73fb0a8` after tickets 04–07 landed, and rewritten.
  - The original missed the resize seed in `render-adapter.ts:440`, the reconnect `placement-pending` gate in `edgeEligibility`, the `openingPlacement` caller in `browser-location.ts:225`, the `authoredPlacement` parameter in `placement-rendering.ts`, and `ReportedCompletion.placement`.
  - It also missed four tests and `authoring-refusal-cascade.md`.
  - The audit first read `operational-feedback-placement-pending` as the refusal's Ladle evidence. It isn't: it is the "Arranging…" busy state, and it stays.
  - Line numbers were refreshed. The suspected defects are still unreproduced.

- 2026-09-18 — Implementation pass. Items 1 and 2 confirmed as real defects on `main` and fixed; item 4 stayed green throughout; item 3 struck; several deviations from the ticket's literal text, recorded below.

  **Item 3 struck.** The red test (`authoring-placement-copy.test.ts`, "An embedded Edit in an unselected Diagram leaves no stale member") could not reach the suspected mechanism — `deleted-thing` is excluded from `completeInDiagram`'s parameter type and no production caller reaches it that way, exactly as the test's own doc comment already argued. With the copy gone, the underlying *mechanism* (a copy left stale because reconciliation was gated by `installing`) is now categorically impossible for **every** completion kind, not only `deleted-thing`: an embedded Edit writes straight into the session's snapshot, exactly as a top-level one does, and every later read derives its placement fresh from that same snapshot. There is no second store left to go stale. The test itself is kept as a useful guard on the surrounding behaviour — an embedded Edit on a Diagram other than the one selected still has to produce a snapshot intake accepts, and a later top-level Edit still has to see it — using `deleted-graph` as the closest reachable kind, exactly as before. Its doc comment was rewritten to describe the current mechanism rather than the deleted `install`/`installing`-gate one.

  **Resize seed: chose the narrow-accessor option.** Added `SpaceAuthoring.diagramPlacement(): Placement` — non-null, `Placement.fromDiagram(selectedResolvedDiagram().diagram)` — rather than threading the selected Diagram's placement down through the canvas into `beginResize`. `RenderAdapterAuthoring` now picks `'diagramPlacement' | 'complete' | 'getState' | 'subscribe'`. Chosen over the canvas-plumbing option because `ThingResize.beginResize(thingId)`'s signature is used from `canvas-thing-decoration.ts`, several levels below `App.tsx`, and dozens of test/story call sites construct `thingResize` stubs; threading a placement argument through all of them for one call site was the more invasive change for no behavioural difference. `embedded-authoring.ts`'s `RenderAdapterAuthoring` implementation gained the same member, answering *this* Diagram's placement (the embedded one, not necessarily the host canvas's selection) — `Placement.empty()` when the Diagram cannot be resolved, matching the non-null return type.

  **`placement-rendering.ts`: deviated from "takes a non-null `Placement`" by also dropping the `strategy: LayoutStrategy` parameter.** The ticket's literal instruction was to change the third parameter's type from `Placement | null` to `Placement`. Doing only that is not type-checkable: once the third argument can never be `null`, `authoredStrategy` (built from it) is *always* chosen over the `strategy` parameter in the old `authoredStrategy ?? strategy` fallback — provably, not just in today's callers — which leaves `strategy` referenced nowhere in the function body and `noUnusedParameters` rejects it. The two ways to resolve that are deleting the parameter or keeping it artificially "used" without it doing anything, and the second is the kind of code this ticket exists to remove. So `usePlacementRendering` now takes exactly `(strategyGraph, placement: Placement)` and builds `positionedStrategy(placement)` itself; both callers (`App.tsx`, `EmbeddedDiagramAuthoring.tsx`) dropped their own `positionedStrategy(...)` local and pass the placement straight through. One consequence worth flagging: the hook is no longer generic over an arbitrary async `LayoutStrategy`, so `placement-rendering.test.tsx`'s three tests that drove a custom rejecting/throwing/slow-resolving strategy (to exercise the `'failed'` state and an obsolete-resolution race) could no longer be expressed — `positionedStrategy` cannot fail or hang. Those three tests were deleted rather than contorted; the `'failed'` state and the `try`/`catch` around the strategy call stay in the hook, honouring the general `LayoutStrategy` contract's own fallibility, but nothing in this suite drives that branch any more. The four tests that remained meaningful (pending-until-ready, re-layout on a new `strategyGraph` while placement keeps its identity, invalidation the instant placement's identity changes, invalidation on a new `strategyGraph` under an unchanged placement) were kept, rewritten for the two-argument signature.

  **Refused drag snapping back: no existing test found asserting retention.** Searched `render-adapter.test.ts` and elsewhere for a test asserting a refused `settled-thing-movement`'s drop point survives; none exists — `settled-thing-movement`'s only refusal path is `diagram-not-found` (the selected Diagram itself has gone), which no unit test constructs. The new design does snap back: `deriveCompletedEdit`'s `settled-thing-movement` branch merges the moved Things' drop points over `Placement.fromDiagram(resolved.diagram)` at derivation, so a refusal (or a throw) leaves the session's snapshot — and therefore everything `App.tsx` derives from it — exactly as it was; nothing was ever installed anywhere else for a later unrelated Edit to carry forward. No rewrite was needed because no test needed one.

  **`docs/agents/rendering.md:23` and the Tests section both cite `space-authoring.test.ts`, which does not exist** (only `space-authoring-operations.test.ts` and `space-authoring.property.test.ts` are present in `packages/app/test/`). This looks like a stale reference predating this ticket — `git log` on `rendering.md` was not run to date it precisely, but the file is absent on `main` at the commit this ticket names. The `rendering.md` citation was corrected to name only `placement-rendering.test.tsx`, which is what actually pins "a completed Edit does not need a forced identity to re-render" (`test('re-runs layout for a new strategyGraph while the placement keeps its identity', ...)`).

  **`settled-thing-movement`'s new shape:** `{ kind: 'settled-thing-movement', moved: ReadonlyMap<ThingId, DiagramPosition> }` — the moved Things' own drop points only, not a full rendered `Placement` plus a `placed` list. `render-adapter.ts`'s `consumeSettledMovedIds` was renamed `consumeSettledMoves` and now returns the map directly instead of a list of ids a caller would look positions up again for.

  Commands run on the finished state: `pnpm verify` (green, exit 0), `pnpm e2e` (222 passed), `pnpm e2e:ladle` (111 passed, including `@parity:operational-feedback-placement-pending`). Also ran the full `pnpm vitest run` once (2801 tests, all green) before the official `verify`/`e2e`/`e2e:ladle` triad, to catch anything outside the touched-file lint/typecheck pass early.
