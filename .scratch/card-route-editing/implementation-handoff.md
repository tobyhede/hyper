# Complete Card and Graph authoring — implementation handoff

Status: accepted planning handoff

## Destination

Implement the first-public version 1 Card and Graph authoring experience so an
author can open the one-Card new Space and build, edit and present a complete
Space without editing source files. This handoff reconciles the accepted domain,
interaction, keyboard, persistence and focus decisions; it does not authorize
features listed under Out of scope.

## Authority and terminology

When two records appear to disagree, use this order:

1. `CONTEXT.md` for current ubiquitous language.
2. The newest accepted ADR that refines or supersedes an older one, especially
   ADRs 0040, 0041, 0042 and 0045.
3. The complete keyboard specification.
4. The operation-specific accepted prototypes.
5. This handoff for cross-operation sequencing and proof obligations.

Historical ADR, issue and prototype bodies may say Route, Walk, Graph View or
Space-card palette. Read their current meanings as Graph, Traversal history,
Flow Algorithmic View and Cards View respectively. No implementation alias
preserves the old words.

The key architecture is fixed:

- A Space owns Cards and zero or more Layouts.
- A Layout's position keys are its explicit Card membership.
- A Layout owns a non-empty ordered Graph collection and always resolves one
  Active Graph.
- Every Graph belongs to one Layout; every Edge endpoint names a Card in that
  Layout; exact duplicate Edges within one Graph are invalid.
- Graphs may be empty, disconnected, branching, merging, cyclic and
  self-connected.
- Creating a Layout creates its initial empty Active Graph in the same Edit.
- Graph management cannot delete the final Graph.
- An Algorithmic View has no authored Layout or Graph. Its first Edit converts
  the rendered Cards and positions into a new Layout without moving them.
- A View is one interface over an open subject (ADR 0045), not a set of kinds.
  In: Cards and zero or more Graphs. Out, on conversion: those Cards with
  positions, and one or more Graphs, which may hold no Edges. Every returned
  Graph's Edge endpoints are among the returned Cards, and every returned Graph
  carries a fresh identity owned by the new Layout.
- A View whose subject is the Space's Cards draws every Graph in the Space,
  flattened across its Layouts. The flatten is derived and never stored.
- A Graph belongs to one Layout, and its id is unique across the whole Space.
  Intake rejects a Space where one Graph id appears twice, naming both owners.
- A View is application-supplied and not a synonym for the canvas. Flow and
  Grid are Algorithmic Views; Cards View is a distinct collection View;
  `SpaceCanvas` is rendering composition.
- Space Authoring owns complete semantic Edits. Interaction drafts stay local;
  `SpaceSession.working` is the authoritative optimistic Space.

## Domain transition matrix

| Operation | One completed Edit | Algorithmic View crossing | Required invariant / no-op |
| --- | --- | --- | --- |
| Add Card | Create Markdown Card with neutral title; add it to current/new Layout at center stack | Convert rendered Cards and create initial empty Active Graph | No creation draft; other Layouts unchanged |
| Edit Card | Replace the Card's valid title, description or Markdown body | Convert rendered Cards and positions before applying the Card Edit | Empty title refused; unchanged document produces no Edit |
| Add Alias | Create Alias with eligible Target and title; add to current/new Layout | Convert only when Target selection completes | Target is non-Alias; cancellation creates nothing |
| Retarget Alias | Replace Target, preserving Alias id, title, positions and incident Edges | Convert uniformly before applying the Card Edit | New Target is non-Alias and different; no alias chain |
| Add Graph | Append, colour and activate one empty Graph | New Layout uses requested Graph as its initial Graph, not an extra predecessor | Layout ends with at least one Graph |
| Edit Graph title | Replace valid title | Not applicable without a Layout/Graph | Empty refused; unchanged title no-op |
| Edit Graph colour | Store selected colour | Not applicable without a Layout/Graph | Current swatch no-op; imported absent colour remains valid |
| Connect | Add one Edge to Active Graph | Convert, create initial Graph and add Edge atomically | Endpoints are Layout members; exact duplicate refused |
| Reconnect | Replace exactly one Edge endpoint | Not applicable without an existing Graph Edge | Preserve Graph; self-Edge valid; unchanged endpoint no-op; duplicate result refused |
| Delete Edge | Remove one Edge | Not applicable without an existing Edge | Empty Graph remains |
| Add to Layout | Add existing Space Card membership and initial position | Unavailable without a selected Layout; Cards View is disabled on Algorithmic Views | Card exists and is absent; no Edge inferred |
| Move Card | Replace one member's position | Convert all rendered positions, then write completed movement | Returning to authored position no-op |
| Remove from Layout | Remove membership, position and every incident Edge from every Graph in that Layout | Not available without a Layout | Card stays in Space and other Layouts; empty Graphs remain |
| Delete Card from Space | Delete Card and cascade Remove from Layout through every Layout | Convert uniformly when invoked through an Algorithmic View, then apply the Space deletion | Incoming Aliases block non-Alias deletion; deleting Alias leaves Target |
| Delete Graph | Remove exactly one Layout-owned Graph and activate first survivor | Not available without a Layout | Disabled for final Graph; Cards and other Graphs unchanged |
| Activate Graph | No Edit | Emphasis only over the flattened Graphs; converts nothing, and a later connecting Edit still joins the new Layout's own initial Graph | Navigation only; every Graph remains drawn |
| Select View/Layout | No Edit | Selection itself never converts | Navigation only; authored default changes only with a later Edit |
| Graph navigation / Present | No Edit | Presenting unavailable from Algorithmic View | Traversal history is transient and separate per interaction |

