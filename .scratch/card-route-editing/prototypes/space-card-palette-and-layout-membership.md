# Space-card palette and Layout membership — interaction storyboard

Status: accepted prototype

## Frame 1 — the Cards Sidebar is a staging area

```text
┌ Hyper toolbar ────────────────────────────────────────────────────┐
│ [Views] [Layouts] [Routes] [Cards]                               │
├──────────── Cards ────────────┬──────────────────────────────────┤
│ [Search_____________________] │                                  │
│                               │       Current Layout             │
│ ┌───────────────────────────┐ │                                  │
│ │ Card B                    │ │    ┌───────────────────────────┐ │
│ │ A concise description     │ │    │ Card A                    │ │
│ └───────────────────────────┘ │    └───────────────────────────┘ │
│                               │                                  │
│ ┌───────────────────────────┐ │                                  │
│ │ ↳ Alias occurrence        │ │                                  │
│ │ Target Card               │ │                                  │
│ └───────────────────────────┘ │                                  │
└───────────────────────────────┴──────────────────────────────────┘
```

The stable **Cards** toolbar control opens a shadcn Sidebar docked to the left
of the canvas. It is about 300px wide: enough for the existing 260×146 Card
Front plus normal padding. It is fixed-width in version 1 and uses Sidebar's
off-canvas collapse rather than introducing resizing. `Cmd+B` on macOS and
`Ctrl+B` elsewhere use the familiar VS Code convention to toggle it.

The Sidebar is available only while a Layout is selected. Its toolbar trigger
stays visible but disabled otherwise, with the accessible explanation **Select
a Layout to add existing Cards**. It carries no count or badge.

Opening, closing and searching are navigation, not Edits. State belongs to the
current Space session: closing and reopening the same Sidebar retains Search
and scroll, while opening another Space or reloading starts closed with an
empty query. Switching Layouts keeps the Sidebar open and retains Search but
resets the changed result set to the top. Opening or closing never runs
`fitView`, changes Layout positions or otherwise moves the camera.

Presenting and opening a Card editor temporarily hide the Sidebar without
changing its open state, Search or scroll. It reappears when that surface
closes.

## Frame 2 — the same Card Front, in a different context

The Sidebar shows only Space Cards absent from the current Layout. Cards
already in the Layout are on its canvas; duplicating them in an inventory would
turn the palette into a second Card browser and permit an invalid second
position for the same Card.

Each source is the same full Card Front the canvas renders: same dimensions,
title, optional description, typography, Space or Alias kind icon, and visible
Alias target title. Markdown remains the unmarked default. There are no
thumbnails, compact rows, alternate scales, content previews, Route facts,
Layout counts, edit buttons or overflow actions. The Sidebar Front has no
React Flow handles or canvas-only editing controls because those belong to the
React Flow wrapper, not to the Front.

The visual implementation is shared by construction. A reusable Card Front UI
module renders the appearance. The React Flow CardNode adapter wraps it with
handles, selection and canvas behavior; the app-specific Sidebar wraps it with
search and placement behavior. shadcn Sidebar supplies only the docked shell.

Cards are sorted alphabetically by title, with stable Space order as the
tie-breaker. The fixed **Search** field matches case-insensitively against the
visible identifying metadata: Card title, description and Alias target title.
It does not search Markdown bodies.

The three empty states are distinct:

- **All Space Cards are in this Layout.**
- **No matching Cards.**
- **This Space has no Cards.**

One Card is the new-Space starting state, not a permanent minimum; deleting the
last Space Card remains valid. The Sidebar contains no Add Card, Add Alias,
edit, delete or other creation action. Existing toolbar actions create Cards;
the Card editor changes or deletes them; this Sidebar only adds existing Cards
to the Layout.

## Frame 3 — click for center placement

```text
┌ Cards ─────────────────┬──────────── Current Layout ─────────────┐
│                        │                                         │
│ ┌────────────────────┐ │                 × center                │
│ │ Card B             │ │                                         │
│ └────────────────────┘ │                                         │
└────────────────────────┴─────────────────────────────────────────┘
```

