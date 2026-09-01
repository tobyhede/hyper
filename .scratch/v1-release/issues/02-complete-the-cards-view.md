# 02 — Complete the right Cards drawer and Layout membership workflow

Status: resolved
Tags: release/v1
Blocked by: none

**What to build:** Present every Card absent from the selected Layout as an
alphabetical list in the Cards View, a drawer on the right of the canvas. Cards
can be dragged from the drawer into the Layout without deleting or recreating
the Card in the Space.

- [x] The right Cards drawer shows only Cards absent from the selected Layout,
      ordered alphabetically by Title with stable Space order as the tie-breaker.
- [x] Dragging a Card from the drawer onto empty canvas adds it to the selected
      Layout at the pointer position using React Flow's external drag/drop seam.
- [x] Clicking a Card or activating it by keyboard adds it at a deliberate visible
      position, so drag is not the only way to complete the operation.
- [x] Adding an existing Card authors membership and position only. It creates no
      Card, Graph or Edge.
- [x] Remove from Layout removes membership and incident Layout-local Edges only.
- [x] A removed Card immediately becomes available in the drawer; adding it back
      does not restore the removed Edges.
- [x] Delete Card remains a distinct whole-Space action with confirmation.
- [x] Empty, long, narrow-screen, disabled, refused and persistence-failure states
      have application and Ladle evidence.
- [x] The temporary positioned-strategy fallback band is deleted: a Card absent
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

## Answer

The right-side production `CardsDrawer` now owns the Cards View. It derives the
alphabetical absent-Card list from the selected Layout, supports pointer,
keyboard and React Flow external drag/drop placement, and keeps authoring
refusals on the drawer that asked. Removing a selected Card removes only Layout
membership and Layout-local incident Edges; the Card appears in the drawer
immediately and re-adding it does not restore those Edges.

The selected-Card Sidebar controls now offer a separately named whole-Space
Delete Card action behind an `AlertDialog` confirmation. Stable Ladle stories
and paired application evidence cover empty, long, narrow, disabled, refused
and retryable persistence-failure states. The last checklist line was already
true before this work started: `positionedStrategy` projects only authored
Layout membership, its fallback band having been removed earlier, and nothing
under `packages/graph` changed here.
