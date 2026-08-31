# 02 — Complete the right Cards drawer and Layout membership workflow

Status: ready-for-agent
Tags: release/v1
Blocked by: none

**What to build:** Present every Card absent from the selected Layout as an
alphabetical list in the Cards View, a drawer on the right of the canvas. Cards
can be dragged from the drawer into the Layout without deleting or recreating
the Card in the Space.

- [ ] The right Cards drawer shows only Cards absent from the selected Layout,
      ordered alphabetically by Title with stable Space order as the tie-breaker.
- [ ] Dragging a Card from the drawer onto empty canvas adds it to the selected
      Layout at the pointer position using React Flow's external drag/drop seam.
- [ ] Clicking a Card or activating it by keyboard adds it at a deliberate visible
      position, so drag is not the only way to complete the operation.
- [ ] Adding an existing Card authors membership and position only. It creates no
      Card, Graph or Edge.
- [ ] Remove from Layout removes membership and incident Layout-local Edges only.
- [ ] A removed Card immediately becomes available in the drawer; adding it back
      does not restore the removed Edges.
- [ ] Delete Card remains a distinct whole-Space action with confirmation.
- [ ] Empty, long, narrow-screen, disabled, refused and persistence-failure states
      have application and Ladle evidence.
- [ ] The temporary positioned-strategy fallback band is deleted: a Card absent
      from a Layout is represented by the drawer, not fabricated canvas geometry.

## Settled interaction source

This is the implementation of the resolved Cards View research in
`.scratch/card-route-editing/issues/09-design-the-space-card-palette-and-layout-membership.md`
and its storyboard. Keep the release implementation concise: a right drawer, an
alphabetical absent-Card list, and Add/Remove Layout membership. Search and rich
Card Front treatment may reuse the settled design, but are not substitutes for
the list or drag-to-place workflow. Its earlier left-docked placement is
superseded: the application Sidebar owns the left edge, so the Cards drawer is
on the right.

## Ladle prototype under review

`Review/Cards Drawer/Full Cards` carries the chosen treatment in the reusable
production-component application harness. The right drawer shows full Cards
beneath a full-width **Filter** row and a separate full-width **Search cards**
input, with no heading or explanatory exposition. The first filter is Card kind:
Markdown, Space and Alias. Drawer Cards render outside the React Flow `CardNode`
wrapper: hovering one must not reveal connection handles or canvas-only controls.
