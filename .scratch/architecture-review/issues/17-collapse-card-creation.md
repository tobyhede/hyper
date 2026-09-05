# Collapse Card creation into one module

Status: resolved
Tags: Improvement
Blocked by: none — `entity-url-addressability/07` delivered the second creation surface
Related: `entity-url-addressability/07`; `architecture-review/14`

Surfaced by: the 4 September 2026 architecture review of
`07-author-a-space-card-reference`, candidate "Collapse Card creation into one
module". Validated against that branch at `675a0e53`.

## The problem

Creating a Card from a pane has no interface. `App.tsx` holds it as loose state:

- Alias — `creatingAlias`, `aliasRefusal`, `createAlias`, `cancelAlias`,
  `clearAliasRefusal`, `aliasTargets`;
- Space Card — `creatingSpaceCard`, `creatingSpaceCardBusy`, `spaceCardRefusal`,
  `spaceCardTargetChoices`, `createSpaceCard`, `cancelSpaceCard`,
  `clearSpaceCardRefusal`, and the effect that reads the referenceable Spaces.

Thirteen values, written from five places across three files: the two callbacks,
the Add Card menu handler, the presenting effect, and `NewSpaceCard`'s own
dismissal gate. `creatingCard = creatingAlias || creatingSpaceCard` is then read
at nine sites.

Two illegal states are representable, and both are only prevented by non-local
reasoning:

- `!creatingSpaceCard && creatingSpaceCardBusy` — a busy flag outliving the pane
  it disables. Prevented today by an argument spanning three files: the pane is
  modal so presenting is unreachable, dismissal is blocked while busy, and Cancel
  is disabled while busy.
- `creatingAlias && creatingSpaceCard` — two panes at once. Prevented only by the
  shape of the Add Card menu.

This is not theoretical. Four of the six defects the `675a0e53` code review found
were the same defect — a failure leaving creation state that no longer described
anything on screen — and each had to be fixed separately because there was no one
place to fix it.

## Direction

One in-process deep module, `card-creation.ts`, following the
`edge-authoring.ts` / `edge-authoring-react.tsx` pattern already in this package:
framework-free state behind `createObservableState`, composed in
`compose-app.ts`, read through one `useSyncExternalStore` in a thin
`useCardCreation`. The defects were in transitions rather than in rendering, and
this is the only shape in which a test can drive a transition without a React
tree.

**One instance, not one per kind.** The kind rides on the state and `open(kind)`
selects the choices read and the submit, so mutual exclusion is structural and
`creatingCard` collapses to `state.kind !== 'closed'`.

## What to build

**The state — three arms.**

```
closed
choosing   { kind, choices, refusal }
submitting { kind, choices }
```

`submitting` is an arm rather than a flag beside `creating`, which is what makes
the first illegal state above unrepresentable. There is no `refused` arm: a
refused attempt returns the author to a pane whose fields are editable, so it is
`choosing` carrying a message. There is no arm for a choices read still in
flight either — the pane opens immediately with an empty list and fills, and a
read that fails sets the refusal, which is what the code does today.

**Two seams supplied at composition, both sync-or-async.** The kinds differ in
exactly two places and nowhere else:

- `readChoices: (kind) => Choices | Promise<Choices>` — Alias targets are a
  synchronous filter over the Space, Space Card choices an async backend read
  that can fail.
- `submit: (kind, input) => Outcome | Promise<Outcome>` — Alias creation is a
  synchronous `authoring.complete`, a Space Card's is a coordinated Edit.

The module enters `submitting` only when it actually receives a promise, so
Alias behaves exactly as it does today and the 20 synchronous assertions in
`card-creation.test.tsx` stand. This is the shape `DeleteCardControl` already
uses for `onDelete`.

**Three outcomes**, each submit mapping its own kinds onto them:

- `refused` — stay in `choosing`, carry the placement;
- `created { cardId }` — close, with a Card to continue at or none;
- `none` — stay open, nothing happened. This is where Alias's `queued` and
  `unchanged` land, which is what they do today.

**Two one-shots on the state, consumed once by the React adapter**, as
`EdgeAuthoring` already does with `focusRequest`:

- `focusRequest` — replaces the `restoringAddCardFocus` ref and its effect, so
  the rule "closing restores focus to Add Card" lives in the module that closes.