Every structural transition mints identities inside the operation that succeeds.
No cancelled gesture reserves an id. Graph ids resolve **across the Space** —
ADR 0045 moved that scope, and line 50 above already said so; ownership is
still the Layout's. Layout ids resolve within their Space, and identities of
different kinds may
share a UUID.

## Interaction and focus matrix

| Operation | Pointer-visible path | Keyboard path | Cancellation | Focus after completion |
| --- | --- | --- | --- | --- |
| Add Card | Toolbar Add Card | Graph-focused `C` | Creation already complete; title Escape restores neutral title | Title input, then new Card |
| Edit/open Card | Explicit Card control; title double-click | Card Enter/Space; F2 rename | Cancel — or Escape, its alias — discards every pending field and closes (ADR 0048) | Opened/edited Card |
| Add Alias | Add Card menu → Add Alias → Target picker | Same visible controls and Combobox | Close/Escape before Target creates nothing | Created Alias in editor; close returns Alias Card |
| Retarget Alias | Target field in Card editor, pending until `Done` | Same Combobox | Cancel/Escape discards the pending Target with the pane's other fields (ADR 0048) | Alias editor/control |
| Add Graph | Graph manager Add Graph | Visible button in keyboard-accessible manager | Rename Escape keeps Graph and neutral title | New Graph title, then Graph tab |
| Edit Graph | Manager Title/Colour | Vertical Tabs and normal fields | Title restores; swatch selection is immediate | Edited control / Graph tab |
| Connect | Four spatial handles | One tab-stop Connect control → Select Graph Target | Cancel returns source Card | Target Card |
| Reconnect | React Flow endpoint drag | Edge popover From/To Combobox | Restore original Edge | Edited Edge |
| Delete Edge | Endpoint empty-canvas drop or Edge action | React Flow Delete/Backspace on the sole selected Active-Graph Edge | Cancelled drag restores Edge | Retain an existing focused control; if removal destroys focus, use the source Card, then canvas as fallback |
| Add to Layout | Card Front click or external drag from Cards View | Command item Enter | Invalid/outside drop leaves Card absent | Added Card; pointer selects without forced focus |
| Move Card | React Flow drag | Native Arrow/Shift+Arrow rules | Cancelled gesture restores authored projection | Card |
| Remove from Layout | Card editor armed button | Selected Card Delete/Backspace twice | Escape/target/focus change disarms | Matching Cards View item when visible, otherwise canvas |
| Delete Card | Card editor armed button | Same visible button | Escape/target/focus change disarms | Canvas |
| Delete Graph | Graph manager armed button | Same visible button | Escape/target/focus change disarms | First surviving Active Graph |

React Flow owns ordinary focus, selection, panning and shifted movement except
for the explicit keyboard deviations in the keyboard contract. shadcn and its
primitive own local behavior. No successful or cancelled interaction may drop
focus on `body`.

## Shared draft, failure and replacement acceptance

All operation rows also satisfy these cases:

1. Opening a field, picker, drag or confirmation changes no Space by itself.
2. Escape cancels exactly one topmost local interaction and produces no Edit.
3. Completed/unchanged/refused are distinguishable through the semantic
   authoring interface; expected refusal retains focus and announces its reason.
4. A completed Edit is visible immediately and remains available while
   persistence is pending, failed, rejected or conflicted.
5. Later Edits remain legal in those states. Retry and Keep local commit the
   newest complete working Space.
6. Persistence status and actions never steal focus and never open an
   operation-specific modal.
7. Invalid stored replacement changes nothing. Valid Accept stored atomically
   replaces session, placement and Navigation, advances `replacementEpoch`,
   cancels all target-bound transients and focuses the ready canvas.
8. Before-unload protection is present for every non-settled persistence state
   and absent when settled.

## Complete user journey

One database-free E2E scenario proves the destination rather than isolated
controls only:

1. Open the one-Card new Space with no Layout or Graph.
2. Add and rename a Markdown Card, converting without moving the original Card.
3. Add an Alias through its Target picker and verify its delegated content.
4. Connect Cards so the initial Active Graph becomes presentable; add a
   self-Edge or cycle in a separate Graph-focused test rather than distorting
   the fixture journey.
5. Add a second Graph, rename/recolour it, activate between Graphs and confirm
   both remain drawn with only emphasis changing.
6. Keyboard-connect and reconnect an Edge, then delete an Edge while retaining
   its Graph.
