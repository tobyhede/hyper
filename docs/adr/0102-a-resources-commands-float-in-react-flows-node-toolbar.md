# A Resource's commands float in React Flow's NodeToolbar

Status: accepted
Refines: 0064, 0073
Related: 0087

A Resource's commands on the canvas are drawn by React Flow's `NodeToolbar`, above the Resource's top-right corner, while the Resource is the one selected. They are not drawn inside the Resource and they are not revealed on hover.

ADR 0073's toolbar is unchanged: one `role="toolbar"`, roving tabindex, the same groups, the same controls and the shared command surface the Command Dock wears. What changes is where it is drawn and when.

## Why

The toolbar used to sit in a band inside the Resource, inside the canvas's zoom transform. Two things followed from that, and both were reported.

- **It scaled with the canvas.** At 100% its controls matched the Dock's exactly; above 100% it was drawn larger than the Dock, and zoomed out it shrank to a fraction of it. A command's size should not depend on how far the author has zoomed. `NodeToolbar` is drawn outside the viewport transform, so it is the Dock's size at every zoom.
- **It collided with the top anchor.** The top anchor (ADR 0087) reaches twelve canvas units into the Resource at its horizontal centre, and a toolbar of four 28-unit controls right-aligned in a 260-unit Resource needs 128 units where 112 are free beside it. No arrangement of the same controls fits. Outside the Resource, the toolbar clears the anchor by an offset that scales with it.

React Flow draws a node's actions this way, and its own component library keeps a node's identity — its icon and title — inside the node and its actions in the toolbar. Aligning with the library's shape is cheaper than maintaining a second one.

## When it is drawn

`NodeToolbar`'s default, widened and narrowed where the product needs it:

- **The one selected Resource.** Several selected Resources show no toolbar, which is React Flow's default and avoids overlapping toolbars.
- **A running edit, selected or not.** A blur ends no edit (ADR 0064), so an author can deselect a Resource while its Markdown is being written. Save, Cancel and the disabled Close stay drawn until the edit ends; so does Done for a Space Resource's portal Edit.
- **Not while the Resource is dragged or resized.** Each gesture owns the pointer while it lasts.

Hovering a Resource no longer reveals anything. The right-click menu on a Resource still offers the same actions without selecting it.

## A click selects first

A click on a Resource that is not selected selects it, as a click on any React Flow node does. That includes the body of an Open Markdown Resource, which ADR 0064 made one press to edit: its edit target is offered only once the Resource is selected, so the first click selects and the next begins the edit. The Edit command still begins it in one press from the toolbar. Without this, an Open Resource whose band no longer holds the commands would leave almost nowhere to click that selects it rather than editing or renaming it.

## Consequences

- The commands used to be reachable on any Resource without selecting it, which the tests held as a property of the rail. They now need a selection; the actions menu keeps the old reach through the right-click menu.
- ADR 0073's keyboard shape — Tab traverses Resources, the arrows traverse one Resource's commands — does not survive as written. The toolbar is portalled into React Flow's renderer, after the nodes and Edges, so in document order it follows every Resource rather than its own, and Tab from a selected Resource reaches the next Resource, not its toolbar. Inside the toolbar the roving tabindex is unchanged. Bringing the toolbar back into reach from its Resource is open work: `.scratch/resource-node-toolbar/issues/01-reach-a-selected-resources-toolbar-from-the-keyboard.md`.
- The kind glyph stays on the Resource, at its top-right corner, as `ResourceKindIcon` draws it. A node's identity belongs in the node and its actions in the toolbar, which is the split React Flow's own components make. An Open Resource draws no glyph, as before.
- The band at the top of the Resource shrinks from the command strip's room to the glyph's: a Closed Resource's Title has the room the strip took, and an Open Resource's content starts as far from the top as from the sides.
- Where no adapter supplies the seam below — `CanvasResource` drawn outside React Flow, as some stories and unit tests do — the toolbar is drawn in the band, always shown, and the Resource keeps the strip's room below it.
- React Flow stays in `react-flow-adapter`: `CanvasResource` offers a `renderToolbar` seam and `ResourceNode` supplies `NodeToolbar` through it, so `@project/ui` still names no React Flow type.
