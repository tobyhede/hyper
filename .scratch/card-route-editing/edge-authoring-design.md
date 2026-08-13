# Edge Authoring module design

Status: accepted architecture design

## Outcome

Edge Authoring is one app module for the complete Edge interaction lifecycle.
It translates React Flow and DOM events into domain proposals. It asks Space
Authoring for eligibility and completed Edits. It does not own Graph rules or a
second Edge collection.

The module covers these paths:

- pointer connection
- Option/Alt empty-drop create-and-connect
- keyboard target selection
- pointer reconnection
- keyboard endpoint editing
- Edge selection and toolbar controls
- Edge deletion
- cancellation, refusal and replacement invalidation
- focus continuation after a projected Edge disappears

The old `connection-gesture` module and the Edge state in `SpaceCanvas` are
replaced. They are not wrapped by a second implementation.

## Ownership

### Render adapter

The render adapter owns:

- the published React Flow projection
- Card movement state
- one discriminated canvas selection: `none | card | edge`
- the controlled mirror of React Flow's selection changes

The render adapter does not own Edge interaction drafts or refusal messages.
With multi-selection disabled, React Flow itself emits the changes that clear
the other element kind. Hyper does not implement a second mutual-exclusion
policy.

### Space Authoring

Space Authoring owns:

- Graph and Layout eligibility rules
- duplicate-Edge checks
- the complete semantic Edit
- `completed`, `unchanged` and `refused` outcomes
- replacement epoch publication

It exposes one Edge eligibility query. The query accepts a domain proposal for
connect, create-and-connect or reconnect. It returns `eligible` or a refusal
reason. Completion validates the same proposal again because the Space can
change after preview.

`queued` remains an internal answer for a re-entrant completion made during
Space Authoring publication. A React Flow event cannot normally receive it.
Edge Authoring reports it as an invariant violation if it does.

### Edge Authoring

Edge Authoring owns:

- the one current Edge interaction draft
- the refusal associated with that draft
- stable React Flow event callbacks
- the pure empty-drop decision and its preview and release fact suppliers
- the app-specific authorable routed Edge
- `EdgeToolbar`, Popover and Card-picker composition
- pending focus continuation when a completed projection removes an element

Edge Authoring can import React Flow and use the DOM. Its interface to Space
Authoring stays in Hyper domain language.

### React Flow adapter

`react-flow-adapter` continues to own the reusable `RoutedEdge` and projection
details. It does not learn about Popovers, authoring commands or Space
Authoring.

The app-specific authorable Edge composes `RoutedEdge`. It does not duplicate
the route drawing implementation.

### SpaceCanvas

`SpaceCanvas` mounts React Flow and composes canvas concerns. It passes the
Edge-owned React Flow properties explicitly. It does not interpret connection,
reconnection or Edge deletion events.

React Flow exposes one `onBeforeDelete` callback for both nodes and Edges. A
thin canvas dispatcher applies this structural routing rule:

- when `nodes` is non-empty, route the request to Card Authoring and ignore the
  incident `edges` React Flow included
- otherwise, route the requested Edge to Edge Authoring

This is event-shape translation, not a deletion rule. React Flow includes every
deletable Edge connected to a requested node before it calls `onBeforeDelete`.
Without this routing, one Card removal would also look like several independent
Edge deletion commands. The dispatcher awaits the routed semantic operation
and returns `false` for the complete combined payload. React Flow then removes
nothing locally; a completed Edit supplies the next controlled projection.

## React Flow alignment

Hyper uses the React Flow mechanism unless Hyper has an additional domain fact.

| Concern | React Flow mechanism | Hyper addition |
| --- | --- | --- |
| Selection | Controlled `onNodesChange` and `onEdgesChange`; native cross-kind clearing | One discriminated controlled mirror |
| Multi-selection | `multiSelectionKeyCode`, `selectionKeyCode`, `selectionOnDrag` | Disabled for version 1 |
| Connection | `onConnectStart`, `onConnect`, `onConnectEnd` | Space Authoring eligibility and Edit |
| Final drop | `FinalConnectionState` | DOM hit-test only distinguishes empty canvas from off-canvas |
| Reconnection | `onReconnectStart`, `onReconnect`, `onReconnectEnd`; React Flow hides the Edge during the drag | No optimistic domain change; the original returns after the drag until the Edit completes |
| Deletion | Configured Delete keys and selected elements | `onBeforeDelete` routes the semantic Edit |
| Edge rendering | Custom Edge and `EdgeToolbar` | `RoutedEdge` path plus Hyper controls |
| Accessibility | Per-Edge focusability, selection, ARIA and DOM attributes | Active Graph labels, focus-to-selection bridge and Escape focus repair |