7. Remove a Card from the Layout, observe it in Cards View, and add it back at a
   deliberate position without restoring deleted Edges.
8. Exercise Delete Graph protection on the final Graph and the incoming-Alias
   block on Delete Card from Space.
9. Present the Active Graph, traverse a branch, retreat through Traversal
   history, and return to the same canvas.
10. Reload and observe the complete optimistic state through the HTTP seam.

Focused browser scenarios separately prove external drag after pan/zoom,
empty-canvas eligibility, click suppression, endpoint reconnection, consecutive
connections without React Flow warning #008, Escape precedence, branch
announcements and focus restoration. The opt-in PostgreSQL browser scenario
continues to prove durability across a fresh Vite host; it need not duplicate
the complete journey.

## Implementation sequence

Each work package leaves `pnpm verify` green; packages that change graph/UI
behavior also leave the complete Playwright suite green. Do not combine adjacent
packages merely because both touch the same files.

### 1. Pure domain vocabulary rename — **done**

Apply ADR 0041 without changing behavior or ownership. Rename Route→Graph,
Walk→Traversal history, the built-in Graph Algorithmic View→Flow,
`GraphView`→`SpaceCanvas`, render intermediates→`GraphRender*`, and
layout-strategy intermediates→`LayoutStrategy*`. Update schemas, diagnostics,
fixtures, CSS, tests, import/export, persistence, HTTP and CLI vocabulary
together. Historical records and qualified HTTP/geometry routing remain.

Gate: unchanged E2E behavior plus a repository scan with no current-domain old
names. Any temporary pre-version-1 aggregate shape is an internal commit state,
not a supported compatibility document.

### 2. First-public aggregate foundation — **done**

Built by `.scratch/first-public-aggregate/`, tickets `01`–`07`. Everything below
holds in the tree, including the three named proofs: the View-boundary property
test (`packages/app/test/renderer.property.test.ts`), the duplicate-Graph-id load
error naming both owners (`packages/graph/test/space-intake.test.ts`), and the
fixture's Flow view drawing all four Graphs across its two Layouts
(`packages/app/e2e/overview.spec.ts`). The one thing deferred on purpose is the
omitted-Card fallback band, which package 5 below deletes together with its
replacement. AGENTS.md and `CONTEXT.md` describe the built state; ticket `06`
carries the bars.

Implement ADR 0040 directly in version 1: explicit Layout membership through
position keys, non-empty ordered Layout-owned Graphs, scoped Graph lookup,
Edge closure over Layout Cards, and the initial empty Active Graph. **Leave the
omitted-Card fallback band in place until package 5**, which builds its
replacement: between the two, a Card a Layout omits would render nowhere and
Cards View would not yet exist to add it back, so the band is briefly the only
surface that can reach it. Update normal/import schemas, indexed Space intake, View/renderer
resolution, canonical export, PostgreSQL decoding, HTTP snapshots, CLI
diagnostics, fixtures and all repository contracts. Reject version 2 and old
keys rather than migrating them.