Clicking a Sidebar Card Front invokes **Add to Layout** at the visible canvas
center. If another Card already uses that exact anchor, Hyper reuses Add Card's
small fixed diagonal offset sequence until it finds an unused anchor. It does
not solve rectangle collisions or move existing Cards.

The completed action writes the existing Card's membership and initial
position as one Edit, selects it on the canvas, removes it from the Sidebar and
keeps the Sidebar open. It does not create, rename, open or connect the Card.

## Frame 4 — drag for deliberate placement

```text
┌ Cards ─────────────────┬──────────── Current Layout ─────────────┐
│ ┌────────────────────┐ │                                         │
│ │ Card B             │─┼──────── drag ───────────────▶ [Card B]  │
│ └────────────────────┘ │                              empty pane  │
└────────────────────────┴─────────────────────────────────────────┘
```

Pointer dragging follows React Flow's official native HTML Drag and Drop
example: an external Sidebar source, drag context, `onDragOver`/`onDrop`, and
`screenToFlowPosition`. Hyper adapts the payload from a node type to a `CardId`
and replaces the example's direct React Flow `setNodes` mutation with one
authoring operation.

The ordinary browser drag image is the full Card Front, so the author appears
to pick up the same Card that lands on the canvas. The pointer represents the
Card's center. Only genuine empty React Flow canvas is eligible; an existing
Card, toolbar, Sidebar, editor or point outside the renderer refuses the drop.
“Empty” describes the pointer target, not the Card rectangle: partial overlap
after placement is valid authored geometry.

A completed drag suppresses the click that would otherwise add the same Card
again at center. Dropping outside the eligible canvas, pressing `Escape`,
switching Layouts, closing the Space, beginning presentation, or finding that
the Card has become unavailable cancels without an Edit. A drag remains bound
to the Layout it started from and never silently targets an old hidden or newly
selected Layout. Version 1 adds no external-drag edge auto-pan; the author may
pan first or center-add and move the Card afterward. Touch dragging remains out
of scope.

## Frame 5 — keyboard placement and focus

```text
Cards trigger → Search → Card Front → canvas Card
 Cmd/Ctrl+B      ↓          Enter        arrow-key refinement
                 results
```

The Cards View uses shadcn Command and inherits its search, active-result,
selection, and focus behavior. Opening focuses **Search**. Each full Card Front
is a Command item; `Enter` invokes the same center-and-offset action as a pointer
click, while `Space` remains ordinary Search input. `Tab` leaves normally, and
`Escape` closes the Sidebar without clearing Search and returns focus to the
Cards trigger.

Successful keyboard placement moves focus to the new canvas Card, where the
current renderer's Graph-navigation or React Flow movement rules apply and
ordinary Card opening remains available. Pointer placement selects the Card
without forcing keyboard focus.

When keyboard removal returns a Card to an open Sidebar, focus follows it if it
matches the current Search. If Search filters it out, Hyper preserves the query,
returns focus to the canvas and announces that the Card is available but hidden
by Search. A closed Sidebar never opens as a side effect of removal.

## One deep authoring operation

The drag carries only Card identity, never a Card snapshot or React Flow node.
The completed interface is conceptually **Add to Layout(CardId, position)**: it
re-reads the current Space and Layout, validates that the Card still exists and
is absent, computes the complete next Space, installs it, and emits the Edit.
The Sidebar and React Flow adapter never coordinate partial state changes.

**Add to Layout** creates no Route or Edge, even when a Route is active. A
re-added Card is detached and deleted Edges are never inferred or restored.

Cancelled and invalid interactions produce no Edit. A valid click or drop is
installed optimistically and disappears from the Sidebar immediately.
Retryable persistence failure keeps the local placement and uses the existing
retry action; conflict keeps it until Space-level resolution. Accepting stored
state may return the Card to the Sidebar. No placement draft survives
completion.

## Implementation proof obligation

React Flow's example proves the external HTML drag and coordinate-conversion
mechanics, and its custom-node contract permits an ordinary React component as
the inner node rendering. Hyper's complete adaptation still needs a browser
test. Implementation acceptance covers drag after pan and zoom, empty-target
validation, cancellation and Layout switching, click suppression, keyboard
center placement and focus, persistence across reload, and identical Card Front
rendering in both surfaces.
