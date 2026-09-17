# 03 — Space Authoring edits snapshots through `SnapshotEdit`

Status: needs-triage
Blocked by: 01, 02, 05

**What to build:** Add `addToDiagram`, `open`, `close`, `resize` and `removeFromDiagram` to `SnapshotEdit`, move Space Authoring's Thing membership completions onto the module — including `created-thing`, `created-alias`, `create-and-connect` and `deleted-thing` through the operations ticket 01 built — and delete the helpers and rule tests they replace. See `../spec.md`.

**Why:** After 01 the registry uses the module, and after 02 Authoring has no second placement to reconcile, so Authoring can call the operations with the working snapshot directly. What remains in `app` is completion routing, outcomes, epochs and queueing — the deep part of Authoring — not the Diagram rules.

**Triage before starting:** re-read `deriveCompletedEdit` as 02 left it and confirm the arms still reduce to "call the operation, map the refusal, write the Diagram"; update this ticket's line references.

## Build

- [ ] `SnapshotEdit` gains:
  - `addToDiagram` — existing Thing, `exact` or `avoidingOverlap`; refuses `thing-not-found`, `thing-already-in-diagram`.
  - `open` — refuses `thing-not-in-diagram`; unchanged if already Open; default Open Size by kind (`DEFAULT_SPACE_THING_OPEN_SIZE` / `DEFAULT_OPEN_SIZE`); displaces by growth.
  - `close` — refuses `thing-not-in-diagram`; unchanged if Closed; reclaims and keeps the Open Size.
  - `resize` — refuses `thing-not-in-diagram`, `thing-not-open`; unchanged at the same size; exactly `COLLAPSED_THING_SIZE` is a Close; otherwise displaces by the difference in growth.
  - `removeFromDiagram` — refuses `thing-not-in-diagram`; reclaims, removes the position and this Diagram's incident Edges only.
- [ ] The magnetic 24-unit range (ADR 0066) stays in `app`; only an exact Closed Size reaches `resize` as a Close.
- [ ] Authoring's `opened-thing`, `closed-thing`, `resized-thing`, `added-thing-to-diagram`, `removed-thing-from-diagram`, `deleted-thing`, `created-thing`, `created-alias` and `create-and-connect` arms call the module and map its refusal codes into `AuthoringRefusal`. `space-thing-deletion-unsupported` stays in Authoring; the Alias Target check on creation moves into `createInDiagram` and `aliasTargetRefusal` is deleted.
- [ ] `updatePositionedDiagram` remains Authoring's write of `defaultDiagram`, `activeGraph`, title and `kind`; the module never writes those.
- [ ] Deleted: `freeAnchor`, `roomBetween`, `withRoomFor`, `closedThing`, `removedThing`, `incomingAliases` from `space-authoring.ts`, and `withThingRemovedFromDiagrams` and `withoutIncidentEdges` from `snapshot.ts` (moving any Edge-only use they still have into the module).

## Tests

- [ ] Property tests for each new operation in `packages/graph/test/snapshot-edits.property.test.ts`: Open then Close restores every position for nonnegative growth; resize A→B→A restores positions; resize to Closed Size equals close; `removeFromDiagram` touches no other Diagram; every operation's completed snapshot passes `loadSpaceSnapshot`.
- [ ] Delete the tests in `space-authoring-operations.test.ts` that only restate those rules through full composition (Open Thing geometry :326-733, Diagram membership ~:1700, the Delete Thing from Space cascade ~:1860-2000), and the pure `snapshot.test.ts` cases for the moved functions. Keep every test of completion outcome, epoch invalidation, queueing and ordering, and keep `displacement.property.test.ts` cases that assert Authoring-level behaviour rather than the rule.

## Done when

- [ ] `rg "Placement\.(reclaim|displace|growth)" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green; `pnpm e2e:ladle` run or named inapplicable with reason.

## Comments