Implement ADR 0045 in the same package, because it is the same document shape.
`ResolvedView` gains an explicit Card subject and a conversion result — Cards
with positions plus one or more Graphs — and the two boundary obligations are
enforced there rather than in any View. Graph resolution in
`packages/app/src/view.ts` stops reading a Layout's `graphs` filter, which no
longer exists, and answers a Space-Card subject by flattening every Layout's
Graphs. **As built** (PR #62), the module is `packages/app/src/renderer.ts`,
the type is the discriminated `ResolvedViewRenderer | ResolvedLayoutRenderer`
carrying a `RendererSubject`, and there is no `resolveGraphs` — the subject
answers which Graphs are drawn. Keep this seam distinct from `LayoutStrategy`, which still only
arranges. The Flow view returns a fresh empty Graph on conversion; that is this
View's choice among legal outputs, so put it in the View and not in the
boundary.

The tracked fixture rolls forward as **two** Layouts — Long/Mid/Short over the
A–D spine, and Echo — because Graphs nest under Layouts in version 1 and a
Space cannot otherwise hold them. Seed both position maps from one ELK run over
the current fixture so first paint is unchanged, and leave `defaultView` absent
so Flow still renders it. Two Layouts rather than one is deliberate: it is the
only place in the tree where the flatten crosses a Layout boundary, and one
Layout would leave that rule untested. AGENTS.md's line explaining that ELK
renders the fixture because it declares no Layout becomes wrong here — the
reason becomes the absent `defaultView`.

Graph ids stay unique across the Space even though every Graph is owned by one
Layout (ADR 0045), because the flatten keys colour, handles, Edge ids and
activation on the id alone. Add the duplicate check to `loadSpace` beside the
existing Card-id one and have it name both owning Layouts; the index it protects
is `graphsById`, which is built with `new Map` and would otherwise drop one
Graph in silence. Do not answer this by owner-qualifying Graph references
through the render pipeline — that alternative is weighed and rejected in the
ADR, and it costs the `<graphId>::out`/`::in` scheme that two libraries depend
on.

Gate: schema/reference property tests, deterministic export tests, HTTP/backend
contracts, PostgreSQL integration and database-free E2E on the new shape. Add a
property test that no View output can violate closure or reuse a source Graph
identity, a test that a Space carrying one Graph id in two Layouts is a named
load error rather than a silently shortened index, and an E2E proving the
fixture's Flow view still draws all four Graphs across its two Layouts.

### 3. Deep semantic authoring interface — **done**

Add the final semantic operations and shared completed/unchanged/refused result
vocabulary behind Space Authoring. Keep pure derivation before installation,
payload-free completion notification, total collaborator installation and
reentrant ordering. Add `replacementEpoch`; replace rather than layer any
operation-specific snapshot assembly in callers.

Gate: interface-level tests cover every domain transition, conversion/no-op/
refusal, cascades, latest-working Retry/Keep local and atomic replacement.

Built. `AuthoringCompletion` now names every transition in the matrix above —
Add Card, Add Alias, Add to Layout, Remove from Layout, Delete Card from Space,
Add Graph, Graph title and colour, Delete Graph, Reconnect and Delete Edge
alongside the movement, connect and Card-edit gestures that were already there —
and `AuthoringResult` distinguishes `completed` (naming a created Card or Graph),
`unchanged` and `refused` (carrying the author-facing reason) from `queued`.
Retargeting an Alias is an ordinary `edited-card`, since the Card editor is the
one canonical place a Target changes; only Card **kind** is now refused.
`replacementEpoch` was already in place from ADR 0042's earlier work.

Keep local became `SpaceAuthoring.keepLocalWork`, which reads the newest working
snapshot itself rather than taking one — the caller-assembled snapshot this
package exists to remove. The conflict controls had no Keep local at all before
it, only Accept remote, so the one button beside it landed here too.

Three supporting seams moved with it: `Placement.remove` (construction stays
closed), `withCardRemovedFromLayouts` for the all-Layout deletion cascade, and
`nextGraphColor`, which both Graph-creating gestures now store through.

Graph colours rotate by the new Graph's appended Layout-order position, as the
accepted Graph management prototype specifies. A conversion therefore gives
the new Layout's initial Graph the first palette colour, regardless of the
Graphs its Algorithmic View was drawing. Graph titles still number Space-wide,
which is also what the conversion's Graph policy (built as `freshEmptyGraph` in
`packages/app/src/renderer.ts`) already did. `Graph.color` stays
optional in the domain, with `graphColorMap` resolving a fallback for imported
Graphs.
Proofs are `packages/app/test/space-authoring-operations.test.ts` for the
transitions and their refusals, and `packages/app/test/space-authoring.property.test.ts`,
which drives hostile sequences of every operation and holds each to two bars:
the working Space passes domain intake after every step, and an operation that
is not an Edit leaves the working snapshot's identity untouched.

Nothing here is reachable by an author yet — every operation still needs the
surface its later package builds. Packages 5 and 6 wire Cards View, membership
and Graph management to what is now behind the interface, and the fallback band
stays until package 5 replaces it.

### 4. Card and Alias creation — **done**, less the Frame 5 gestures

Build detached Add Card and its inline neutral-title continuation, Add Alias's
pre-Edit Target picker, persistent kind icons, Alias-target visibility and
retargeting. Reuse the existing Card editor and Combobox composition.

**Read "done" against the scope sentence above, which does not name the
storyboard's Frame 5 modifier-drag gestures.** They are accepted behaviour, they
are unbuilt, and no package owns them — see the paragraph below and issue
[`15`](issues/15-frame-5-alias-modifier-gestures-are-unowned.md). Package 10's
closing gate counts matrix rows and Add Alias's row is satisfied, so nothing
downstream will notice their absence on this package's behalf.

Gate: component focus/cancellation tests and E2E from Algorithmic View proving
one conversion and no creation on cancelled Alias.

Built. **There was no Combobox to reuse** — `@project/ui` had Radix Select and
nothing else in that family — so this package introduces the two primitives the
proof matrix names: a shadcn `Command` over cmdk, which package 5's Cards View
reuses, and a Radix `DropdownMenu` behind `AddCardControl`. That control is a
**split button**, because Add Card completes an Edit on one activation and Add
Alias cannot: an Alias without a Target is not a valid Card, so it opens a
creation state instead. The Card editor half of the sentence held: `OpenCard` is
reused, with its covering panel and focus containment extracted to `CardPane`
and shared with the creation state.

`C` is answered on React Flow's own wrapper rather than on the window, so
"graph focused" is where the event came from rather than a guess. Creation's
naming continuation reaches the existing inline title editor through
`nameOnCreation`, an identity whose *change* says a Card was just created —
so a remount carries nothing and no request has to be handed back. The title
editor now returns focus to its Card on Enter and Escape, which is what keeps
the whole gesture off `<body>`; a blur is deliberately excluded, since taking
focus back from wherever the author clicked would be a steal.

