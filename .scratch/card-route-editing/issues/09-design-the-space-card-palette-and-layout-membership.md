# Design the Space-card palette and Layout membership

Type: prototype
Status: resolved
Blocked by: 06

## Question

How should an author discover Space Cards absent from the current Layout, add
one at a deliberate position through React Flow's external drag-and-drop seam,
create an accessible keyboard-equivalent placement, distinguish existing-Card
placement from new-Card creation, and handle empty, large, searched, or already
present Card sets without turning the palette into a second Card editor?

## Prototype

[Space-card palette and Layout membership — interaction storyboard](../prototypes/space-card-palette-and-layout-membership.md)

## Answer

A stable **Cards** toolbar trigger opens the **Cards View** in a fixed-width
shadcn Sidebar docked to the left of the canvas. The approximately 300px panel holds one vertical column
of full 260×146 Card Fronts and collapses off-canvas; version 1 does not add
resizing. `Cmd+B`/`Ctrl+B` follows the familiar VS Code convention. The trigger
has no count and remains visible but disabled outside a selected Layout. Opening,
closing, searching and switching Layouts are session navigation rather than
Edits, never move the camera, and never enter the Space document.

The Cards View shows only Space Cards absent from the current Layout, alphabetised
by title with stable Space order as a tie-breaker. Search remains fixed in its
header and matches title, description and visible Alias target title, not
Markdown bodies. The palette distinguishes all-Cards-present, no-search-match
and no-Space-Cards empty states. It offers no Card or Alias creation, editing,
deletion, content preview, Route facts, counts or overflow actions.

Sidebar Cards render the same full Card Front as primary canvas Cards: dimensions,
title, description, kind icon, Alias target, typography and styles are shared.
A reusable UI module owns that Front. The React Flow CardNode adapter wraps it
with handles, selection and canvas behavior; the app-specific Sidebar wraps it
with search and placement behavior. This is a deliberate adaptation beyond the
React Flow demo, whose Sidebar items and node renderer are unrelated.

Clicking a Card Front or activating it with `Enter` invokes **Add to
Layout** at the visible canvas center, reusing Add Card's diagonal exact-anchor
offset rule. Native HTML dragging follows React Flow's official external
Sidebar example and converts the pointer with `screenToFlowPosition`; the
pointer represents the Card center and only genuine empty canvas accepts the
drop. No rectangle collision resolution or external-drag edge auto-pan is
added. A completed drag suppresses click, while cancellation, stale identity,
availability change, presentation, Space close or Layout change produces no
Edit.

The Cards View uses shadcn Command and inherits its search, active-result,
selection, and focus behavior. Opening focuses Search; `Enter` places the active
result, while `Space` remains text input. `Escape` closes the Sidebar and lets
`Tab` leave normally. Successful keyboard placement moves focus to the new canvas
Card; pointer placement selects without forcing focus. Removal can transfer focus
back to the matching open Sidebar Card, but never clears Search or opens a closed
Sidebar as a side effect.

The drag carries only `CardId`. One deep authoring operation re-reads current
state, validates Card and Layout membership, installs the complete membership-
and-position Edit, and persists it. It creates no Route or Edge. Retryable
failure and conflict use the existing optimistic Space-level recovery. The
Sidebar and React Flow projection own no domain snapshot and never coordinate
partial mutations.

Presenting and an opened Card editor temporarily hide rather than close the
Sidebar, preserving its state. Closing and reopening in one Layout preserves
Search and scroll; switching Layouts retains Search but resets results to the
top; another Space or reload starts closed and clear. Touch dragging remains
outside this effort.
