# 05 — A drop lands where it was dropped, whatever is open

Status: ready-for-agent
Blocked by: 02, 04

**What to build:** Browser evidence that a drag is a drag, against both reported
defects (ADR 0084).

**Why:** Both bugs were reported from the canvas and neither was caught by a unit
test, because each is about what the canvas does across a gesture rather than
what a function returns.

- [ ] Dragging an Open Card across its neighbours' origins moves **nothing but
      the dragged Card**, at every frame of the gesture and at release. This is
      the defect `expanded-cards/06` previewed rather than removed; it must be
      shown failing against that behaviour first.
- [ ] A closed Card released inside an Open Card's drawn box lands at the drop
      point. The old clamp band was one growth-step wide beginning at the Open
      Card's authored origin, so the test drops inside it — the case
      `expanded-cards/07` measured as landing on the origin instead.
- [ ] Both tests sample the resting frame before `mouse.down()` and assert the
      dragged Card actually moved, so neither can pass by the drag never
      starting.
- [ ] Opening a Card moves its neighbours down and right, once, and they stay
      there while it is dragged around.

Use `boxOf` and `allPositions` from `packages/app/e2e/graph.ts`; do not hand-roll
another bounding-box read.
