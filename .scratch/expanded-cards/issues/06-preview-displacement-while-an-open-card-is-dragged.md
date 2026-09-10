# 06 — Preview displacement while an Open Card is dragged

**What to build:** Make a live drag of an Open Card show the displacement it is
causing. The Cards it crosses move under the pointer, through the same one
draft-over-authored Placement a live resize already uses, so release changes no
geometry at all.

**Status:** resolved

## The defect

Reported from the canvas: "when an opened card is dragged, the drop position is
not correct — the drop point WAS aligned with the top of the row of other cards,
but on drop it shifts and is offset."

The dragged Card lands exactly where it was dropped. **Everything else jumps by
one displacement step at the moment of release**, which is what destroys the
alignment the author just made.

An Open Card displaces every Card `+x` and `+y` of it (ADR 0064), and
`Placement.drawn` derives that from the Open Card's **authored** position:

```
if (at.x > other.x) x += max(0, other.openSize.width  - COLLAPSED_CARD_SIZE.width)
if (at.y > other.y) y += max(0, other.openSize.height - COLLAPSED_CARD_SIZE.height)
```

So every neighbour's drawn position is a function of the Open Card's authored
position — and during a drag that authored position is still the old one.
`changeNodes` sees `settled.length === 0`, updates the live nodes and returns
without re-projecting, so the neighbours stay drawn against where the Card *was*
for the whole gesture. That is the canvas the author aims at. On mouse-up the
authored position changes, `drawn` recomputes, and each neighbour that has just
been crossed gains or loses its whole step.

Reproduced against `@project/graph` alone (A closed, B Open 800×600, so the
vertical step is 600 − 146 = 454):

```
drawn before   A=(0,400)  B=(600,900)
drop B at 400  A=(0,400)  B=(100,400)   ← aligned, correct
drop B at 399  A=(0,854)  B=(100,399)   ← A jumps 454px down
```

One pixel of drop position decides a 454px jump, because the rule reads `>`. Drag
the Open Card up past a Card and that Card jumps down; drag it down past one and
that Card jumps up. Both directions are in the report's two screenshots, and the
gap in each is the open-minus-closed height exactly.

Nothing covered it. `packages/graph/test/placement.test.ts` covers dragging a
**closed** Card near an Open one, which round-trips exactly — `authoredPoint` is
a true inverse of `drawn` for a *stationary* set of Open Cards. The case that
breaks is the one where the displacement function's own input is what moves.

## What was built

- [x] The render adapter's draft is named for the gesture rather than for
      resize: `interactionDraft`, a discriminated `resize | move`. One field, so
      the precedence rule is not written at each of the two consumers — the
      Space's canvas and an embedded Layout's, which both already read
      `draft?.placement ?? authored`. Landed as its own commit, ahead of the fix.
- [x] Every frame of an Open Card's drag mints a `move` draft: the authored
      Placement with that Card carried back through `Placement.authoredPoint` to
      where the pointer has it — the same inverse the settled completion applies.
- [x] The preview runs through the ordinary positioned strategy and canvas
      projection. No second geometry path, and displacement stays derived and
      never written to the Layout.
- [x] `reconcile` keeps the dragged node itself on the pointer through every
      projection the draft mints, `dragOrigins` having named it by then.
- [x] Release is still: the completion authors the same inverse the draft
      applied, so the placement it installs redraws exactly what was on screen.
- [x] A closed Card's drag mints nothing. No neighbour's drawn position depends
      on it, so a draft per frame would re-run the strategy to answer the
      geometry already there.
- [x] A live resize's draft is not the drag stream's to touch, and a settle,
      a Layout change or a replacement epoch discards a move draft — the two
      resets ADR 0042 already performs.
- [x] Browser evidence written against the defect and shown failing first; unit
      evidence at the store seam for the per-frame placement, the still release,
      the closed-Card no-op, resize precedence and Layout invalidation.

## Out of scope

**A closed Card released within one displacement step of an Open Card's authored
origin** — not the whole drawn box, which a sweep of the drop point disproves:
a release well inside an Open Card lands exactly where dropped, while one in the
step-wide band just after its origin clamps back to it. `authoredPoint` answers
the near side there, so that Card too settles off the drop point.

Ticket 06's answer does not reach it. Here the Card that must move *is* the one
under the pointer, so previewing the clamp means inverting `reconcile`'s rule
that an active drag keeps its live position — the Card detaching from the cursor
by up to a full step and snapping back. ADR 0064 names this direction and
accepts it: "a Card crossing an Expanded Card's authored origin may jump between
the two sides of the displacement rule." It is untouched, `Placement.next`'s
clamp test still pins it, and `07` carries the measurement and the decision.

## Why no ADR

The durable boundary is unchanged: displacement stays derived, authored geometry
stays authored, and the step boundary ADR 0064 accepted is still accepted. What
changed is when the author sees the displacement — gesture treatment, which
`docs/agents/workflow.md` keeps out of the log and in the issue and its tests.

## Verification

Run over the finished tree on `worktree-fix+open-card-drop-position`, rebased
onto `main` (`8449a0c2`). It previously sat on `feat/card-titles`, which bundled
the Card Titles work into every reading of this branch's diff; the three commits
here touch none of it, so the base is now the one they are actually about.

- **The defect, first.** `pnpm e2e --grep "displaces its neighbours before
  release"` fails without the draft: `card 00000000-0000-4000-8000-000000000002
  moved on release`, `y` 12 → 286. With it the test passes in 3.1s.
- `pnpm verify` — passed, exit 0. All eight gates: `typecheck:toolchain`,
  `typecheck`, `typecheck:packages`, `ui:catalog:check`, `lint`,
  `lint:anti-slop`, `format:check`, `test:coverage`. 196 test files, 2394
  passed, 2 skipped.
- `pnpm e2e` — **160 passed, 0 failed, 2.6m, exit 0.** The three Alias Title
  failures recorded here against the old base were `feat/card-titles`'s, not
  this work's; on `main` they do not arise, and `feat/card-titles` has since
  fixed them itself in `900a4eec`.
- `pnpm e2e:ladle` — **not run, and not applicable.** No component changed. The
  work is the render adapter's store, its test, and one browser spec; no file
  under `packages/ui`, `packages/react-flow-adapter` or `packages/app/stories`
  is touched, so no story can observe it.

## Review pass

A three-reviewer pass over the branch found three things belonging to this work,
two of them fixed here:

- The browser evidence could pass vacuously. It compared only the held frame
  against the released one, so a drag React Flow swallowed, a Card that never
  opened, or a delta too small to cross an authored origin all left the two
  trivially equal. It now samples the resting frame before the pointer goes
  down and asserts at least one neighbour moved during the gesture.
- The `move` draft carried a `cardId` nothing read, assigned last-wins across
  the loop. The Placement is the whole answer its two consumers ask for, so the
  field is gone rather than left to name an arbitrary Card the day multi-select
  is configured.
- **Left unfixed:** a `move` draft is discarded by a settled position change,
  `selectLayout` or the `replacementEpoch` reset — so if the dragged node's
  settle were dropped by `changeNodes`'s `owned` filter, the draft would outlive
  its gesture and the canvas would keep drawing from it. No product path removes
  a Card from the Layout while the pointer is down, so this stays a latent gap
  rather than a defect, recorded here rather than answered with a guard nothing
  can currently reach.