React Flow selection identifies the deletion subject. Browser focus does not
restrict that subject. React Flow's normal input protection leaves text editing
unchanged. Hyper's toolbar root uses React Flow's `.nokey` escape hatch so the
document-level handler does not treat toolbar keys as canvas commands.

Hyper does not apply React Flow's local remove or reconnect change before Space
Authoring completes. `onBeforeDelete` prevents local deletion. Reconnection
callbacks report the proposed endpoint without calling `reconnectEdge`. The
next controlled projection contains the completed Space.

## Selection

The canvas selection has these states:

```text
none
card(cardId)
edge(graphId, edge)
```

The React Flow configuration disables both modifier multi-selection and the
selection rectangle:

```tsx
multiSelectionKeyCode={null}
selectionKeyCode={null}
selectionOnDrag={false}
```

Selecting a Card clears the selected Edge. Selecting an Edge clears the
Selected card. An Edge outside the Active Graph is not selectable or focusable
and cannot remain selected.

Selection changes come through the controlled change callbacks. Edge Authoring
does not add `useOnSelectionChange` as a second observer.

One React Flow selection action produces two callback batches: it first selects
one kind and then deselects the other kind. The controlled union is updated
additively. A `selected: true` change installs that subject. A `selected: false`
change clears the union only when it names the subject currently stored. Thus,
the second cross-kind deselection cannot replace the new selection with `none`.

React Flow does not select an Edge when it receives focus. Hyper uses the
Edge's `domAttributes.onFocus` to install that Edge as the selected subject.
This is required so Tab to Edge followed by Delete acts on the Edge the keyboard
user reached.

## One interaction draft

At most one Edge interaction draft exists. These draft kinds are mutually
exclusive:

- pointer connect
- keyboard connect
- pointer reconnect
- keyboard reconnect

Starting one cancels the current draft. Escape cancels only the topmost Edge
surface. A refusal retains the relevant draft and its message until the author
changes the proposal or cancels it.

The module cancels its draft when:

- the replacement epoch changes
- the selected renderer changes
- the Active Graph changes
- selection moves away from the draft's owning Edge or source Card
- the draft's Card, Graph or Edge disappears

An unrelated completed Edit does not cancel the draft while its subject and
context remain valid.

## Pointer connection

Preview and release use the same pure empty-drop decision, but they do not use
the same live DOM fact supplier. The preview reads the last `onMouseMove` fact
from the React Flow container. Release uses `document.elementFromPoint` at the
final pointer coordinates. Therefore, a preview can remain visible after the
pointer leaves the canvas, while release correctly refuses the off-canvas drop.

This disagreement is retained deliberately. Making the preview exact would add
a document-level pointer listener and `elementFromPoint` on every pointer frame.
The current handler stores only a changed, non-positional classification so it
does not rerender the flow for every movement. Package 7 does not add the
per-frame hit-test without a measured performance reason.

`onConnectEnd` uses React Flow's `FinalConnectionState` as the primary result.
DOM hit-testing adds only the Hyper distinction between:

- an empty-canvas drop
- an off-canvas drop

Option/Alt plus an eligible empty-canvas drop requests create-and-connect. An
ordinary empty or off-canvas drop cancels without an Edit.

Pointer and keyboard paths form the same domain proposal before eligibility or
completion. Space Authoring is the sole source of eligibility.

The current render-adapter connection methods are replaced by one connection
completion coordinator that Edge Authoring consumes internally. It coordinates
the rendered Placement, Space Authoring completion, and projection
reconciliation. Edge Authoring decides when a connect or create-and-connect
interaction completes; the render adapter does not interpret pointer or
keyboard gestures. Edge Authoring invokes Space Authoring directly for
reconnect and delete because those completions carry no rendered Placement and
need no projection reconciliation.

The old render-adapter comment and tests that treat `queued` as a normal
connection outcome are replaced with the coordinator. At the new React Flow
event seam, `queued` is an invariant violation rather than an interaction
outcome.

## Keyboard connection

The keyboard target picker lists every Card in the current Layout. A self-Edge
is eligible. A known exact duplicate is disabled. The completion can still
return `refused` if the Space changed while the picker was open.

Successful keyboard connection selects and focuses the target Card. Escape
restores the source Card.

## Reconnection

Pointer reconnection uses all three native callbacks:

- `onReconnectStart` captures the original Edge and endpoint.
- `onReconnect` records the proposed connection and requests the semantic Edit.
- `onReconnectEnd` distinguishes success, cancellation and empty-drop deletion.

React Flow hides the custom Edge from `onReconnectStart` until
`onReconnectEnd`. Hyper does not force it visible during that interval. When
the drag ends, React Flow renders the current controlled projection: the
original Edge if the completed projection has not arrived, or its replacement
if it has. Edge Authoring does not call React Flow's `reconnectEdge` helper.

