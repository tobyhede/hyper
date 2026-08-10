# Design detached Markdown Card creation

Type: prototype
Status: resolved
Blocked by: none

## Question

How should an author deliberately create and place a detached Markdown Card in
an Algorithmic View or positioned Layout, then continue naturally into naming
and writing it, without colliding with selection, panning, Edge authoring, or
the existing Option/Alt create-and-connect gesture?

## Prototype

[Detached Markdown Card creation — interaction storyboard](../prototypes/detached-markdown-card-creation.md)

## Answer

Add Card is a toolbar action that immediately creates a blank detached Markdown
Card at the visible graph viewport's center. It is not a placement mode: there
is no ghost, pointer-following state, second canvas click or cancellation step.
The graph-focused `C` shortcut invokes the same operation without overriding
typing, another control, an opened Card, presenting, or a browser shortcut.

If an existing Card already uses the center anchor, creation advances through
small fixed diagonal offsets until it finds an unused anchor. This produces a
visible stack without claiming to solve general collisions, changing any
existing position, or running an arrangement strategy.

Add Card completes one atomic Edit. From an Algorithmic View it copies the
currently rendered placement into a new Layout under ADR 0025, adds the Card at
the chosen center-stack position and selects that Layout. From a positioned
Layout it updates that Layout in place. Only the current Layout gains the new
position; every other Layout remains sparse and unchanged.

When Add Card converts an Algorithmic View, the same Edit creates the new
Layout's required initial empty Active Graph. The operation creates no Edge and
adds no further Graph to an existing Layout. The Card receives the next neutral
`Card N` title, becomes selected, and immediately enters the existing inline
title editor with that title selected. Keyboard activation moves focus into the
input. Cancelling the editor keeps the already-created `Card N`; a valid rename
is a separate Edit.

Creation does not open Markdown content or move the camera. After naming, the
existing Card-open control or `Enter`/`Space` opens the selected Card for
content authoring, allowing rapid spatial outlining to remain on the graph.

Add Card follows the existing graph-authoring availability rule: placement is
ready, nothing is open over the graph, and the Space is not presenting.
Option/Alt create-and-connect remains a separate gesture and does not begin
title editing, because its selected target is meant to continue Route drawing.

The prototype is grounded in React Flow's intended seam rather than a library
prescription: React Flow provides node insertion and screen-to-flow coordinate
conversion, while the application owns the creation gesture and placement
policy.
