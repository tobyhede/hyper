# 04 — Treatments follow the outline

Status: resolved
Blocked by: 03

**What to build:** the selection ring and a Reference Resource's dotted border follow the Shape's outline rather than the bounding rect, for every Shape. An embedded Map (Open Space Resource, Reference to a Space Resource) draws its Resources' Shapes through the shared surface (ADR 0112), and the Shape choice is offered there wherever the embedded Map's policy allows authoring.

**Acceptance:** Ladle stories for a selected and a Reference Resource in a non-rectangular Shape; application E2E changes a Shape inside an embedded Map and sees it in the target Space's own Map.

## Answer

Built.

- **Treatments follow the outline.** `ResourceShapeOutlineDrawing` draws the outline's geometry twice: a ring (`.canvas-resource__outline-ring`, the edge's stroke widened by `--canvas-resource-selected-ring-width` on each side, shown while selected or the Title is being written) beneath the edge (`.canvas-resource__outline-edge`, which fills and strokes). A Reference Resource's edge is dotted along the outline (`stroke-dasharray` of round dots) and solid once it leaves rest, as the rectangle's border is. A drawn Shape withdraws the rect's box shadows, and its drag shadow is a `drop-shadow` of the outline. The rectangle keeps its border and box shadow. `--canvas-resource-selected-ring-width` (`tailwind.css`) is now the one ring width both read.
- **Short Titles on a Shape.** A Closed Resource in a Shape other than the rectangle draws its short Title (`shortTitle` from `@project/core`): the name on one line, with "…" when more Title Lines follow, ellipsised where it is wider than the inscribed rectangle. The Title ladder stays in the heading, visually hidden, so the heading's accessible name is every Title Line as on the rectangle; inline Title editing still writes the whole Title. The rectangle — Open or Closed — and every Open, editing and presented front draw the ladder exactly as before this feature. A design pass on Titles inside Shapes comes later.
- **Embedded Maps.** Nothing new was needed in production: the drawn Map's projection already carries Shapes, and `useResourceRailActions` over the drawn surface offers the Shape choice only where the drawn Map's availability allows authoring (read-only and inert drawings withhold it). `space-resource-embedded-map.test.tsx` proves the choice writes the target Space's Map and leaves the containing one alone.
- **Evidence (ADR 0052).** New story `Components/Resource/ResourceShapeTreatments` (selected, Reference and selected Reference in each drawn Shape) with parity claim `closed-resource-treatments-follow-its-shape`, proved by `ladle-e2e/resource.spec.ts` and `e2e/resource-shape.spec.ts` through the shared probe `outlineTreatment` (`e2e/resource-shape-outline.ts`). `ResourceShapes` gains an overlong-Title row, and the shared `drawnOutline` probe now answers `shortTitle` (its text, one line and ellipsised, inside the body) for both proofs of `closed-resource-draws-its-shape`. `e2e/space-resource.spec.ts` changes a Shape inside an Open Space Resource, sees it drawn read-only through a Reference Resource with no commands, and sees it on the target Space's own Map when entered and after reload.
