# 05 — A drop lands where it was dropped, whatever is open

Status: resolved
Blocked by: 02, 04

**What to build:** Browser evidence that a drag is a drag, against both reported
defects (ADR 0084).

**Why:** Both bugs were reported from the canvas and neither was caught by a unit
test, because each is about what the canvas does across a gesture rather than
what a function returns.

- [x] Dragging an Open Card across its neighbours' origins moves **nothing but
      the dragged Card**, at every frame of the gesture and at release. This is
      the defect `expanded-cards/06` previewed rather than removed; it must be
      shown failing against that behaviour first.
- [x] A closed Card released inside an Open Card's drawn box lands at the drop
      point. The old clamp band was one growth-step wide beginning at the Open
      Card's authored origin, so the test drops inside it — the case
      `expanded-cards/07` measured as landing on the origin instead.
- [x] Both tests sample the resting frame before `mouse.down()` and assert the
      dragged Card actually moved, so neither can pass by the drag never
      starting.
- [x] Opening a Card moves its neighbours down and right, once, and they stay
      there while it is dragged around.

Use `boxOf` and `allPositions` from `packages/app/e2e/graph.ts`; do not hand-roll
another bounding-box read.

## Answer

Three tests in `packages/app/e2e/editing.spec.ts`, under an ADR 0084 section header, each
seeding its own geometry through `seedPositionedLayout` rather than reverse-engineering the
ELK-seeded fixture — every claim here is a distance between two Cards, so the Layout the app
opens is the one the test wrote. Offsets are arithmetic over `DEFAULT_OPEN_SIZE` and
`COLLAPSED_CARD_SIZE`, not the numbers they currently are.

1. `dragging an Open Card across a neighbour moves nothing but the dragged Card` — the
   neighbour is before the subject on both axes, so the Open displaces nothing and the test is
   about the drag alone. Dragged 280 left, across the neighbour's `x`, and back.
2. `a closed Card released inside an Open Card lands at the drop point` — dropped half a
   growth-step into the old clamp band on both axes. `boxOf` proves the drop is inside the Open
   Card's drawn box, which is the premise, and `allPositions` proves it rests at the drop point
   rather than the Open Card's origin.
3. `opening a Card displaces its neighbours once, and dragging it never displaces them again` —
   the Open moves the Card beyond it by exactly the growth and the Card behind it not at all,
   and the room stays put through a drag past the neighbour's authored origin and back.

Both drag tests sample the resting frame before `mouse.down()` and assert the dragged Card
actually travelled, so neither can pass by the drag never starting. `boxOf` and `allPositions`
are used throughout; no second bounding-box read was written.

**The mid-gesture frame needed a seam.** `dragBy` gained an optional `whileDragging`, the same
shape `connectHandles` uses for `whileConnecting` — a defect that moves a neighbour at the
crossing and moves it back before release is invisible from either resting frame.

**Shown failing against the derived code first**, in a throwaway worktree at `097ae2be`
(`git stash` is forbidden here — shared stack, concurrent sessions). Each failure is the ADR's
own symptom: (1) the neighbour's `x` went `0` → `300`, one whole growth, from a drag of the
*other* Card; (2) the drop landed at `150`, the Open Card's origin, where `300` was released —
the clamp, measured; (3) the neighbour snapped back from `(600, 524)` to its authored
`(300, 250)` the moment the Open Card was dragged beyond it. All three pass on this branch,
3/3 under `--repeat-each=3`.

**One incidental defect found and fixed in `dragBy`: it was under-shooting every drag by
exactly 10%.** React Flow begins the drag at the first pointer event past `nodeDragThreshold`
and measures travel from *there*, so the first of the `steps: 5` events to the halfway point
was spending a tenth of the whole delta — `dragBy(…, 300)` moved the Card 270. No existing test
noticed, because they all assert `>` inequalities. A 2px opening nudge as its own move makes
the loss two pixels rather than a proportion, which is what lets "lands at the drop point" be
an equality at all.

**One existing test had to be rolled forward, and it was a real one.**
`an Open Card offers one resize control…` asserted mid-gesture that a live resize moves the
resizing Card's neighbours. Under ADR 0084 it must not — the draft previews the Card's own rect
and nothing else. The assertion is inverted, and paired with a new one after release requiring
the neighbour to have moved: on its own, "the neighbour is where it was" would also pass for a
Card at rest, so it is the pair that places the movement at the Edit rather than at the frame.
The Edge-path assertion stays as it was, because the resizing Card's own handles do travel with
its rect.

`pnpm e2e` on the finished state: **179 passed**.
