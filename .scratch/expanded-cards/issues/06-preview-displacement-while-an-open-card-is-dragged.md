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

**A closed Card released inside an Open Card's own drawn box.** `authoredPoint`
clamps it to the near side, so it too settles somewhere other than the drop
point. Previewing that would mean drawing the dragged Card away from the pointer
mid-gesture, which is a different and far more invasive change to React Flow's
controlled drag. ADR 0064 names this one and accepts it: "a Card crossing an
Expanded Card's authored origin may jump between the two sides of the
displacement rule." It is untouched, and `Placement.next`'s clamp test still
pins it.

## Why no ADR

The durable boundary is unchanged: displacement stays derived, authored geometry
stays authored, and the step boundary ADR 0064 accepted is still accepted. What
changed is when the author sees the displacement — gesture treatment, which
`docs/agents/workflow.md` keeps out of the log and in the issue and its tests.

## Verification

Run over the finished tree on `worktree-fix+open-card-drop-position`, whose
parent is `129d5162` on `feat/card-titles`.

- **The defect, first.** `pnpm e2e --grep "displaces its neighbours before
  release"` at the parent commit fails: `card 00000000-0000-4000-8000-000000000002
  moved on release`, `y` 12 → 286. With the draft it passes in 2.3s.
- `pnpm verify` — passed, exit 0. All eight gates: `typecheck:toolchain`,
  `typecheck`, `typecheck:packages`, `ui:catalog:check`, `lint`,
  `lint:anti-slop`, `format:check`, `test:coverage`. 198 test files, 2412
  passed, 2 skipped.
- `pnpm e2e` — 157 passed, 3 failed, 3.5m. **The three failures are inherited,
  not caused.** They are the Alias Title tests in `editing.spec.ts` — "choosing a
  Target creates the Alias and begins shared Title editing", "an Alias is renamed
  by the shared Title editor creation begins", "Escape discards an Alias rename
  without undoing the Alias" — and each asserts that a new Alias takes its
  Target's Title while the branch gives it `Card 1`. All three fail identically
  at `129d5162` with none of this work in the tree, which is how they were
  established as pre-existing rather than assumed to be. They belong to the
  Card Titles work in progress on this branch; nothing here touches Alias
  creation, Titles, or the pane that runs them.
- `pnpm e2e:ladle` — **not run, and not applicable.** No component changed. The
  work is the render adapter's store, its test, and one browser spec; no file
  under `packages/ui`, `packages/react-flow-adapter` or `packages/app/stories`
  is touched, so no story can observe it.