That editor takes focus on mount whichever control created the Card, pointer or
keyboard. The Card creation prototype requires the neutral `Card N` title to be
**selected**, and an unfocused input has no selection an author can type over,
so the sentence beside it naming keyboard activation of the toolbar action or
`C` restates the stronger requirement rather than restricting it to the keyboard
path. The keyboard contract's "pointer placement selects without forcing
keyboard focus" governs *placement* — the interaction matrix marks it on Add to
Layout, whose pointer path ends at a placed Card and not in a field — while Add
Card's own row names the title input for both paths.

Renaming and retargeting are each an ordinary `edited-card` of the Alias, and
they arrive together: one optional `occurrence` on `OpenCard`'s delegated
variant, carrying `onRename`, `targets` and `onRetarget`, rather than two
independent props. Both are offered on exactly one fact — this occurrence is an
Alias — and a caller able to supply the Target without the Title could build a
pane that retargets an Alias it cannot rename. Declared by the caller for the
same reason delegation itself is, rather than read off the opened Card's kind.
Choosing a Target commits, so there is no unconfirmed Target to hold across a
confirmation step; the Title commits on Enter and on blur, and Escape restores a
dirty draft before the pane will close.

That the delegated pane authors the occurrence's own Title at all runs against
ADR 0039, which said it renames nothing. **ADR 0046 records the refinement** —
0039 rejected a field authoring the *Target* from a pane reached through the
Alias, and this one authors the Alias — and 0039 carries the `Refined by: 0046`
back-link. Do not read the built pane against 0039 alone.

Three primitive behaviours are worth knowing before package 5 reuses them, and
they are recorded in AGENTS.md rather than here: a modal Radix menu steals focus
from a surface its item opens, `onCloseAutoFocus` steals it again a tick later,
and cmdk's default filter scores the item `value` — which here is a UUID.

**Not built, and deliberately**: the storyboard's Frame 5 modifier-drag Alias
gestures. Both are pointer-only accelerators whose keyboard path is the control
this package built, and the connection-drop half would need a sixteenth
completion — create an Alias *and* an Edge — that package 3 did not build. That
is interface work, not surface, so it returns to the authoring interface rather
than being improvised in the canvas.

Issue [`15`](issues/15-frame-5-alias-modifier-gestures-are-unowned.md) has since
split them: **body drag is package 4b**, and **connection drop is out of scope**
and listed as such below.

### 4a. Card pane corrections — Radix Dialog and one submit

Corrective work on what package 4 built, ahead of 4b and 5. `CardPane` composes
`@radix-ui/react-dialog` instead of hand-rolling its focus trap, pointer
containment and initial focus (ADR 0047); the pane owns one `<form>` over four
pending fields with one `Done` and one `Cancel`, of which Escape is an alias
(ADR 0048). The Target and the occurrence Title stop committing on touch, which
is what closes issue [`17`](issues/17-retargeting-an-alias-discards-the-content-draft.md);
the three in-pane field Escapes are removed, which closes issue
[`16`](issues/16-the-content-editors-escape-closes-over-a-dirty-draft.md).

No new authoring completion: `Done` fires the existing `edited-card` on the
Alias and `edited-card` on the content Card. Ticket and acceptance:
[`18`](issues/18-rebuild-the-card-pane-on-radix-dialog-and-one-submit.md).

