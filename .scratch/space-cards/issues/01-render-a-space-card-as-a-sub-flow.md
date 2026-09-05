# 01 — Open and edit a Space Card in place

**What to build:** Opening a Space Card shows the Layout and Graph selected
by that Card within the containing Space, and permits the target Space to be
edited without confusing its authored state with the containing Layout.

**Blocked by:** `entity-url-addressability/07` — Author a Space Card reference;
PR 134 delivered the aggregate foundation.

**Status:** resolved — the selected target Layout is editable through its shared session.
Tags: release/v1

- [x] Opening shows the Layout selected by the Space Card, not the target Space's
      own active selection, using that Layout's authored placement and Graph.
- [x] Moving or resizing the Space Card authors the containing Layout.
- [x] Editing content shown through the open Card authors the target Space.
- [x] Interaction and focus behavior remain coherent while the target is open.
- [x] Application, Ladle and adapter evidence covers the selected Layout and
      Graph, editing and resizing, and the forbidden cross-Space connection.

## Composition

The compound canvas uses React Flow sub-flow children, with parents before
children and identities qualified by the full containing Card path. It reuses
the target's production `canvasProjection` and `useCanvasCardAuthoring`.
`embedded-layout.ts` only reparents, offsets and clips that projection; it does
not maintain a second Card, Alias, displacement or Edge derivation.

Opening composes the target through `OpenSpaces.embed` without switching the
active Space. The target has one shared session and one Open Spaces entry.
Embedded gestures complete against the Card's stored Layout through
`SpaceAuthoring.completeInLayout`; they do not change the target's full-canvas
selection or the containing snapshot. Session notifications update every
embedding, including duplicate and nested references.

Cards support selection, movement, Open/Close, Markdown editing, title editing,
resize and removal from their target Layout. One editor owns the compound
canvas at a time; ancestor controls and competing editors stand down until
Save or Cancel. Embedded Cards remain unconnectable and expose no connection
handles. Embedded Edges remain inert: ADR 0040 forbids crossing the Space
boundary, even though React Flow could draw such a connection.

Failed, conflicted and rejected saves mark the target's entry. Its Sidebar
owns recovery, and a conflict dialog appears only when that Space is active.
Exit uses the shared session's retirement rules. Its embedding keeps the last
read as a clipped, readonly drawing; editing it again reopens the session.

## Geometry

Partial Cards and Edges clip to the containing region instead of disappearing
when they no longer fit wholly. Numeric child bounds constrain dragging without
React Flow’s `extent: parent` minimum preventing the containing Card from
shrinking past its children or reaching the Close magnet. Nested content clips against every ancestor.
Clipping updates after Exit when the containing Card is resized. A Space Card
first opens at 960×720; remembered authored Open Size still wins. Ordinary
resize proposals preserve room for the selectors, while the Closed Size magnet
still completes Close and preserves the remembered Open Size.

The embedded Layout uses the compound canvas camera and authored Card sizes.
Resize reveals more of the Layout. Its footer has a fixed reserved height shared
with the projection. Embedded paint order derives from its parent's order;
React Flow's sibling stacking remains the canvas's existing ordering rule.

## Deferred

Cross-Space Edges, cross-Space traversal, nested presenting and their deep URLs
are outside V1. Enter's full command-surface semantics remain issue 11.

## Evidence

- `embedded-layout.test.ts`: production projection, partial clipping, Alias
  content/displacement, handles and duplicate identities.
- `space-card-embedded-layout.test.tsx`: selected target Layout, target-owned
  edits, duplicate/nested editor ownership and retained drawing after Exit.
- `open-spaces.test.ts`: shared embedded sessions and explicit Layout ownership.
- `canvas-card-authoring.test.tsx`: ordinary minimum size and resize-to-Close.
- `space-card.spec.ts`: browser editing, target reload, move, keyboard Open,
  resize, Exit/reopen and forbidden connection handles.
- The stable SelectedLayout Ladle story mounts the production Open Spaces
  application; its browser proof edits the embedded target and reads that edit
  after switching to the target.

### Final verification

- `pnpm verify` — exit 0; 178 test files, 2,163 passed and 2 skipped.
- `pnpm e2e` — exit 0; 159 passed.
- `pnpm e2e:ladle` — exit 0; 79 passed.

An earlier full E2E run timed out waiting for mobile clipboard confirmation.
That test passed in isolation and the final complete suite passed.
