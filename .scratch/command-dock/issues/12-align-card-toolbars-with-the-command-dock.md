# 12 — Align Card hover toolbars with the Command Dock through shared components

Status: ready-for-agent
Tags: release/v1
Blocked by: nothing — shared component work can start immediately. Coordinate
with 11 on Card geometry and hover evidence; this ticket must not depend on the
unrelated promotion decisions also captured there.

**What to build:** Hovering a Card reveals a toolbar visually consistent with
the Command Dock. The rail is neutral rather than coloured by the Active Graph.
Graph colour remains visible in the handles and Graph connections. Space Cards
use the same toolbar language and reusable Layout/Graph controls as the Dock.

This is an explicit treatment change requested after the Dock promotion review.
It replaces the coloured Card rail intentionally. It is not permission to change
Card authoring behavior or weaken the geometry evidence recorded in ticket 11.

## Required component boundaries

Reuse is required, not optional. Start with the existing shared Toolbar,
ToolbarButton, Card rail and Dock compositions. Extract reusable presentation
and control compositions into the shared UI package where necessary, and make
both the Dock and Card toolbar consume them. Copying the Dock stylesheet into
the Card stylesheet does not meet this requirement.

Share the surface treatment, control treatment and applicable Layout/Graph
selection compositions. The application continues to own commands and domain
state; React Flow integration continues to own geometry and canvas interaction
isolation. A shared selector accepts its options, selection and operations from
its caller: choosing a Space Card's stored target context is not the same
operation as navigating the containing Space through the Dock.

Refactoring to establish clean boundaries is explicitly authorized. Preserve the
primitive's keyboard and dismissal behavior rather than building another
interactive implementation for the Card. There must be one toolbar focus scope
per Card, not nested toolbar roots around each cluster.

## Acceptance

- [ ] Hovering the Card reveals its toolbar with the Dock's shared neutral
      surface, borders, corners, spacing, typography and control treatment.
      The toolbar remains reachable when moving the pointer onto its controls.
- [ ] Graph colour does not return as a rail band on hover, selection or content
      editing. Handles and Graph connections retain their existing Graph colours
      and Active Graph emphasis.
- [ ] Keyboard focus reveals and retains the toolbar. Preserve the existing
      selected-Card and live-edit access to commands, so authoring controls do
      not disappear while an author is using them.
- [ ] Markdown, Alias and Space Cards share the toolbar composition. Kind-specific
      commands and shared Card commands retain their semantic groups and their
      existing availability rules.
- [ ] An Open Space Card's Layout and Graph choices use the shared control
      compositions and visual treatment used by the Dock. Each operates on the
      correct Space/context and does not navigate or edit the containing Space
      accidentally. Preserve existing read-only and unavailable-choice behavior.
- [ ] Open/Close, Edit/Save/Cancel, title editing and Card entity actions retain
      their behavior. Close remains visible, focusable and unavailable during
      Markdown content editing. Toolbar gestures do not drag, pan, Open or Edit
      a Card underneath them as an unintended second action.
- [ ] Shared components support both a Card's available width and the Dock's
      horizontal/vertical arrangements without clipping controls or focus
      indicators. Check Closed and Open Cards and representative canvas zooms.
- [ ] The visible Card still fills its authored node rect after Open, during
      Resize and after reload, including with entity actions present. Neither
      toolbar wrappers nor broad selectors break nested Card geometry or handle
      hover treatment. Coordinate the underlying regression repair with 11.
- [ ] Update the former coloured-rail claim explicitly to reflect this requested
      design change. Add matching application and Ladle evidence using the real
      shared components and the production entity-actions composition.
- [ ] Demonstrate hover and keyboard operation, neutral toolbar treatment,
      retained connection colour and Space Card selections in both application
      and catalogue. Tests must not compensate for product defects with smaller
      hover targets or automatic dismissal before the gesture being tested.
- [ ] Run verify, application E2E and Ladle E2E; record actual outcomes and inspect
      the resulting toolbar in a browser. Keep unrelated Dock decisions and
      Space Card persistence work outside this treatment change.

## Decision record

The user requires a Dock-consistent toolbar on Card hover, removal of the
coloured hover rail, retention of colour in handles and Graph connections, and
component reuse. The former coloured band is historical treatment; changing it
does not change ADR 0073's toolbar semantics or ADR 0064's authoring lifecycle.
No new ADR is needed solely to change this visual treatment.