Gate: `pnpm verify` plus `pnpm e2e` — the dialog swap is focus and pointer
behaviour over a live canvas, and Radix's modal layer sets `pointer-events:
none` outside its content, which jsdom cannot falsify.

### 4b. Alias body drag

The Frame 5 half that is in scope: Shift-dragging a Card body previews an Alias
ghost, leaves the source Card in place, and drops to create and select the Alias
at that position. Surface work only — `created-alias` already carries a Target,
an optional title and an `anchor`, and `App.tsx` already dispatches it. Resolve
an Alias source to its non-Alias Target in the single hop Frame 5 specifies.

Sequenced after 4a: the gesture leaves the author standing in the pane, which
should be the corrected pane rather than the one being replaced.

Gate: component test for the modifier gesture and its ghost; E2E proving a drop
creates one Alias, selects it, and leaves the source Card where it was.

### 5. Cards View and Layout membership

Build Cards View with the shared Card Front, search, center-stack placement,
external React Flow drag, Add to Layout and Remove from Layout. Delete the
fallback-band implementation and tests rather than adapting it — `positioned.ts`
loses its unplaced-grid arithmetic and the projection stops drawing a Card the
Placement omits, and the two guards that exist only to stop the band's
fabricated coordinates becoming authored data (`placement.ts` and
`render-adapter.ts`) go with it. Package 2 deliberately leaves the band standing
so removal and replacement land together. Preserve the closed Placement
construction seam.

Gate: property tests for membership/incident-Edge cascade, component Command
behavior, and browser proof for pan/zoom drop geometry, cancellation, click
suppression and focus.

### 6. Graph management

Build the persistent two-pane manager using vertical shadcn Tabs: activate,
rename, recolour, Add Graph and protected Delete Graph. Selection is emphasis,
not filtering. Add Graph from an Algorithmic View performs one conversion and
uses the requested Graph as the initial Graph.

Gate: manager primitive/focus tests, authoring interface tests for order and
last-Graph protection, and E2E confirming all Graphs remain drawn.

### 7. Complete Edge lifecycle — **done**

Built. `packages/app/src/edge-authoring.ts` holds the module's own state — one
draft, its refusal, and the focus continuation a completed projection owes —
and `edge-authoring-react.tsx` is its React interface, answering
`{ edges, edgeTypes, reactFlowProps, layer, provide }` plus the Edge half of the
canvas's `onBeforeDelete` dispatch. `connection-completion.ts` is the completion
coordinator the render adapter's two connection methods became.
`connection-gesture.ts` and its two shallow tests are gone; `newCardDrop` moved
into Edge Authoring with its priced preview trade-off intact.

Four things the design left open resolved this way:

- **The commands context wraps `<ReactFlow>`, not `layer`.** React Flow renders
  Edges as a sibling of the children it is given, so a provider inside the layer
  reaches no Edge. `surface.provide(children)` puts it outside without
  `SpaceCanvas` learning that a context exists.
- **The canvas needs `tabIndex={-1}`.** React Flow's pane carries no `tabindex`,
  so the Escape repair had nothing to focus. Negative, so the canvas never
  becomes a tab stop.
- **The Edge picker is a Radix Select, not cmdk.** `@project/ui` gained
  `CardPicker` and a shadcn-style `Popover`; the Combobox package 4 will bring is
  the richer surface, and this is the same primitive the existing toolbar
  selectors use.
- **The Card's keyboard Connect control lives in `CardNode`**, beside the Edit
  affordance and offered on the same hover, focus and selection rules.

`edgeEligibility` replaced `canConnect` and `canCreateConnectedCard`, and
`reconnectOutcome` is shared by eligibility and the completion so the two cannot
drift. Proofs: `space-authoring-operations.test.ts` (`Edge eligibility`),
`edge-authoring.test.ts`, `edge-authoring-react.test.tsx`,
`render-adapter.test.ts` for the additive selection order, and the Edge
lifecycle scenarios in `editing.spec.ts`.

Review found five things and all five are closed:

- **A selected Edge survived an Active Graph change**, leaving its toolbar's
  Delete live on an Edge the canvas had stopped offering — CONTEXT.md's
  *Selected Edge* says one "cannot remain selected". Now dropped by a second
  Edge Authoring subscriber, and the decoration conjoins `selected` with the
  Active Graph so no frame renders it either way.
- **Escape did not cancel a keyboard connection.** The picker now takes focus as
  it opens and answers Escape; Radix owns the first press while its listbox is
  open, so the two nest as "topmost first".
- **A completed keyboard connection selected the target without focusing it.**
  `completeKeyboardConnect` is the operation that owes both, because the picker
  holding focus unmounts with the draft.
- **`queued` was silent for reconnect and delete** while the connect paths
  reported it. Both now report through the same non-throwing sink.
- **The endpoint empty-canvas drop deleted nothing.** Built, with the connect
  path's precedence — a connection target in range outranks the element
  underneath, so a drop that merely missed a handle cancels. Safe because
  `onReconnectEnd` is the only way a drag can end: React Flow has no Escape path
  for a drag, and `XYHandle` removes its document listeners only from its own
  `onPointerUp`.

Three duplications the review named are gone too: `edgeSelectionOf` in
`render-adapter.ts` is now the one translation from a React Flow Edge to the
domain one, `sameSelection` the one comparison, and a refused *pointer*
reconnect keeps its sentence the way a refused connection does
(`endPointerDrag`, one operation for both pointer drafts).

**A second review round found that pointer reconnection had never worked**, and
no unit test could have seen it — they drive `beginPointerReconnect` directly,
while React Flow drives a reconnect drag through the *connection* callbacks as
well. `EdgeUpdateAnchors` calls `onReconnectStart` and then the store's
`onConnectStart`, and on release the store's `onConnectEnd` before
`onReconnectEnd`. Three defects followed, all now fixed and pinned:

- `beginPointerConnect` **overwrote the reconnect draft**, so `reconnect()`
  found no drafted Edge and silently authored nothing. A `reconnecting` ref
  stands both connection handlers down for the drag.
- With Alt held, the connection release **authored a Card and an Edge from the
  anchored end** before `onReconnectEnd` deleted the Edge — one gesture, two
  Edits. The same ref closes it.
- `handleType` names the endpoint that **stays**, not the one being dragged, so
  the draft recorded the wrong end and a cancelled drag returned focus to the
  wrong Card.

Building the browser test the design asked for is what exposed all three, and it
exposed a fourth in the process: a **source**-endpoint drag looks for a new
source handle, and `CardNode` offered only target handles mid-drag, so the
gesture had nowhere to land. It now reads the role off the drag —
`connection.fromHandle.type` — which changes nothing for an ordinary connection.

Also from that round: Radix portals through the fiber tree, so the listbox's
Escape *did* reach the picker's handler and one press closed the list and
cancelled the connection together; the trigger's `data-state` now separates the
two layers. A refused toolbar Delete published a sentence no surface rendered.
And `endpointChoices` spread an `EdgeSelection` into the proposal, whose own
`kind` silently turned every reconnect question into a connect one — the
`EdgeSubject` refactor's one sharp edge, now destructured at all four sites and
guarded by a test that reads the commands context an Edge really gets.

Of the three browser scenarios the design names, `pointer reconnection callback
order` is now built (with endpoint-delete, off-canvas-restore and the Card-body
drop beside it). The other two were already proven under different names in
`new-space.spec.ts`; the one gap there — that the frozen preview is still on
screen at the moment of an off-canvas release — is now asserted rather than
assumed.

**A third round found that the reconnect fix had leaked its own flag.**
`reconnecting` was set at `onReconnectStart` and never cleared, so from the
first endpoint drag onward the Alt empty-drop and the continue-at-the-target
selection were dead for the life of the canvas. The suite stayed green because
`onConnect` is *not* among the handlers stood down: a plain Card-to-Card drag
still authors its Edge, so a "connect after reconnect" test passes either way.
The empty-drop is the probe that fails, and `editing.spec.ts` now uses it.

Three more from that round:

- **A completed reconnection left the author on `body`.** The selection names an
  Edge by value, so a moved endpoint leaves it naming one the Space no longer
  holds — the reconnected Edge draws unselected and the popover holding focus
  unmounts with it. `reconnect` now re-selects the reconnected Edge and requests
  focus on it, which is the matrix's "Focus after completion: Edited Edge".
  `FocusRequest` gained an `edge` arm, named by subject like every other Edge
  reference; the React layer resolves it against the projection.
- **A keyboard connection left a pointer continuation behind.**
  `pendingContinuation` is drained only by `endPointerDrag`, so the next pointer
  gesture — including one that authored nothing — collected it and selected a
  Card it never named. Only the pointer paths hold one now (`holdForDrag`).
- **A refused pointer gesture said nothing.** Its draft is gone by the time the
  refusal exists, so the sentence was stored and rendered nowhere. A
  canvas-level alert says it; the Edge toolbar's copy is gone, which also closes
  the leak where one Edge showed a sentence from an unrelated gesture.

Most pointer refusals are unreachable by design — `isValidConnection` refuses
them during the drag — so the alert is proven at the React level rather than in
a browser test that would be asserting something the product prevents.

**A fourth round, from an external reviewer plus three delegated agents,
found four more.** Two of the reviewer's four were already fixed by the third
round; the other two were live, and the round's own review found two hard spec
violations beside them:

- **`isValidConnection` asked the connect rule during a reconnect drag.** React
  Flow has one global validator and consults it for both, so an endpoint dropped
  back on the Card it came from read as the duplicate Edge it textually is —
  invalid for the whole drag, though the Edit accepts it as `unchanged`. The
  validator now builds a reconnect proposal from the open draft, and
  `movedEndpoint` is the one derivation it shares with the completion.
- **An open Edge draft survived into presentation.** The picker rendered off the
  draft alone, so it stayed usable over a presentation that had already begun
  and could author an Edge; a hidden Edge editor reopened afterwards. The module
  now cancels on entering presenting, and the layer is gated on `enabled` so
  nothing shows in the render before that lands.
- **A refusal outlived every invalidation trigger.** The invalidation pass
  returned early when no draft was left — and a *pointer* refusal outlives its
  draft by design — so a sentence naming the replaced Space survived an accepted
  replacement, against shared case 7's "cancels all target-bound transients".
- **The Edge focus request could not resolve in the commit that published it.**
  The projection carrying a reconnected Edge arrives a strategy later, so
  resolving against the projection on screen found nothing and fell back to the
  canvas rather than the matrix's "Edited Edge". An Edge request now waits for
  the projection that draws it; a Card or canvas request still resolves at once,
  because for those an unresolvable request means the element is gone for good.

The reviewer's fifth concern — that Escape during a reconnect leaves the guard
and draft latched — is **false**, and was traced to a wrong comment of ours
rather than to the code: React Flow has no Escape path for a drag at all, and
`XYHandle` removes its document listeners only from its own `onPointerUp`. The
comment invented that path; `AGENTS.md`, this file and the source now say what
the pinned release actually does.


The original brief follows.

Build the accepted Edge Authoring module in
`edge-authoring-design.md`. It owns the complete Edge interaction lifecycle and
the React Flow/DOM translation for that lifecycle. Add the keyboard target
picker, Active-Graph Edge focusability, `EdgeToolbar` popover, endpoint
reconnection and selection-based deletion. Retain four Graph-independent
pointer handles and declarative handle geometry. Do not add
`useUpdateNodeInternals`.

Keep the render adapter authoritative for the projected nodes and Edges, Card
movement, and the discriminated `none | card | edge` selection. Keep Space
Authoring authoritative for eligibility and every semantic Edit. Edge Authoring
owns neither copy. It consumes them through their existing interfaces.

Use React Flow's controlled `onNodesChange` and `onEdgesChange` streams for
selection. Disable its modifier multi-selection and selection rectangle. Keep
its native Edge Tab order, reconnect callbacks and selection-based Delete key,
configured as `['Backspace', 'Delete']`. Add the justified focus-to-selection
bridge for Edges and repair native Edge Escape only when it leaves focus on
`body`; do not add Edge focus panning.
Route an Edge delete through `onBeforeDelete`, prevent a local React Flow
removal, and let the completed Space Edit publish the next projection. A thin
canvas dispatcher routes a payload with nodes to Card Authoring and ignores its
incident Edges; only an Edge-only payload goes to Edge Authoring.

React Flow hides the Edge during its reconnect drag. At `onReconnectEnd`, it
renders whichever controlled projection is then current: the original Edge or
the completed replacement. Make only the selected Active Graph Edge
reconnectable, carry the original Edge in the eligibility proposal, and
browser-test its endpoint anchor against overlapping Card authoring handles.

Replace `connection-gesture` with Edge Authoring, but retain its priced preview
trade-off: preview reads container-local pointer state and release performs the
authoritative DOM hit-test. Do not add document-level per-frame
`elementFromPoint` without measuring that cost. Replace the current
render-adapter connection methods with one completion coordinator behind Edge
Authoring so rendered Placement, completion and projection reconciliation keep
their existing order.

Rewrite `SpaceCanvas`'s ARIA explanation, `deleteKeyCode={null}` and
`edgesFocusable={false}` together when the capability lands. Until then, those
comments correctly describe the unbuilt surface; after the properties change,
they would become misleading standing guidance.

Gate: duplicate/self/cycle properties, projection tests, real-browser
consecutive connection and warning-008 checks, pointer/keyboard parity and
focus restoration.

### 8. Space deletion and Alias protection

Add Delete Card from Space and its all-Layout cascade, incoming-Alias refusal,
Alias deletion behavior and concise aggregate consequences. Reuse the shared
two-activation armed convention; add no recovery or undo system.

Gate: cascade property tests across several Layouts/Graphs, Alias-target tests,
component cancellation/focus and E2E refusal messaging.

### 9. Complete keyboard Graph navigation

Implement the accepted Arrow/Shift+Arrow split, independent working and
Presenting Traversal histories, branch candidate emphasis/live announcements,
Edge Tab order, topmost Escape precedence, workspace Cards View shortcut and
all specified focus transfers. No monolithic hotkey registry.

Gate: Navigation interface tests, primitive component tests and keyboard-only
E2E that completes every operation without pointer use.

### 10. Acceptance hardening and handoff close

Run the complete journey and focused browser scenarios, update standing
guidance from “accepted, not built” to the actual state, delete obsolete
workarounds and historical implementation tests, and run the full verification,
E2E and PostgreSQL integration bars. Do not close implementation while any
matrix row lacks its required pointer and keyboard path or replacement case.

## Proof matrix

| Concern | Cheapest authoritative proof |
| --- | --- |
| Version 1 shape, optional ids and scoped identity | Core schema/type tests plus import properties |
| Layout membership and Graph Edge closure | Graph reference-validation properties |
| Atomic semantic transitions and cascades | Space Authoring interface tests |
| Commit ordering, latest-working retry/conflict | SpaceSession/Space Authoring contract tests |
| Primitive keyboard/dismissal semantics | Component tests against shadcn/Radix/cmdk composition |
| Render projection, handle identity and geometry | Adapter unit/property tests |
| Pointer coordinates, warning #008 and real focus | Playwright Chromium |
| HTTP/runtime validation and status contract | Fetch application/backend contract tests |
| Import/export and CLI diagnostics | Unit plus CLI integration tests |
| PostgreSQL durability and revision checks | PostgreSQL integration plus opt-in browser test |
| Complete author outcome | Database-free HTTP E2E journey |

Tests assert through the module interface that owns the behavior. When a deep
interface replaces shallow modules, replace their tests rather than layering a
second suite over implementation details.

## Out of scope

- Nested-Space Card creation or editing.
- Changing an existing Card's kind.
- Graph-scoped Algorithmic View product interaction.
- Manual Graph reordering.
- General undo/redo, recovery, revision history or collaborative editing.
- Bulk authoring and deletion.
- Touch-specific gestures or external-drag auto-pan.
- Compatibility parsing or migration from disposable development documents.
- **The Frame 5 Alias connection empty-drop** — creating an Alias and the active
  Graph Edge atomically on a modifier-held drop. It is an accelerator over the
  Add Alias row, which already has a working pointer path and keyboard path, and
  it needs a sixteenth authoring completion that would reopen package 3's closed
  interface. An accelerator is not a reason to reopen a closed interface. The
  keyboard contract's `Shift` assignment is narrowed to Card-body drag to match,
  so no modifier is specified that nothing reads. Decided in issue
  [`15`](issues/15-frame-5-alias-modifier-gestures-are-unowned.md); the
  **body-drag** half of Frame 5 is *in* scope as package 4b.

Any newly discovered requirement outside these bounds returns to planning. An
implementation convenience does not silently expand the first-public product.
