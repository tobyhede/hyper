# Structural deletion interactions — interaction storyboard

Status: accepted prototype

## Domain frame — deletion has two scopes

```text
Space
├── Cards
└── Layouts
    └── Layout
        ├── positioned Card subset
        └── ordered Routes
            └── directed Edges between Cards in this Layout
```

A Layout explicitly owns its Card membership and positions. It also owns one
or more Routes over that shared Card set. Every Edge endpoint must be a Card in
the owning Layout.

Routes are not reused across Layouts. A Route-scoped Algorithmic View may
borrow a Route as its subject; editing that View creates a new Layout and copies
the Route under a new identity, leaving the source unchanged.

## Frame 1 — arm Remove from Layout

```text
┌ Current Layout ───────────────────────────────────────────────────┐
│                                                                  │
│    ┌──────────┐       ┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓                │
│    │ Card A   │──────▶┃ Card B                   ┃                │
│    └──────────┘       ┃ Remove from Layout       ┃                │
│                       ┃ 3 Edges · press again    ┃                │
│                       ┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛                │
│                              │                                   │
│                              ▼                                   │
│                       ┌──────────┐                               │
│                       │ Card C   │                               │
│                       └──────────┘                               │
└──────────────────────────────────────────────────────────────────┘
```

With exactly one Card selected, the first `Delete` or `Backspace` arms
**Remove from Layout**. The Card's selected state becomes bold and red and
shows concise consequences: **Remove from Layout · N Edges** when incident
Edges will also be removed. Its accessible description announces the same
consequence and **Press again to confirm**. No dialog, contextual toolbar, or
delete icon appears.

A second `Delete` or `Backspace` completes one Edit. `Escape`, deselection,
opening the Card, selecting another Layout, or selecting another target
disarms it. Multi-selection is disabled; bulk removal is out of scope.

## Frame 2 — remove atomically, then make re-adding possible

```text
┌ Space Cards ───────────┐  ┌ Current Layout ──────────────────────┐
│                        │  │                                      │
│ [Card B] ── drag ─────────▶             drop position ×          │
│                        │  │                                      │
└────────────────────────┘  └──────────────────────────────────────┘
```

Confirmation atomically removes the Card's position and every incident Edge
from every Route owned by the current Layout. The Card remains in the Space,
in other Layouts, and as a possible Alias target. Affected Routes remain even
when empty, and the Layout may become empty.

The removed Card becomes available in the Space-card palette. Dragging it back
into the Layout writes membership and a position at the drop point; it never
recreates the deleted Edges. Edge intent must be authored again. The palette's
complete interaction and keyboard design belongs to **Design the Space-card
palette and Layout membership**.

## Frame 3 — the Card editor separates both operations

```text
┌ Card editor ──────────────────────────────────────────┐
│ Title                                                 │
│ [Card B_____________________________________________] │
│                                                       │
│ [Remove from Layout]                                  │
│                                                       │
│ ───────────────────────────────────────────────────── │
│ [Delete Card from Space]                              │
└───────────────────────────────────────────────────────┘
```

The existing Card editor provides the pointer-accessible path. **Remove from
Layout** is the first and primary structural action when the Card is opened
from a Layout. **Delete Card from Space** is separated below it. Each uses the
same two-activation armed-button convention; blur, `Escape`, closing the
editor, or changing target disarms it.

Deleting a Card from the Space atomically removes it from every Layout and
removes every incident Edge from every affected Layout-owned Route. Empty
Routes and Layouts remain. Deleting an Alias leaves its target untouched. A
non-Alias Card with incoming Aliases cannot be deleted: the button is
unavailable and the editor identifies the Aliases that must first be
retargeted or deleted. Removing that Card from one Layout is never blocked by
incoming Aliases.

The armed Card deletion uses concise aggregate consequences such as **Delete
from Space · 4 Layouts · 7 Edges**. An armed Alias deletion additionally says
that its target remains.

## Frame 4 — reconnect or delete the active Route's Edge

```text
┌ Current Layout ───────────────────────────────────────────────────┐
│                                                                  │
│  ┌────────┐          ┌────────┐          ┌────────┐              │
│  │ Card A │─────────▶│ Card B │          │ Card C │              │
│  └────────┘          └────────┘          └────────┘              │
│       drag target endpoint ────────────────────┘                  │
│       drop on empty pane ────────────────▶ delete Edge           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Only the active Route's Edges expose authoring. Dragging one endpoint to a Card
in the same Layout reconnects exactly that endpoint while keeping the Edge in
the same Route. Self-Edges are valid. Returning to the original Card is a
no-op. A duplicate directed pair is invalid during the drag and snaps back
without an Edit.

Dropping an endpoint on genuine empty graph canvas deletes the Edge. Dropping
outside the canvas or cancelling restores it. A selected active-Route Edge may
also be deleted immediately with `Delete` or `Backspace`; Edge deletion has no
armed state. Removing the final Edge leaves the Route empty.

## Frame 5 — delete a Layout-owned Route

```text
┌ Route manager ────────────────────────────────────────┐
│ Routes in this Layout                                │
│ ● Introduction                                      │
│ ● Questions                                         │
│                                                     │
│ [Delete Route]  →  [Confirm Delete · 4 Edges]       │
└─────────────────────────────────────────────────────┘
```

**Delete Route** uses the two-activation armed-button convention. Confirmation
removes only that Route from its Layout and is disabled for the last Route.
Cards, positions, other Routes, and other Layouts remain untouched. The first
surviving Route becomes active. The manager stays open.

## Validation and persistence

- Cancellation and invalid gestures produce no Edit.
- The authoring module computes and validates the complete next Space before
  installing it; validation failure leaves the prior Space visible and reports
  the error on the initiating surface.
- A valid Edit installs optimistically and remains visible during persistence.
- A retryable failure retains the local Edit and uses the existing persistence
  retry action.
- A conflict retains local work until the Space-level conflict is resolved.
  Accepting stored state may restore removed Cards or Edges; keeping local work
  recommits the complete local snapshot.
- There is no deletion-specific rollback, recovery dialog, or implicit undo
  history. Each completed gesture is one semantic authoring command so a
  future bounded undo history can record it without treating React Flow's
  projection as authoritative state.
