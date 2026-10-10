# Maps and Graphs

The current contract for Maps, Graphs, placement, Open and Close, initialization and layout strategies. It states the accepted design in current words, with the reason for each rule, the alternatives that were rejected, and what is accepted but not built. How a current contract relates to the ADRs is [ADR 0115][0115]; [workflow.md](workflow.md#current-contracts) states the reading and update rules.

This contract decides nothing on its own. Each rule names the ADRs it restates; follow them for the full argument or the history. A disagreement with an ADR, and the difference between built and decided, are handled as [workflow.md](workflow.md#current-contracts) sets out.

## Read this before

Your task does any of these:

- adds, deletes, selects or defaults a Map, or touches `defaultMap`
- adds, deletes, orders or activates a Graph, or touches `activeGraph`
- adds a Resource to a Map, removes it from one, or deletes it from the Space, where Map membership or Edges are affected
- changes Open, Close, Resize, a Resource's size, or how neighbours are displaced
- adds, changes or draws a Resource's Shape on a Map
- changes how a new Space is created, or how a stored or imported Space without a Map is first opened
- changes the layout strategy contract, or adds or proposes Auto-arrange or a new automatic strategy

Or it touches any of these paths:

- `packages/graph/src/layout.ts`, `positioned.ts` or `grid.ts`
- `packages/graph/src/new-space.ts`
- `packages/graph/src/placement.ts` or `snapshot-edits.ts` (the open, close, resize, add-to-Map, remove-from-Map and delete-from-Space Edits)
- `packages/graph/src/validate.ts`, for Map, Graph or Edge refusals
- `packages/core/src/schema.ts`, for the Map, Graph or position schemas
- `packages/persistence/src/working-space.ts` (first working load)
- `packages/persistence/src/session-registry.ts` `deleteMap` and `deleteGraph`, and `packages/persistence/src/space-resource-planning.ts` `planContextDeletion`
- `packages/app/src/map-resolution.ts`, `placement-rendering.ts` or `navigation.ts` (Graph activation)
- `packages/app/src/map-authoring-commands.ts` and `graph-authoring-commands.ts`
- `packages/app/src/space-authoring.ts`, for `created-map`, `added-graph`, and which Edit target records `defaultMap`
- `packages/app/src/snapshot.ts` `updatePositionedMap`

Neighbouring topics this contract does **not** cover keep their existing guides: what a Graph may contain (cycles, self-Edges, duplicate Edges) is in [editing-and-persistence.md](editing-and-persistence.md); Edge anchors, lanes and head shapes are in [rendering.md](rendering.md); Space Resource selection and framing, beyond relocation when a Map or Graph is deleted, is in [editing-and-persistence.md](editing-and-persistence.md).

## Orientation

A **Map** is an authored subset of a Space's Resources: which Resources it contains, where each sits, its size, Open or Closed, and the Graphs it owns. A **Graph** is directed Edges over one Map's Resources. The **Active Graph** is the one drawn emphasised, which new Edges join. A **layout strategy** is behaviour that arranges Resources. Definitions live in [CONTEXT.md][context].

Older ADRs use retired names. Read Layout or Diagram as Map, Card or Thing as Resource, Route as Graph, Cards View as Resources View, and Expanded as Open. Computed, Algorithmic and Space Views no longer exist.

## 1. Maps are authored; strategies only arrange

- **R1. A Map is data, and a layout strategy is behaviour.** Every Map has a strategy that draws it, but not every strategy has a Map; one word for both hid that. Do not call a Map a layout, or give it a prefix like `AuthoredLayout` or `StoredLayout`. "Layout" survives only in `LayoutStrategy*` names. ([0014], [0040], [0101])
- **R2. Only the positioned strategy runs while the canvas draws.** It reads the selected Map and answers the graph to draw. Nothing computes placement at render, because a render-time arrangement is one nobody authored and nothing persists. ([0086], [0079], [0084])
- **R3. Automatic strategies are non-addressable capabilities, and none is privileged.** None draws the canvas. `gridStrategy` is the only one. It is pure, used only by tests, and kept so the contract has an implementation on each side, not because a grid is what returns. A change that works for only one strategy means the seam has leaked. ([0086], [0079], [0014])
- **R4. The strategy contract carries positions only.** A `LayoutStrategyResource` has optional `x`/`y` and no ports, and a `LayoutStrategyEdge` has endpoints and no routed sections. A Map stores a Resource and its position and nothing else, so routed geometry has nowhere to land. ([0086])
- **R5. There is no intermediate arranged-result type.** A strategy takes a `LayoutStrategyGraph` and returns the same shape with geometry filled in. "Arrangement" is prose, not a domain term (A1). ([0005], kept binding by [0014]; [0041])
- **R6. Auto-arrange is a destructive Edit over an existing Map.** The author invokes it explicitly, by a named tool. It rewrites that Map's positions in one Edit, and the result is authored like any other position. It is not a canvas, a selectable context, a renderer decision or incremental placement, and it creates no Map: the render path was wrong, not the strategy it ran. It is to live in `graph`, re-siting the render-time `elkjs` lint ban (`eslint.config.js`). **Not built** (see the end of this page). It is one atomic Edit; undo is a future feature (§6). ([0086], [0014], [0084])
- **R7. An automatic strategy returns only attached to an Edit, and never to honour a drop point.** Three spikes that seeded or constrained an optimiser each reshuffled existing Resources and placed the new one arbitrarily; the failure is structural. Whole-Map Auto-arrange is clear of it, because global rearrangement is what the author asked for. ([0086]; first [0013], carried by [0025])

## 2. The canvas context and the Map lifecycle

- **R8. A Map is the only canvas context.** It alone is selectable and addressable (`/spaces/:spaceId/maps/:mapId`), and the canvas shows only its Graphs. No Computed or Space Views, no flatten across Maps, no dormant compatibility: obsolete identities are invalid input and their URLs are not found. An automatic strategy is not addressable either and never draws the canvas (R3), so a computed view of a Space has no URL to live at (A4). ([0079], [0069])
- **R9. A working Space always has a durable `defaultMap`,** its persisted opening selection. ([0079])
- **R10. Choosing a Map is navigation, not an Edit, and a Space opens on the Map last edited on its own canvas.** Choosing dirties nothing. Every Edit through the canvas's Map records that Map as `defaultMap`, Add Map included, and writes the Map's resolved `activeGraph` explicitly. An Edit through a Map drawn inside an Open Space Resource writes that Map where it stands, keeps the Map's stored `activeGraph` except that Add Graph activates the Graph it creates (R26), and leaves the target Space's `defaultMap` unchanged (`snapshot.ts` `updatePositionedMap`, whose `opening` flag `space-authoring.ts` sets only for a canvas target). The reason: `defaultMap` and the Active Graph record where the author was working in that Space, which is navigation, and editing a drawn Map does not navigate into its Space. Letting it count would make editing a preview change where its Space opens. [0116] records this as a difference from [0112]'s rule that a drawn Map behaves as the canvas Map does; recording every Edit wherever the Map is drawn was rejected. Viewing a Map without editing saves nothing, and reading never writes. Remembering the last Map viewed, or letting the author pin a default, would be a new decision. ([0079], [0028], [0112], [0116]; D16 and D21 in the [inventory])
- **R11. Add Map creates and selects an empty Map in one Edit.** It has no Resources and owns one empty Graph, its Active Graph. Existing Resources are not copied in; authors add them, for example from the Resources View. ([0079], [0040], [0041])
- **R12. The last Map cannot be deleted,** because a working Space must keep a durable default. Delete Map is not offered while one Map remains (`map-authoring-commands.ts`), and `planContextDeletion` (`space-resource-planning.ts`) answers unchanged when no survivor exists. There is no refusal code. ([0079])
- **R13. Deleting a Map or Graph atomically relocates every Space Resource that selects it,** so no selection dangles. ([0091])

## 3. Space completeness and first working load

- **R14. Every new Space is created complete:** `Map 1`, an empty Active `Graph 1`, `defaultMap`, and the first Resource placed, persisted atomically. It never needs initialization. ([0080], [0018])
- **R15. A stored or imported Space may have no Map, and so no Graph.** That is valid stored state (A5). ([0079], [0041], [0015])
- **R16. First working load initializes a mapless Space.** Before returning, the first complete working-state read persists one atomic Edit: an empty `Map 1`, its empty Active `Graph 1`, and `defaultMap`. Existing Resources are **not** placed and no strategy seeds them, because nothing authored says where they go; they stay in the Resources View. ([0079], [0080])
- **R17. A Space with Maps but no default records its first Map** in authored order, and creates nothing. ([0079], [0080])
- **R18. One server-side boundary initializes.** Direct opening, Entering, rendering an Open Space Resource, and making a link target working all use it. Listing, import completion, export and reference validation read stored state and never initialize. ([0079], [0080])
- **R19. Initialization commits before the Space becomes working.** A conflict reloads, and accepts a competing initialization if one exists; otherwise the normal retry follows. Any other failure stops the Space opening. ([0079], [0080])
- **R20. Newness is never inferred, and no creation marker is stored.** Content is not provenance: a one-Resource import is still an import, and the creation boundary already knows when it creates. ([0080])
- **R21. Import does not rewrite its source Markdown;** Export is the crossing back to files. ([0079])

## 4. Graphs belong to one Map

- **R22. A Map owns a non-empty, ordered collection of Graphs.** Each Graph belongs to exactly one Map and is authored only through it. Graphs are never shared or filtered from a Space-level collection; two Maps telling one narrative hold two Graphs. With a shared Graph, removing a Resource from one Map would leave a dangling Edge or change every other Map (A10). ([0040], [0041])
- **R23. Every Edge is closed over its Map.** Intake checks that every member names a Space Resource and every Edge endpoint names a member. ([0040])
- **R24. A Graph id is unique across its Space** (`duplicate-graph-id`), because lookup, the Graph URL and render keys resolve a Graph without a Map. [0040]'s paragraph scoping Graph ids to their Map is refined by this. ([0108])
- **R25. Graph order is authored.** Creating appends, deleting keeps survivors' order, and manual reordering is a separate operation (**not built**). ([0040])
- **R26. Add Graph appends an empty Graph and activates it, in one Edit.** ([0040])
- **R27. The last Graph of a Map cannot be deleted.** Delete Graph is not offered while the Map has one Graph (`graph-authoring-commands.ts`), and `planContextDeletion` answers unchanged when no survivor exists. There is no refusal code. Deleting the Active Graph activates the first survivor. ([0040], [0041])
- **R28. A Map may name its opening Graph** in `activeGraph`; otherwise its first Graph opens. That fallback is a read, never a write. Intake rejects an `activeGraph` that dangles or names another Map's Graph. ([0040], [0041], [0028])
- **R29. Activating a Graph is navigation, and it is emphasis, not filtering.** Every owned Graph is still drawn. It is deliberate, never a side effect of drawing or reading, and neither submits nor dirties, because it changes nothing authored. There is no second "selected Graph". Cost, intended: an activation is not durable until a later Edit in that Map records it (A18). ([0028], [0041], [0079])
- **R30. An empty Graph is valid and may be active, but cannot be presented until it has an Edge.** Stated in CONTEXT.md and built; no ADR states it in Graph terms ([0015] has an older form).

## 5. Membership and removal

- **R31. Membership and position are one authored fact.** A Map's membership is its position keys. An omitted Resource is absent and not drawn; omission never means the origin, and the canvas never invents a position. A position may not name a Resource the Space lacks. Positions are not stored on the Resource, and nothing sits between a Resource and its position. ([0040], [0004])
- **R32. Placement belongs to the Map, not the Resource.** The same Resource may be absent from one Map and placed or sized differently in others. ([0040], [0064], [0122])
- **R33. Add to Map adds an existing Resource with an initial position.** It arrives Closed with no Edges (code treatment, not an ADR rule). ([0040])
- **R34. Remove from Map is one Edit.** It removes membership, position, and every incident Edge in that Map's Graphs. Emptied Graphs remain. The Resource stays in the Space and in other Maps. ([0040])
- **R35. Removing or deleting a Resource moves no other Resource,** Open or Closed, at any size. Removal changes no size, and only a Resize displaces (R40). The room a resized Resource held stays where it was; the author moves into it or not. ([0122]; `snapshot-edits.property.test.ts`)
- **R36. Deleting a Resource from the Space runs Remove from Map's cascade in every Map.** ([0040])

## 6. Size, Open and displacement

- **R37. Size and Open/Closed are authored on the Map, independently.** A Map entry is `{ x, y, open?, size?, shape? }`. Open, Close and Resize are Edits and survive reload and export. Both fields are optional with an application default, as `shape` is (R47): an entry with no `open` is Closed and one with no `size` is the Closed Size (260×146); every reader resolves them through `resourceOpen` and `resourceSize` in `@project/core`. Add Resource and Add to Map write no size. Coupling the two made a bigger Resource a two-step gesture that also changed what it drew and moved its neighbours (A17). ([0064], [0122])
- **R38. Only Resize changes a size, and Open and Close change only `open`.** Opening or Closing changes what is drawn inside the Resource's rect — its Title, or its content — and never its size or any position. Edit on a Closed Resource still Opens it before placing the caret, changing no size. A Resize back to the Closed Size is an ordinary Resize and leaves an Open Resource Open; there is no magnetic Close (A26). ([0122], [0064])
- **R39. Open is offered only by a kind with content to show** — Markdown, Image, Space and Reference. An Ur Resource has none (ADR 0113), so it offers no Open or Close — reversing ADR 0113's rejection of a kind that cannot be Opened, which rested on Open being how a size was authored — the Open Edit refuses it, and intake refuses an entry storing it Open, both as `open-requires-content` (A25). ([0122], [0113])
- **R40. The Closed Size is the one floor for every kind, Open or Closed, and only a Resize displaces.** No kind has its own minimum and no kind chooses a first-Open size: content adapts to the rect it is given — a small Open document scrolls, a picture scales down, an embedded Map fits (A24). A Resize moves the Resources its growth passes, once, writing their positions into the Map. Between Edits a drawn position *is* the authored one: a drop lands where it was dropped, with no conversion and no `move` draft, and a resize preview shows only the resizing Resource. `Placement.drawn` and `authoredPoint` must not return. Render-derived displacement coupled every position to every size, jumped, and needed a non-total inverse that misplaced drops (A13). ([0122], [0084])
- **R41. A Resource makes room on at most one axis, decided against the subject's rect before the Resize.** The change is the new size less the old one, per axis, negative for a shrink. At or past the old right edge, a Resource takes the width change only. Otherwise, at or past the old bottom edge, it takes the height change only. Otherwise it does not move. One axis is enough to stay clear; `x` first keeps a Resource beside the subject from moving vertically; touching counts as clear. Cost: a grid no longer scales uniformly, and a Resource below the subject but not clear on `x` moves down however far left it sits (A15, A16). ([0093], [0122])
- **R42. A Resize is memoryless.** It reads the Map as it is now and never records which Resources it pushed (A14). A grow then the shrink back restores every position, because the grow carries each clear Resource clear of the grown rect, which the shrink measures from. The other order is stated, not clamped: a Resource overlapping the larger rect but clear of the smaller one is not moved by a shrink, and the grow back pushes it. ([0084], [0093], [0122])
- **R43. One Resize Edit may move many Resources, as one unit.** ([0084])
- **R44. The resize control is offered on the selected Resource, Open or Closed, any kind,** wherever its Map may be authored. It is one bottom-right control changing both dimensions from a fixed top-left origin; the drag is an Interaction draft producing one Edit on release, and there is no keyboard resize. A selected Resource drawn in a Shape other than the rectangle also draws a thin rectangular border around its rect, so the control sits on that border's corner; the rectangle's edge is its own border. Edge handles and attachment are untouched. ([0122])

**Undo is not built.** It is a planned future feature. Every Edit, including Open, Close, Resize and Auto-arrange, is derived, submitted and stored as one atomic unit, so a future undo will reverse an Edit as a whole: undoing a Resize moves back every Resource it displaced, and undoing an Auto-arrange restores every position it rewrote. Until undo exists, an Edit is reversed only by another Edit. Where [0086] and [0084] call these Edits undoable, they describe the unit a future undo reverses; where [0048] and [0074] say there is no undo, they describe V1. (Resolved 2026-10-04 as D12 in the [inventory].)

## 7. Shape

- **R45. A Resource's Shape is authored on the Map.** It is one of a closed set: rectangle, pill, ellipse, diamond. It is stored in the Map's entry beside position, Open/Closed state and size, never on the Resource, so the same Resource may take different Shapes in different Maps. A Shape is the diagram's notation, and notation belongs to the diagram (A19). ([0121])
- **R46. Only an Ur Resource takes a Shape.** A Shape is diagram notation, and an Ur Resource is the kind a diagram is drawn with; a Markdown, Image, Space or Reference Resource is always the rectangle. The Shape choice is offered on an Ur Resource alone, a Shape Edit on any other kind is refused (`shape-requires-ur-resource`), and intake refuses a Map entry giving any other kind a Shape but the rectangle with the same code. ([0121], [0113])
- **R47. The Shape is optional, and the application's default is the rectangle.** An entry with no `shape` stored draws as the rectangle, as a Graph with no `headShape` draws the arrow; every reader resolves it through `resourceShape` in `@project/core`. Add Resource and Add to Map write no Shape. Choosing a Shape writes the one chosen, the rectangle included, and choosing the Shape a Resource already draws as is `unchanged`, so the rectangle is `unchanged` on an entry storing none. Every other Edit that rewrites an entry keeps what it stores. Remove from Map forgets it with the rest of the entry (A23). ([0121], [0105])
- **R48. A Shape changes no rect.** It is drawn at the Resource's rect — its size — so Resize, displacement (R37–R44) and Edge attachment are unchanged. Ellipse and diamond fill the rect proportionally, and a pill's ends stay half-circles at any size. Every Shape in the set touches the midpoint of each side of its rect at every size, where Edges attach; a Shape that does not is not admitted (A21, A22). The Title lays out centred in the rectangle inscribed in the Shape, with no kind glyph — an Ur Resource's Shape says what it is, so it draws none in any Shape, Open or Closed — and every Shape draws the Title Lines, clamped as the rectangle's are to the lines its inscribed rectangle holds at the Closed Size, so resizing wider is how a long Title is given room. The selection ring follows the outline. ([0121], [0110])
- **R49. A Shape is drawn at every size.** Resizing an Ur Resource gives the same Shape at its new size; an Ur Resource is never Open (R39), so nothing it draws changes with Open. The resize control stays at the rect's bottom-right corner, on the border a selected Shape draws around its rect (R44). The Shape choice is on the rail at every size. A presented Resource is drawn by the presented surface and is the rectangle. ([0121], [0122])
- **R50. An embedded Map draws its Ur Resources' Shapes**, at their sizes, because one surface draws every Map. ([0121], [0112])

## Rejected alternatives

| ID | Rejected | Why | Cost accepted |
|---|---|---|---|
| A1 | An `Arrangement` type of resolved geometry between strategy and consumers | Every consumer wants positions, so it adds a translation step at a seam meant to stay thin. React Flow has no layout entity either ([0005], [0014], [0086]) | The noun names nothing on screen |
| A2 | `AuthoredLayout`/`SpaceLayout`/`StoredLayout`, or "Layout" kept on the function | They buy the collision off; "Stored" implies a cache ([0014]) | A broad rename; "layout" left in `LayoutStrategy*` |
| A3 | An automatic strategy or elkjs at render | Unreachable, routed output cannot persist, and the placement is unauthored ([0086]) | elkjs knowledge survives only in `.scratch/layout-seam/issues/01`, `04` |
| A4 | Computed Views kept dormant | Keeps most of the removed complexity ([0079]) | V1 loses the cross-Map flatten |
| A5 | Every import must author a Map first | An empty Map is the intended manual-authoring path ([0079]) | — |
| A6 | A read-only or app-owned draft on first open | A Map is what makes a Space usable ([0079]) | First open writes state |
| A7 | Newness inferred from Resource count | Content is not provenance ([0080]) | — |
| A8 | A stored creation marker | The creation boundary already knows ([0080]) | — |
| A9 | Placing a mapless Space's Resources at first load | No authored basis for positions ([0080]) | They start outside the Map |
| A10 | Space-level Graphs that Maps filter or share | Removing a Resource from one Map breaks or changes the others ([0040]; superseded [0022], [0026]) | Duplicate Graphs diverge independently |
| A11 | Map-scoped Graph ids | Every lookup, render key and Graph URL would need the Map, to defend an unused ability ([0108]) | — |
| A12 | An optimiser seeded to honour a drop point | Structural reshuffling ([0086], [0013]) | — |
| A13 | Displacement derived at render | Size-coupled positions, jumps, a non-total inverse; a drag preview only moves the jump under the pointer ([0084]) | One Edit moves many positions |
| A14 | Recording which Resources a Resize pushed | Per-Resize state goes stale, and identical Maps would behave differently ([0084]) | A shrink then a grow is not an involution (R42) |
| A15 | Independent per-axis thresholds (half-plane, or collapsed edges per axis) | Keeps the beside-but-lower jump ([0093]) | A grid's shape is not preserved |
| A16 | Bands against the Closed Size whatever the Resource's size | A Resource inside a resized subject's rect but past the Closed edge would be pushed by every grow ([0122]; first [0093], against the Open rect) | Far-left Resources still move down |
| A17 | Open changing size: an Open Size beside the Closed Size, or a second stored Closed size | Opening moved neighbours and changed a size the author set, and a bigger Resource took two gestures; two sizes per entry is two facts for one rect ([0122]; superseded [0066]) | Opening an unresized Resource shows its content at the Closed Size |
| A18 | Activation as an Edit, or as dirtying | It changes nothing authored ([0028]) | Not durable until the next Edit |
| A19 | A Shape on the Resource | Notation is the diagram's; a presentation field on the Resource is the shared slot the model rules out ([0121]) | A Resource re-added to a Map starts as a rectangle |
| A20 | A Shape fixed by kind | A kind adds only what its content supports ([0121], [0113]) | — |
| A21 | A Shape that changes the Closed Size | Displacement, attachment and the fixed Closed Size would each depend on it ([0121]) | A circle is drawn as an ellipse |
| A22 | An open set (free radius, arbitrary path) | Edges could no longer be guaranteed to meet the outline ([0121]) | Four Shapes only |
| A23 | A required Shape (or size), written on every entry | An optional field whose default the application chooses is the format's pattern, as `headShape` is ([0121], [0105]); requiring it would put notation only an Ur Resource uses on every entry of every kind | One resolver, `resourceShape`, reads an absent Shape as the rectangle |
| A24 | A kind-specific floor or first-Open size (a Space Resource's room for its Map, an image's natural size, a Reference's Target geometry) | One floor is simpler to state and draw, and content can fit any rect ([0122]; refined [0106], [0114]) | A small Open Space Resource shows a small Map |
| A25 | An Ur Resource that Opens to show its Title | With size independent of Open, Opening one changes nothing a reader sees ([0122]) | — |
| A26 | The magnetic Close: a Resize ending at the Closed Size Closes | It made Close a side effect of a size, which is no longer Open's ([0122]; superseded [0066]) | Closing is always its own command |

## Accepted, not built

Every rule above is built except these:

- **Auto-arrange** (R6), with any returning automatic strategy (R7). Delivery: [`.scratch/auto-arrange/issues/01-auto-arrange-a-map.md`](../../.scratch/auto-arrange/issues/01-auto-arrange-a-map.md), which also holds the two open questions: whether the Edit records which strategy produced the positions, and whether it asks for confirmation before rewriting a whole Map while undo does not exist.
- **Manual Graph reordering** (R25). Delivery: [`.scratch/graph-reordering/issues/01-reorder-a-maps-graphs.md`](../../.scratch/graph-reordering/issues/01-reorder-a-maps-graphs.md).

Remove an entry here in the change that verifies its implementation.

**Treatment without an ADR** (owned by code, tests or CONTEXT.md): R30's presentation gate; R33's Closed, Edge-less arrival; deleting the default Map moves `defaultMap` to the selected survivor, else the first.

## Provenance

The rule-to-source [inventory] accounts for every rule, rejected alternative, omitted historical claim and source disagreement behind this contract, and the [pilot report](../../.scratch/adr-consolidation/pilot/REPORT.md) records how the contract was evaluated.

| IDs | Section | Sources |
|---|---|---|
| R1 | §1 | [0014], [0040], [0101] |
| R2 | §1 | [0086], [0079], [0084] |
| R3 | §1 | [0086], [0079], [0014] |
| R4 | §1 | [0086] |
| R5 | §1 | [0005], [0014], [0041] |
| R6 | §1; Accepted, not built | [0086], [0014], [0084] |
| R7 | §1; Accepted, not built | [0086], [0013], [0025] |
| R8 | §2 | [0079], [0069] |
| R9, R12 | §2 | [0079] |
| R10 | §2 | [0079], [0028], [0112], [0116]; D16, D21 |
| R11 | §2 | [0079], [0040], [0041] |
| R13 | §2 | [0091] |
| R14 | §3 | [0080], [0018] |
| R15 | §3 | [0079], [0041], [0015] |
| R16, R17, R18, R19 | §3 | [0079], [0080] |
| R20 | §3 | [0080] |
| R21 | §3 | [0079] |
| R22, R27 | §4 | [0040], [0041] |
| R23, R25, R26 | §4 | [0040] (R25 also Accepted, not built) |
| R24 | §4 | [0108] |
| R28 | §4 | [0040], [0041], [0028] |
| R29 | §4 | [0028], [0041], [0079] |
| R30 | §4 | CONTEXT.md "Graph"; [0015] |
| R31 | §5 | [0040], [0004] |
| R32 | §5 | [0040], [0064], [0122] |
| R33, R34, R36 | §5 | [0040] |
| R35 | §5 | [0122] |
| R37, R38 | §6 | [0064], [0122] |
| R39 | §6 | [0122], [0113] (reversing its rejected option) |
| R40 | §6 | [0122], [0084] |
| R41 | §6 | [0093], [0122] |
| R42 | §6 | [0084], [0093], [0122] |
| R43 | §6 | [0084] |
| R44 | §6 | [0122] |
| R45, R47, R49 | §7 | [0121] (R47 also [0105]; R49 also [0122]) |
| R46 | §7 | [0121], [0113] |
| R48 | §7 | [0121], [0110] |
| R50 | §7 | [0121], [0112] |
| A1–A26 | Rejected alternatives | Cited in each row |
| D12 | §6, Undo | [0086], [0084], [0048], [0074] |

[context]: ../../CONTEXT.md
[inventory]: ../../.scratch/adr-consolidation/pilot/inventory.md
[0115]: ../adr/0115-current-contracts-state-the-live-design-and-adrs-keep-its-history.md
[0004]: ../adr/0004-cards-are-the-graph.md
[0005]: ../adr/0005-layout-is-a-strategy.md
[0014]: ../adr/0014-layout-is-the-authored-data-strategy-is-the-behaviour.md
[0015]: ../adr/0015-a-space-may-have-no-routes.md
[0018]: ../adr/0018-a-new-space-is-a-single-centered-card.md
[0028]: ../adr/0028-activating-a-route-is-not-an-edit.md
[0040]: ../adr/0040-layouts-own-card-membership-and-routes.md
[0041]: ../adr/0041-graph-is-the-first-public-name-for-route.md
[0048]: ../adr/0048-escape-and-commit-are-decided-by-the-surface-not-the-field.md
[0064]: ../adr/0064-opening-a-card-expands-it-in-place.md
[0066]: ../adr/superseded/0066-open-size-survives-closing.md
[0069]: ../adr/0069-entities-have-durable-web-addresses.md
[0074]: ../adr/0074-space-card-references-own-the-target-space.md
[0079]: ../adr/0079-v1-exposes-only-layouts-and-first-open-initializes-one.md
[0080]: ../adr/0080-new-spaces-start-complete-and-layoutless-stored-spaces-are-repaired.md
[0084]: ../adr/0084-displacement-is-applied-by-the-edit-that-causes-it.md
[0086]: ../adr/0086-automatic-arrangement-is-an-edit-not-a-render-path.md
[0091]: ../adr/0091-context-deletion-relocates-every-space-thing.md
[0093]: ../adr/0093-a-thing-makes-room-on-one-axis-once-clear-of-the-collapsed-subject.md
[0101]: ../adr/0101-map-and-resource-are-the-first-public-names-for-diagram-and-thing.md
[0108]: ../adr/0108-graph-identity-is-unique-within-the-space.md
[0112]: ../adr/0112-a-map-behaves-the-same-wherever-it-is-drawn.md
[0116]: ../adr/0116-only-an-edit-on-the-canvas-moves-where-a-space-opens.md
[0013]: ../adr/superseded/0013-editing-requires-a-positioned-layout.md
[0022]: ../adr/superseded/0022-a-layout-names-the-routes-it-shows.md
[0025]: ../adr/superseded/0025-a-layout-is-optional-and-editing-makes-it-positioned.md
[0026]: ../adr/superseded/0026-a-route-is-active-and-the-layout-may-name-it.md
[0110]: ../adr/0110-an-edge-faces-across-the-larger-gap-between-two-resources.md
[0105]: ../adr/0105-a-graphs-edges-share-one-head-shape.md
[0113]: ../adr/0113-every-capability-is-a-resources-and-an-ur-resource-has-no-content.md
[0121]: ../adr/0121-a-shape-is-a-maps-and-an-ur-resource-draws-it-open-and-closed.md
[0122]: ../adr/0122-a-resources-size-is-independent-of-open.md
[0106]: ../adr/0106-an-image-resource-owns-a-url-not-bytes.md
[0114]: ../adr/0114-a-reference-resource-takes-its-targets-geometry-and-withholds-only-content-actions.md
