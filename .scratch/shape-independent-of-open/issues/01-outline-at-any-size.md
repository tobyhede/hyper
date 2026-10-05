# 01: A Shape's outline at any size

**What to build:** the Shape outline and its inscribed rectangle are answered for a Shape and a size, not in fixed Closed Size units, and the front draws the outline at its current rect without stretching it. Ellipse, diamond and hexagon fill the rect proportionally; a pill's corner radius is half the smaller side, so its ends stay half-circles; the hexagon's point inset is a quarter of the width, capped at half the height. A prefactor: Closed Resources look exactly as they do now, because the Closed Size is the only size a Shape is drawn at until ticket 03.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] The outline unit test is parameterised by size (a property test over sizes): every outline touches the midpoint of each side of its rect, the inscribed rectangle lies inside the outline, and the pill's radius is half the smaller side.
- [x] The front's outline drawing and inscribed insets follow the Resource's current rect rather than the Closed Size constant.
- [x] The existing Shape E2E and Ladle proofs pass unchanged.

**Resolution:** `resourceShapeOutline(shape, size)` answers the outline and inscribed insets for any `OutlineSize`; at the Closed Size it answers what it answered before. `CanvasResource` takes an optional `size` (the Closed Size when absent), draws the outline's SVG with that rect as its `viewBox` and publishes the insets as shares of it; `ResourceNode` supplies React Flow's declared `width`/`height`. The outline test is a fast-check property over sizes, and `CanvasResource.test.tsx` holds the drawing's units to the rect it is given.