The reconnect eligibility proposal carries the original Edge and the endpoint
being replaced. Returning an endpoint to its original Card is eligible and
completes as `unchanged`. A result that duplicates a different Edge is refused.
The same proposal drives React Flow's `isValidConnection` during the drag and
the completion check after release.

Only the selected Active Graph Edge is `reconnectable`. The global
`edgesReconnectable` setting stays false. This prevents both transparent
endpoint anchors from being permanently live on every Edge. A browser test
pins pointer precedence where a selected Edge reconnect anchor overlaps one of
the Card's four authoring handles.

The app-specific custom Edge renders `EdgeToolbar` inside itself, because the
toolbar uses `EdgeLabelRenderer`. Its default `isVisible` rule reads
`edge.selected`. The toolbar contains a normal button that opens the Edge
Popover. Enter and Space keep React Flow's native selection meaning on the Edge
itself; Hyper does not overload either key to open the Popover. Its **From** and
**To** fields use the same Layout-Card picker as keyboard connection. The
existing endpoint is unchanged. A known duplicate result is disabled.

## Deletion

React Flow 12.11.2 defaults `deleteKeyCode` to Backspace only. Package 7 sets
`deleteKeyCode={['Backspace', 'Delete']}`. Its document-level handler then finds
the selected canvas object. Edge Authoring does not install a second key
handler.

For a selected Edge, `onBeforeDelete` requests `deleted-edge` from Space
Authoring and returns `false` to React Flow. This prevents a local removal. A
completed Edit removes the Edge in the next projection. A refusal retains the
Edge selection and shows its reason.

Deleting an Edge does not delete its Graph or either endpoint Card.

## Focus

React Flow retains its physical Edge Tab order and normal pointer focus
behavior. Hyper does not implement a roving tab index. React Flow pans to a
focused Node only; it does not pan to a focused Edge. Package 7 accepts that
native behavior and adds no Edge focus panning.

Only Active Graph Edges are focusable. They have an accessible name that
identifies the source Card, target Card and Graph.

React Flow's native Edge Escape handler clears selection and calls `blur()`,
which can leave focus on `body`. Hyper repairs that result because workspace
commands require a defined graph focus and `body` is not an authoring context.
An Edge `domAttributes.onBlur` schedules the repair after React Flow completes:
if focus is still on `body`, it focuses the canvas; if another control already
has focus, it does nothing.

Hyper also moves focus when its completed projection removes the element that
held focus. It uses the source Card and then the canvas as fallback targets. It
does not move focus away from an existing focused control. These are explicit
focus-continuation deviations, not behavior React Flow supplies.

## React interface

The Edge Authoring React interface supplies these values to `SpaceCanvas`:

```ts
{
  edges: readonly AuthorableRoutedEdge[];
  edgeTypes: EdgeTypes;
  reactFlowProps: EdgeOwnedReactFlowProps;
  layer: ReactNode;
}
```

`edges` decorates projected Edges with authoring type, selection, focusability
and accessible labels. It does not decorate nodes. The app-specific Edge reads
commands from one shared Edge Authoring context. Callback functions do not go
in each Edge's `data`.

Returned callbacks have stable identities. The returned property object is
memoized. Edge decoration runs only when the projected Edges, Active Graph or
selected Edge changes.

`reactFlowProps` contains only properties Edge Authoring owns. `SpaceCanvas`
passes them explicitly so property-spread order cannot replace a handler.

## Verification

Space Authoring interface tests own:

- eligibility and refusal reasons
- duplicate, self-Edge and cycle rules
- atomic connect, create-and-connect, reconnect and delete transitions
- stale Graph, Edge and Card refusals

Edge Authoring interface and React tests own:

- one-draft transitions
- selection-driven cancellation
- refusal retention
- replacement and subject invalidation
- stable callbacks and memoized property values
- focus-continuation requests

Render adapter tests own:

- discriminated selection
- additive handling of React Flow's select-then-cross-kind-deselect callback order
- projection publication
- Card movement
- connection completion and projection reconciliation ordering

Browser tests own:

- `FinalConnectionState` translation
- empty-canvas and off-canvas distinction
- release refusal after the preview's container-local pointer fact freezes
- pointer reconnection callback order
- reconnect-anchor precedence over Card authoring handles
- native Delete-key integration through `onBeforeDelete`
- combined node-plus-incident-Edge deletion dispatch
- Tab order, focus-to-selection, accessible names and Escape focus repair
- consecutive connections without React Flow warning `#008`

The old shallow connection-gesture tests are removed when Edge Authoring covers
their behavior through its interface.
