# 02 — Diamond on the canvas

Status: resolved
Blocked by: 01

**What to build:** a Shape choice in the Resource's Actions menu on its rail, drawn with `ChoiceMenu`, listing the five Shapes with the current one selected; each choice completes the Edit from 01. It is offered while Open as well as Closed. A Closed Resource whose Shape is `diamond` draws a diamond inside the fixed Closed Size; its Title Lines and kind glyph lay out in the inscribed rectangle and truncate as they do now. Handles stay at the side midpoints, which the diamond touches. An Open, editing or presented Resource draws as a rectangle whatever its Shape, and the diamond returns on Close. Every other Shape still draws as the rectangle until 03.

Start with `$shadcn-first-ui`; the outline treatment needs a design-system inventory entry or an `@project/ui` build (ADR 0052).

**Acceptance:** application E2E chooses Diamond from the Actions menu, sees the Closed diamond survive reload, Opens it to a rectangle and Closes it back to a diamond, and draws an Edge to it that meets the outline; unit tests cover the menu's selection and the Open/presented rectangle rule.

## Answer

Built. The Actions menu on a Resource's rail (and its right-click twin) carries a **Shape** row after Connect to Resource, opening a nested `ChoiceMenu` of the five Shapes with the Map's recorded one checked. Each choice runs `changed-resource-shape` through the new `resource-shape` command channel ("Shape not changed"). The row is offered whenever the Map may be authored, Open or Closed alike.

- **Menu**: `ChoiceMenu` gained `nested` (Base UI `SubmenuRoot`) and `ChoiceMenuSubmenuTrigger`; `EntityActionsMenu` admits an `EntityActionChoice` entry (`EntityActionGroup` is now `readonly EntityActionEntry[]`), each option carrying its own `onChoose`. `spaceEntityActions` answers the narrower `EntityCommandGroup` so the Dock can still spend a command by id. `resourceRailGroups` takes `resourceShape: { current, choose } | null`.
- **Projection**: `canvasProjection` reads each entry's `shape` into `projectResourceNodes`' `resourceShapes`; `ResourceNodeData.shape` carries it whatever the display, and `ResourceNode` hands it to `CanvasResource`.
- **Drawing**: `drawnResourceShape(display, shape)` (`ui/resource-display.ts`) is the rule — the Map's Shape only while Closed, the rectangle for Open, editing, replacing and presented; pill, ellipse and hexagon draw as the rectangle until 03. `CanvasResource` publishes it as `data-resource-shape` and draws `ResourceShapeOutline`, an SVG diamond stretched to the rect (vertices at the side midpoints, non-scaling stroke); `canvas-resource.css` withdraws the front's own border and fill for it and lays the Title (two lines, centred, clipped) and kind glyph in the inscribed rectangle. The hover face now sets `--canvas-resource-face` so the outline takes the same active face. Handles are unchanged.
- **Deferred to 04**: the selection ring is still the rectangular `box-shadow`, and a Reference Resource's dotted border is not drawn on the diamond; no Ladle story yet.

Tests: `ui/test/resource-display.test.ts` (Open/presented/editing/replacing rectangle rule, property-based), `ui/test/CanvasResource.test.tsx`, `ui/test/EntityActionsMenu.test.tsx` (nested choice from the icon and the right click), `react-flow-adapter/test/projection.test.ts` and `ResourceNode.test.tsx`, `app/test/canvas-projection.test.ts`, `app/test/app-derivations.test.ts` and `app-hooks.test.tsx` (the choice's options and the Edit landing on the Map), `app/test/command-outcomes.test.ts`, and `packages/app/e2e/resource-shape.spec.ts` (choose Diamond, survives reload, Open draws the rectangle with Diamond still chosen, Close draws the diamond; an Edge drawn into the diamond ends at its bottom vertex). Every menu-grouping assertion (unit, application E2E and Ladle E2E) gained the `Shape` row.
