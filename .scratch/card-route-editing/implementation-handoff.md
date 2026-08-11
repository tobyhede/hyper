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
| Activate Graph | No Edit | No Graph to activate | Navigation only; every Graph remains drawn |
| Select View/Layout | No Edit | Selection itself never converts | Navigation only; authored default changes only with a later Edit |
| Graph navigation / Present | No Edit | Presenting unavailable from Algorithmic View | Traversal history is transient and separate per interaction |

Every structural transition mints identities inside the operation that succeeds.
No cancelled gesture reserves an id. Graph ids resolve within their owning
Layout, Layout ids within their Space, and identities of different kinds may
share a UUID.

## Interaction and focus matrix

| Operation | Pointer-visible path | Keyboard path | Cancellation | Focus after completion |
| --- | --- | --- | --- | --- |
| Add Card | Toolbar Add Card | Graph-focused `C` | Creation already complete; title Escape restores neutral title | Title input, then new Card |
| Edit/open Card | Explicit Card control; title double-click | Card Enter/Space; F2 rename | Dirty field restores value before surface closes | Opened/edited Card |
| Add Alias | Add Card menu → Add Alias → Target picker | Same visible controls and Combobox | Close/Escape before Target creates nothing | Created Alias in editor; close returns Alias Card |
| Retarget Alias | Target field in Card editor | Same Combobox | Restore current Target | Alias editor/control |
| Add Graph | Graph manager Add Graph | Visible button in keyboard-accessible manager | Rename Escape keeps Graph and neutral title | New Graph title, then Graph tab |
| Edit Graph | Manager Title/Colour | Vertical Tabs and normal fields | Title restores; swatch selection is immediate | Edited control / Graph tab |
| Connect | Four spatial handles | One tab-stop Connect control → Select Graph Target | Cancel returns source Card | Target Card |
| Reconnect | React Flow endpoint drag | Edge popover From/To Combobox | Restore original Edge | Edited Edge |
| Delete Edge | Endpoint empty-canvas drop or Edge action | Focused Active-Graph Edge Delete/Backspace | Cancelled drag restores Edge | Source Card |
| Add to Layout | Card Front click or external drag from Cards View | Command item Enter | Invalid/outside drop leaves Card absent | Added Card; pointer selects without forced focus |
| Move Card | React Flow drag | Native Arrow/Shift+Arrow rules | Cancelled gesture restores authored projection | Card |
| Remove from Layout | Card editor armed button | Focused Card Delete/Backspace twice | Escape/target/focus change disarms | Matching Cards View item when visible, otherwise canvas |
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

### 1. Pure domain vocabulary rename

Apply ADR 0041 without changing behavior or ownership. Rename Route→Graph,
Walk→Traversal history, the built-in Graph Algorithmic View→Flow,
`GraphView`→`SpaceCanvas`, render intermediates→`GraphRender*`, and
layout-strategy intermediates→`LayoutStrategy*`. Update schemas, diagnostics,
fixtures, CSS, tests, import/export, persistence, HTTP and CLI vocabulary
together. Historical records and qualified HTTP/geometry routing remain.

Gate: unchanged E2E behavior plus a repository scan with no current-domain old
names. Any temporary pre-version-1 aggregate shape is an internal commit state,
not a supported compatibility document.

### 2. First-public aggregate foundation

Implement ADR 0040 directly in version 1: explicit Layout membership through
position keys, non-empty ordered Layout-owned Graphs, scoped Graph lookup,
Edge closure over Layout Cards, initial empty Active Graph, and no omitted-Card
fallback band. Update normal/import schemas, indexed Space intake, View/renderer
resolution, canonical export, PostgreSQL decoding, HTTP snapshots, CLI
diagnostics, fixtures and all repository contracts. Reject version 2 and old
keys rather than migrating them.

Implement ADR 0045 in the same package, because it is the same document shape.
`ResolvedView` gains an explicit Card subject and a conversion result — Cards
with positions plus one or more Graphs — and the two boundary obligations are
enforced there rather than in any View. `resolveGraphs` in
`packages/app/src/view.ts` stops reading a Layout's `graphs` filter, which no
longer exists, and answers a Space-Card subject by flattening every Layout's
Graphs. Keep this seam distinct from `LayoutStrategy`, which still only
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

### 3. Deep semantic authoring interface

Add the final semantic operations and shared completed/unchanged/refused result
vocabulary behind Space Authoring. Keep pure derivation before installation,
payload-free completion notification, total collaborator installation and
reentrant ordering. Add `replacementEpoch`; replace rather than layer any
operation-specific snapshot assembly in callers.

Gate: interface-level tests cover every domain transition, conversion/no-op/
refusal, cascades, latest-working Retry/Keep local and atomic replacement.

### 4. Card and Alias creation

Build detached Add Card and its inline neutral-title continuation, Add Alias's
pre-Edit Target picker, persistent kind icons, Alias-target visibility and
retargeting. Reuse the existing Card editor and Combobox composition.

Gate: component focus/cancellation tests and E2E from Algorithmic View proving
one conversion and no creation on cancelled Alias.

### 5. Cards View and Layout membership

Build Cards View with the shared Card Front, search, center-stack placement,
external React Flow drag, Add to Layout and Remove from Layout. Delete the
fallback-band implementation and tests rather than adapting it. Preserve the
closed Placement construction seam.

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

### 7. Complete Edge lifecycle

Add the keyboard target picker, Active-Graph Edge focusability, Edge popover,
endpoint reconnection and deletion. Retain four Graph-independent pointer
handles and declarative handle geometry. Do not add `useUpdateNodeInternals`.

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

Any newly discovered requirement outside these bounds returns to planning. An
implementation convenience does not silently expand the first-public product.