- `continueAt` — the created Card. The adapter feeds it into App's existing
  `createdCardId`, which stays where it is: Add Card sets it too, and Add Card is
  out of scope.

**Refusals are presented at the seam.** `submit` answers an already-presented
`{ fields, form }` rather than a raw refusal, so the module is not generic over
two refusal unions. This absorbs the review's second candidate: the placement
type stops being `NewAliasRefusalErrors` and becomes the module's own
`CardCreationRefusalErrors`.

*Touches ADR 0057.* The refusal code stays the stable domain identity and
placement is still decided by code, at the seam where the outcome is produced —
nothing branches on the presented value. But it does move presentation earlier
than the pane, which is the one thing here worth a second look.

**Composition.** `composeApp` gains `spaceCards`: it is built in
`createOpenSpaces` today and only reaches `App` on the `OpenSpace` entry. The
canvas anchor stays an argument to `create` rather than a composition
dependency — it is a property of the gesture and derived from a React ref, the
way `createConnectedCard(from, position, projected)` already takes a position.

**`App` keeps one effect** closing creation when presenting starts, now a single
`cancel()` instead of four setters. Keyed on the fact, as the existing comment
requires, so a second way into presenting cannot leave a pane open over a
presentation. The module takes no dependency on Navigation for one transition.

**The panes keep flat props.** `refusal` becomes the presented placement and
`busy` derives from `state.kind === 'submitting'`. They are not handed the module
state: `NewAlias.test.tsx` and the Ladle stories would then couple their fixtures
to it.

## Not in scope

- **Add Card.** It creates immediately with an inline title editor, and holds no
  pane, no choices and no refusal.
- **Converging `NewAlias` and `NewSpaceCard`.** They are 157 and 212 lines of the
  same shape — a title field, one chooser, Cancel and Create — but that is a UI
  decision that goes through `$shadcn-first-ui` and ADR 0052, and doing it in the
  same change makes the diff unreadable. Its own ticket.
- **Staging the two kinds.** One instance means one cutover. The 37 app-level
  tests that pass unchanged are what makes that safe to review.

## Evidence

Replace, don't layer. These three tests in
`packages/app/test/space-card-authoring.test.tsx` are transition tests wearing a
React tree, and **move** to a node-environment `packages/app/test/card-creation.test.ts`:

- a rejected create clears `submitting` so both exits come back;
- dismissal does not close the pane while a create is in flight;
- a failed choices read reports rather than offering an empty list.

One app-level test stays, proving the pane reaches the module.

Everything else passes unchanged and is the regression net:
`card-creation.test.tsx` (20), `space-card-authoring.test.tsx` (the remainder of
10), `NewAlias.test.tsx` (7), `e2e/space-card.spec.ts`,
`ladle-e2e/space-card-panes.spec.ts`, `ladle-e2e/issue-03-card-and-alias-panes.spec.ts`.

`pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` all apply.

## Naming

`createCardCreation` / `CardCreation` / `useCardCreation`, after
`createEdgeAuthoring` / `EdgeAuthoring` / `useEdgeAuthoring`.

**Not added to `CONTEXT.md`.** It names a surface's state machine rather than
anything in the authored world — the same reason *projection* is deliberately
absent from that document, and `test/unit/current-domain-vocabulary.test.ts`
gives every term added there real weight. It belongs in `docs/agents/ui.md`
beside the other surface conventions.

## Answer

Card creation now owns one authoritative state behind a private pure reducer,
installed and published through `createObservableState`. The React adapter
mounts the module and reads it through `useSyncExternalStore`. Admission installs
the next state before invoking a collaborator, so repeated opens cannot start a
second read and repeated or reentrant submits cannot begin another attempt. A
synchronous completion publishes only its settled state; an asynchronous one
publishes `submitting` until it settles. Refusals permit immediate retry.

This completes the branch's consolidation while correcting its interim choice
to pass render-captured state into the asynchronous shell. The module remains
local to the mounting surface; App supplies the two memoized kind seams and the
composition's reporter. No additional composition dependency was needed.

Operation tests now exercise the module's state and collaborators together,
replacing tests that separately recorded dispatches or drove the reducer. The
repeated-open and reentrant-submit regressions both failed before their fixes.
The existing application tests retain pane, naming and focus evidence.

Continuation policy beyond this creation module is resolved separately in
`19-concentrate-card-creation-continuation.md`, including immediate Add Card.
