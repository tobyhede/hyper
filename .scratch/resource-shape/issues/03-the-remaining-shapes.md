# 03 — Pill, ellipse and hexagon

Status: resolved
Blocked by: 02

**What to build:** the Closed front draws `pill`, `ellipse` and `hexagon` as 02 draws `diamond`: within the fixed Closed Size, Title Lines and glyph in each Shape's inscribed rectangle, handles at the side midpoints each Shape touches.

**Acceptance:** each Shape has a Ladle story and an application proof (ADR 0052); a test asserts every Shape in the set touches all four side midpoints of its bounding rect, so a later addition that does not fails.

## Answer

Built. Every Shape's outline is one table, `resourceShapeOutline(shape)` (`ui/src/resource-shape-outline.ts`), in the Closed Size's own units: the rectangle (drawn by the front's own border), the pill (rect rounded by half its height), the ellipse (rect rounded by half of each axis), the diamond and the hexagon (polygons; the hexagon's side vertices at the side midpoints, its flat top and bottom spanning the top and bottom midpoints). Each entry carries the insets of the rectangle inscribed in it. `drawnResourceShape` now answers the Map's Shape for every Closed Resource; `CanvasResource` draws the outline as an SVG `rect` or `polygon` stretched to the rect and publishes the inscribed insets as `--canvas-resource-shape-inset-inline/-block`, which `canvas-resource.css` lays the kind glyph and Title Lines out in for every Shape but the rectangle. Pill, ellipse and hexagon clamp the Title ladder at three lines; the diamond, whose inscribed rectangle is smallest, keeps two.

- **Every Shape touches all four side midpoints**: `ui/test/resource-shape-outline.test.ts` iterates `RESOURCE_SHAPES` and checks each midpoint lies on the outline, the outline lies within the rect, and the inscribed rectangle's corners lie inside it — a Shape added to the set without an outline that reaches every midpoint fails.
- **Story evidence (ADR 0052)**: `Components/Resource/ResourceShapes` draws every Shape Closed with a one-line and a three-line Title; parity claim `closed-resource-draws-its-shape` is proved by `ladle-e2e/resource.spec.ts` and `e2e/resource-shape.spec.ts` (choosing Pill, Ellipse, Diamond and Hexagon in turn, kept on reload), both through the shared in-browser probe `e2e/resource-shape-outline.ts` (Closed Size, fill at each side midpoint, unfilled corner, Title and glyph inside the fill).
- The story export is `ResourceShapes`, not `Shapes`: `anti-slop/no-shape-in-symbol-names` allows the word only in the `resource shape` compound.
- **Still deferred to 04**: the selection ring and a Reference Resource's dotted border are rectangular on every drawn Shape.
