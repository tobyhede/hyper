# Cluster: map-graph

Scope: live 0002 0003 0005 0014 0015 0032 0040 0041 0079 0080 0086 0087 0100 0103 0104 0105; superseded 0012 0013 0017 0021 0022 0023 0025 0026 0031 0045 0055 0072 0075.
Percentages are my reading estimates (paragraph-level, +/-10 points), not measurements. Word counts from mech.json. Code claims below were checked by grep/read; where I did not check, I say so.

## Headline numbers

- Words: 13,184 in 16 live ADRs + 8,848 in 13 superseded = 22,032.
- Word-weighted, the 16 live ADRs: LIVE 28% / STALE-VOCAB 21% / OVERTAKEN 14% / HISTORY 37%. So about half the live-ADR text states a binding rule (in either vocabulary).
- The split is by age. **Older live ADRs (0002–0086, 7,586 words): LIVE 8%, STALE-VOCAB 29%, OVERTAKEN 18%, HISTORY 44%.** Only about 37% states a current rule, and nearly all of that is in retired words (Layout/Card/Route/Thing/Diagram/View). **Newer ADRs (0087–0105, 5,598 words): LIVE 55%, STALE 11%, OVERTAKEN 8%, HISTORY 26%.** The user's hypothesis holds for the old half and not for the new half.
- 90 distinct live decisions across the cluster, about 60 after deduplication (0079 and 0080 overlap by roughly 60%, and 0040 and 0041 restate each other's invariants).
- Proposed consolidated doc: about 3,000 words, which is 23% of the live ADR words and 14% of the whole cluster.

## Table

| ADR | words | LIVE% | STALE-VOCAB% | OVERTAKEN% | HISTORY% | #live | verdict | where rule lives now |
|---|---|---|---|---|---|---|---|---|
| 0002 | 187 | 0 | 30 | 45 | 25 | 2 | ARCHIVE | 0014/0079 restate the nucleus; CONTEXT 'Map'/'Layout strategy' |
| 0003 | 251 | 0 | 45 | 15 | 40 | 2 | CONSOLIDATE | CONTEXT Graph; no test found asserting the cross-Graph cycle rule explicitly |
| 0005 | 382 | 15 | 15 | 30 | 40 | 1 | ARCHIVE | packages/graph/src/layout.ts doc comment; CONTEXT Placement _Avoid_ 'arrangement' |
| 0014 | 520 | 10 | 20 | 20 | 50 | 3 | CONSOLIDATE | CONTEXT 'Map'/'Layout strategy'; layout.ts; rendering.md |
| 0015 | 476 | 0 | 15 | 45 | 40 | 2 | ARCHIVE | CONTEXT Graph ('empty Graph ... cannot be presented until it has an Edge'); packages/app/src/dock-chrome.ts presentDisabled |
| 0032 | 415 | 0 | 50 | 5 | 45 | 5 | KEEP | CONTEXT Graph/Edge; validate.ts duplicate-graph-edge; packages/graph/test/space-intake.test.ts; traversal.test.ts |
| 0040 | 950 | 0 | 45 | 25 | 30 | 10 | CONSOLIDATE | CONTEXT Map/Graph/Placement; schema.ts positionedMapSchema; validate.ts; space-authoring.ts (map-must-keep-graph); space-intake.test.ts |
| 0041 | 1707 | 20 | 20 | 15 | 45 | 7 | CONSOLIDATE | CONTEXT (Graph, Graph navigation, Traversal history, _Avoid_ route); test/unit/current-domain-vocabulary.test.ts; schema.ts SPACE_FILE_VERSION |
| 0079 | 543 | 0 | 65 | 8 | 27 | 10 | KEEP | AGENTS.md ADR 0079 entry; CONTEXT Map; map-resolution.ts; space-authoring.ts space-must-keep-map; persistence working-space.test.ts |
| 0080 | 331 | 0 | 60 | 0 | 40 | 5 | KEEP | packages/graph/src/new-space.ts (newSpace/initializeSpace); new-space.test.ts; persistence working-space.test.ts |
| 0086 | 1824 | 10 | 15 | 15 | 60 | 5 | CONSOLIDATE | rendering.md 'strategy contract'; layout.ts; strategy-contract.test.ts |
| 0087 | 1239 | 5 | 40 | 15 | 40 | 7 | KEEP | rendering.md 'Handle geometry'; react-flow-adapter/src/edge-attachment.ts (facingSides, selfEdgeAttachment); edge-attachment.test.ts |
| 0100 | 832 | 45 | 15 | 20 | 20 | 8 | KEEP | react-flow-adapter/src/edge-lanes.ts (graphLanes, GRAPH_LANE_SPACING=8, DETACHED_END_TRIM=0.2); edge-lanes.test.ts; canvas-projection tests |
| 0103 | 1204 | 75 | 0 | 0 | 25 | 6 | KEEP | edge-lanes.ts laneBezier; GraphLane.reach/laneReach; edge-lanes.test.ts property |
| 0104 | 1110 | 70 | 0 | 8 | 22 | 9 | KEEP | schema.ts graphEdgeSchema (.strict, titleHidden); space-authoring (titled-edge, hid-edge-title, showed-edge-title); CONTEXT Edge |
| 0105 | 1213 | 80 | 0 | 0 | 20 | 8 | KEEP | core graphHeadShape; graph newGraph; ui GraphHeadShapeGlyph/GraphLegendMark/SwatchMenuRadioGroup; adapter GraphHeadMarkers; graph-head-shape.test.ts, GraphHeadMarkers.test.tsx |
| 0012 | 508 | 0 | 0 | 90 | 10 | 0 | ALREADY-SUPERSEDED | - |
| 0013 | 814 | 0 | 0 | 80 | 20 | 0 | ALREADY-SUPERSEDED | residues restated in 0025->0086 (drop-point negative) and 0040 (positions may not name missing Resources) |
| 0017 | 573 | 0 | 0 | 85 | 15 | 0 | ALREADY-SUPERSEDED | - |
| 0021 | 859 | 0 | 0 | 80 | 20 | 0 | ALREADY-SUPERSEDED | floating-edge idea reborn as 0087 |
| 0022 | 546 | 0 | 0 | 85 | 15 | 0 | ALREADY-SUPERSEDED | CONTEXT Active Graph ('emphasis') |
| 0023 | 956 | 0 | 0 | 85 | 15 | 0 | ALREADY-SUPERSEDED | principle restated in 0032 |
| 0025 | 1191 | 0 | 0 | 85 | 15 | 0 | ALREADY-SUPERSEDED | - |
| 0026 | 783 | 0 | 0 | 80 | 20 | 0 | ALREADY-SUPERSEDED | 0040 + CONTEXT Active Graph |
| 0031 | 387 | 0 | 0 | 90 | 10 | 0 | ALREADY-SUPERSEDED | - |
| 0045 | 1550 | 0 | 0 | 75 | 25 | 0 | ALREADY-SUPERSEDED | validate.ts duplicate-graph-id; schema.ts:372 |
| 0055 | 177 | 0 | 0 | 90 | 10 | 0 | ALREADY-SUPERSEDED | current-domain-vocabulary.test.ts 'the canvas renderer is named once (ADR 0055)' |
| 0072 | 186 | 0 | 0 | 95 | 5 | 0 | ALREADY-SUPERSEDED | - |
| 0075 | 318 | 0 | 0 | 95 | 5 | 0 | ALREADY-SUPERSEDED | - |

## Per-ADR live decisions (current vocabulary)

### ADR 0002 — ARCHIVE
- A Space may hold several Maps (restated in 0079, CONTEXT Map).
- Arranging Resources (layout strategy) and drawing them (render adapter) are separate seams.

_Notes:_ Its README 'binds' line is itself mostly void: the View it separates from Layout was removed by 0079. ELK 'Presentation view' premise gone (0086).

### ADR 0003 — CONSOLIDATE
- Graphs over the same Resources are independent; two Graphs may cross a pair in opposite directions.
- No code may assume a Space or Map has a single global order of its Resources.

_Notes:_ Its parenthetical says ADR 0012 forbids a Graph revisiting a Resource; 0012 was superseded by 0032 (cycles legal), so the in-body correction is itself now wrong.

### ADR 0005 — ARCHIVE
- A layout strategy returns no separate arranged-result type: it populates optional x/y on the elements it was given.

_Notes:_ Name 'Layout = strategy' reversed by 0014; 'which cards belongs to the View' overtaken by 0040/0079 (Map membership); ELK-based argument and 'kind plus parameters' obsolete after 0086.

### ADR 0014 — CONSOLIDATE
- A Map is the authored Resource-to-position data; a LayoutStrategy is the behaviour that arranges Resources.
- The positioned strategy reads a Map (Map -> LayoutStrategyGraph); Auto-arrange, when built, runs the other direction and writes into a Map.
- Strategy factories are named *Strategy (gridStrategy, positionedStrategy), never *Layout.

_Notes:_ LayoutPoint/LayoutPosition duplication overtaken by 0038 (MapPosition only; grep finds neither old name). LayoutGraph/LayoutCard names overtaken by 0041 (LayoutStrategyGraph). elkStrategy gone (0086).

### ADR 0015 — ARCHIVE
- A stored/imported Space may hold no Map and therefore no Graph; it still loads (now only until first working load, 0079/0080).
- Presenting is unavailable when there is nothing to traverse (today: Active Graph with no Edges, not 'no Graph').

_Notes:_ 'routes may be empty' is overtaken by 0040 (Map owns >=1 Graph) and 0079/0080 (every working Space has a Map+Graph). visibleCardIds composition overtaken by Map membership (0040). Draft deferral is history.

### ADR 0032 — KEEP
- A Graph may contain forks, merges, cycles and self-Edges; authoring never rejects an Edge for presentation's sake.
- Presenting owns traversal: it records Traversal history; nothing advances automatically.
- An exact duplicate (from,to) within one Graph: the drawing gesture is an idempotent no-op; intake refuses it (duplicate-graph-edge).
- The same pair in two Graphs is two Edges.
- Intake does not silently deduplicate imported Edges.

_Notes:_ Written in Route/Walk/Card/Alias vocabulary; 'Algorithmic Views must route cyclic Edges' overtaken by 0079.

### ADR 0040 — CONSOLIDATE
- A Map owns its Resource membership, each member's position, and a non-empty ordered collection of Graphs.
- Membership and position are one fact: a Map's position keys are its membership; omission means absent.
- Every Edge endpoint names a member of the owning Map (closure), checked at intake at two levels.
- Remove from Map removes membership, position and every incident Edge in that Map's Graphs in one Edit; emptied Graphs remain.
- Deleting a Resource from the Space performs that cascade in every Map.
- A Map may name activeGraph; otherwise the first Graph is active; intake rejects a dangling or foreign activeGraph.
- Creating a Map creates its initial empty Active Graph in the same Edit; Add Graph appends and activates.
- The last Graph of a Map cannot be deleted; deleting the active Graph activates the first survivor.
- Graphs are never shared between Maps; two Maps wanting one narrative hold two Graphs.
- Graph order is authored; creation appends, deletion preserves survivor order.

_Notes:_ Algorithmic View subjects/conversion section overtaken by 0045 then 0079. 'Graph identity scoped to the owning Layout' overtaken by 0045 (Space-unique) - and 0045 is itself superseded, so the live rule has no live ADR. Whole body in Layout/Card/Route.

### ADR 0041 — CONSOLIDATE
- The Map-owned directed structure is a Graph; Route and Walk are retired (guarded by current-domain-vocabulary test).
- Graph navigation is the transient working interaction; Traversal history is what was visited; neither is persisted.
- Strategy intermediates are LayoutStrategy*-qualified and render intermediates GraphRender*-qualified; no DomainGraph/HyperGraph prefixes.
- The @project/graph package keeps its name.
- Lowercase 'route' survives only as HTTP route or edge-geometry routing, qualified.
- The space document is version 1; Graphs nest under their owning Map; no Space-level graphs collection; no compatibility parser or alias key.
- Import may omit persistence-owned ids and mints them before domain intake; activation is navigation, not an Edit.

_Notes:_ Document example uses `layouts` (now `maps`, 0085/0101). 'flow' Algorithmic View and GraphView->SpaceCanvas component renames overtaken (0079; done). Rename tables, roll-forward discipline and completion criterion are history. graphEntryCards etc renamed again (graphEntryResources).

### ADR 0079 — KEEP
- An authored Map is the only selectable and addressable canvas context; Computed/Space View is gone from domain, persistence, URLs and registry.
- A Space's persisted opening selection is defaultMap; obsolete canvas identities are invalid input and their URLs are not found.
- Automatic layout strategies are non-addressable capabilities; the positioned strategy draws the selected Map.
- A canvas shows the selected Map and only the Graphs it owns.
- First complete working-state read of a mapless stored Space atomically creates and selects empty Map 1 + empty Active Graph 1 and records defaultMap before returning; non-working reads never initialize.
- Initialization commits before the Space is working; conflict reloads and accepts a competing initialization; other failure prevents opening.
- Add Map creates and selects an empty Map with one empty Active Graph in one Edit.
- The last Map cannot be deleted.
- Choosing a Map is navigation; a later Edit in that Map records it as defaultMap.
- A Space Resource Edit cannot complete until its target supplies valid Map and Graph identities.

_Notes:_ 'A newly created Space still begins ...' is factually corrected by 0080. 'Cards View' is now the Resources list (ResourcesPopover).

### ADR 0080 — KEEP
- Every constructor that creates a Space creates Map 1 with empty Active Graph 1, records it as defaultMap, and centres the first Resource, persisted atomically.
- A mapless stored Space is repaired on first working load with empty Map 1/Graph 1; its existing Resources are not placed.
- A stored Space with Maps but no default records its first Map as default and creates nothing.
- One server-side first-working-load boundary serves direct open, Enter and embedded rendering; listing, import completion, export and reference validation never repair.
- Newness is never inferred from Resource count and no creation marker is stored.

_Notes:_ ~60% restates 0079 with a correction; together they are one decision.

### ADR 0086 — CONSOLIDATE
- No layout strategy runs at render time except positionedStrategy.
- The LayoutStrategy contract carries positions only: no Edge sections, no ports.
- gridStrategy is retained as a pure second implementation; no strategy is privileged.
- An automatic arrangement (Auto-arrange) is a destructive, undoable Edit over an existing Map, never a second canvas context or render path.
- Negative: do not seed or constrain an optimiser (elkjs) to honour a drop point.

_Notes:_ Ticket 01/02 build lists and cost narrative are history. Its 'open question' and the surviving per-Graph <graphId>::in/out ids were overtaken by 0087. Diagram/Thing vocabulary.

### ADR 0087 — KEEP
- A Resource has four Edge anchors, one per side, which are the same four authoring handles.
- An Edge attaches to the anchors facing each other, decided while drawing from live positions; nothing is stored.
- Anchor and affordance are separate layers; anchors always render (hidden via opacity/visibility, never display:none), including read-only embedded Maps.
- The side is chosen in the Edge component reading React Flow's store; the rule itself is a pure function tested in node.
- Four discrete anchors, not a sliding perimeter point; handle geometry stays declared, never re-measured.
- A self-Edge takes a fixed loop before the general rule.
- The per-Graph port family is gone; do not reintroduce it.

_Notes:_ 'Several Graphs ... draw one line over another' cost overtaken by 0100 lanes. Its statement that the rule 'divides by the vector between two centres' is contradicted by rendering.md ('reads the gap between the rects, not the vector between their centres').

### ADR 0100 — KEEP
- Edges joining the same pair of Resources (any Graph, either direction) are drawn in parallel lanes 8 flow units apart.
- The Active Graph's Edges are centred and connect anchor to anchor; an A->B/B->A pair in the Active Graph splits the centre.
- Other Graphs take lanes below/right of the centre in Graph order, and stop short by a fifth at each end, cut in geometry not via dasharray.
- With no Active Graph nothing stops short.
- Lanes are parallel, never fanned by curvature.
- Lane assignment is decided in the projection (graphLanes) and carried as laneOffset/endTrim; offset sign is screen-based.
- The Active Graph is painted last; others recede by opacity and narrower stroke.
- Nothing about lanes is stored.

_Notes:_ Translate geometry overtaken by 0103; 'only the connecting Edge carries an arrowhead' overtaken by 0105. Uses Thing/Diagram.

### ADR 0103 — KEEP
- A lane is the lone curve offset along its normal (Tiller-Hanson, subdivided to a fixed depth), not a translate.
- The offset is drawn over one span per pair judged at the pair's reach, bridged to the anchors by one cubic each end.
- Where a pair has no span, the whole pair falls back to the translate.
- Lane ends, arrowheads and sign convention are where a translate puts them; label at the offset midpoint.
- Self-Edge lanes are unchanged.
- Each lane carries its pair's reach from graphLanes.

_Notes:_ Essentially an algorithm spec; arguably belongs in edge-lanes.ts comments/rendering.md rather than an ADR.

### ADR 0104 — KEEP
- An Edge may carry an optional one-line Title, never minted, stored trimmed and non-empty, no length cap.
- A line break is refused with stable code edge-title-one-line.
- Edge identity stays (from,to) within its Graph; Edits find an Edge by endpoints (sameEdge).
- titleHidden is stored only as true, only beside a Title; clearing the Title clears it; hiding without a Title is refused.
- Per-Edge colour/dash/marker/tags are excluded; the line's appearance is the Graph's.
- Title visibility is per-Edge, authored and persisted, not a Graph or view setting.
- The word is Title, not Label.
- graphEdgeSchema is strict; the exporter writes title/titleHidden in fixed order.
- A redrawn Edge carries nothing over and is appended (last choice at its fork).

_Notes:_ Reconnect section says reconnected-edge 'stays live until 05 removes the gesture'; grep finds no reconnected-edge in packages today, so that clause is overtaken by code.

### ADR 0105 — KEEP
- A Graph carries a head shape: arrow, vee, dot or diamond; no none, no tail shape, no per-Edge override.
- Every drawn Edge, including those that stop short, ends in its Graph's head shape at its drawn head, at the Edge's opacity.
- Head markers are one shared <defs> per canvas keyed by Graph UUID, sized in stroke widths.
- Every new Graph starts as arrow; absent draws as arrow (graphHeadShape is the one place); newGraph is the one constructor.
- Shape... sits under Colour... in the Graph menu; changed-graph-head-shape Edit; same-shape is unchanged.
- Every Graph list's mark is a miniature Edge in colour + head shape (GraphLegendMark via graphAppearance).
- The connection preview draws the Active (or embedded) Graph's head shape.
- Vocabulary: tail/head; 'head shape'; marker/arrowhead stay in the render layer.

_Notes:_ Fully live; menu-arrangement detail is the kind of UI prose README says tests, not ADRs, hold.

### ADR 0012 — ALREADY-SUPERSEDED
_Notes:_ No-revisit rule reversed by 0023 then 0032. Still referenced (wrongly as current) by 0003's parenthetical.

### ADR 0013 — ALREADY-SUPERSEDED
_Notes:_ Its 'do not seed ELK to honour a drop point' negative survives only by being re-copied into 0025 and 0086.

### ADR 0017 — ALREADY-SUPERSEDED
_Notes:_ Create-at-open reversed by 0025; 0079 later re-accepts 'first open authors state' on different grounds.

### ADR 0021 — ALREADY-SUPERSEDED
_Notes:_ Still cited in packages/graph/src/graph-rendering.ts:10 as the definition of the 'overview'.

### ADR 0022 — ALREADY-SUPERSEDED
_Notes:_ 'Selection is emphasis, not filtering' survives via 0026 into CONTEXT; the filter itself is gone (0040).

### ADR 0023 — ALREADY-SUPERSEDED
_Notes:_ 'Presentation must not constrain the domain' restated by 0032.

### ADR 0025 — ALREADY-SUPERSEDED
_Notes:_ Still cited as a rule source in 11 non-ADR files, incl. docs/agents/rendering.md:22 ('Placement is authored ... (ADR 0025, refined by ADR 0079)') and grid.ts:15 which still says editing an automatic view 'converts' it.

### ADR 0026 — ALREADY-SUPERSEDED
_Notes:_ Most-cited superseded ADR in this cluster: ~20 non-ADR files (schema.ts, validate.ts, lookup.ts, navigation.ts, tests) cite it for the first-Graph fallback, which 0040 restates.

### ADR 0031 — ALREADY-SUPERSEDED
_Notes:_ Cited by packages/app/e2e/overview.spec.ts:166.

### ADR 0045 — ALREADY-SUPERSEDED
_Notes:_ Graph id unique across the Space is LIVE in code but its only ADR is this superseded one; the rationale code repeats ('the flatten a space-subject view draws', '<graphId>::out/::in handles') is dead (0079, 0087). Cited in ~15 non-ADR files.

### ADR 0055 — ALREADY-SUPERSEDED
_Notes:_ A test describe block still names it as its authority.

### ADR 0072 — ALREADY-SUPERSEDED
_Notes:_ AGENTS.md headline 'ADR 0069 / ADR 0072 — Entities have durable web addresses' cites it as live.

### ADR 0075 — ALREADY-SUPERSEDED
_Notes:_ No citations outside docs/adr.

## Supersession chains: how many ADRs a reader traverses today

The "full chain" counts every ADR on the path, including superseded ones. "Minimum today" counts the live ADRs a reader must open to recover the current rule, plus the rename ADRs 0085 and 0101 that are needed to translate them.

| Live concept | Full chain | Minimum today | Notes |
|---|---|---|---|
| Map is authored data, and a strategy is behaviour; no render-time strategy | 0002→0005→0013*→0014→0017*→0025*→0031*→0075*→0079→0086 (+0041, 0085, 0101) | **5–7** (0005, 0014, 0079, 0086, plus 0085/0101) | rendering.md sends readers to the superseded 0025 as the rule's source. |
| Which canvas context is selectable and addressable | 0002→0013*→0022*→0025*→0031*→0053*→0055*→0068→0072*→0075*→0079 | **1–3** (0079, plus 0085/0101 for words) | Clean: 0079 supersedes everything before it, so this is the one chain that ends well. |
| Map owns membership and Graphs; Active Graph fallback; deletion rules | 0003→0007→0022*→0026*→0040→0041→0045*→0079 | **4–6** (0040, 0041, 0079, 0085/0101), **plus superseded 0045** | The Space-wide uniqueness of a Graph id is stated only in superseded 0045. Code cites superseded 0026 for the fallback about 20 times. |
| What a Graph may contain (cycles, forks, duplicate Edges) | 0003→0012*→0023*→0032 (+0041) | **3** (0003, 0032, 0041) | 0003's in-body note still says 0012 forbids a revisit. |
| A Space or Map with no Graph, and when presenting is possible | 0015→0040→0079→0080 | **4**, and the current rule is in none of them | "An empty Graph cannot be presented until it has an Edge" is stated in CONTEXT.md and `dock-chrome.ts` only. |
| First load and new-Space completeness | 0017*→0025*→0079→0080 (+0018) | **2** (0079, 0080) | 0079 contains a factual error that 0080 corrects. |
| How an Edge is drawn (anchors, lanes, heads) | 0021*→0033→0045*→0086→0087→0100→0103→0105 | **4–5** (0087, 0100, 0103, 0105; 0033 for the handles) | Each refinement partly overtakes the one before: lanes over the 0087 cost, offset over the 0100 translate, heads over 0100's arrowhead-only rule. |
| Edge Title | 0104 | **1** | |

(* = superseded)

The cluster's longest chain is the canvas-context/Layout–View history: 11 ADRs, 8 of them superseded, all collapsed by 0079. The worst remaining one is **Map/Graph ownership**. A reader needs four or more live ADRs and still has to open a superseded one to find the Graph-id rule.

## Consolidated "Map and Graph" design document: outline

Each line is a live decision in current vocabulary, with its source ADRs and the code or test that holds it. Estimated at about 3,000 words, compared with 13,184 live and 22,032 total source words.

### 1. Maps (about 600 words)
1. A Space holds one or more Maps once it is working. A Map is authored data: Resource membership, position, Open/Closed state and Open Size. (0002, 0014, 0040; `positionedMapSchema` in `packages/core/src/schema.ts`)
2. A Map's position keys **are** its membership. Omission means absent. A position may not name a Resource the Space lacks. (0040, 0013→0025 residue; `validate.ts` `map-member-missing-resource`; `space-intake.test.ts`)
3. Remove from Map removes membership, position and incident Edges in that Map's Graphs, in one Edit. Deleting a Resource cascades this into every Map. (0040; `removed-resource-from-map` / `deleted-resource` in `space-authoring.ts`)
4. The only selectable and addressable canvas context is a Map. The opening selection is `defaultMap`. Choosing a Map is navigation. An Edit in a Map records it as `defaultMap`. (0079; `map-resolution.ts`, `snapshot.ts` writes `defaultMap: mapId`)
5. Add Map creates and selects an empty Map with an empty Active Graph in one Edit. The last Map cannot be deleted (`space-must-keep-map`). (0079)
6. Obsolete canvas identities are invalid input. The document is strict. (0079, 0056; `spaceFileObjectSchema`)

### 2. Space completeness and first load (about 350 words)
7. `newSpace` and `initializeSpace` create Map 1, empty Active Graph 1 and `defaultMap`, with the first Resource centred, persisted atomically. (0080, 0018; `packages/graph/src/new-space.ts`, `new-space.test.ts`)
8. A mapless stored Space gets Map 1/Graph 1 on its first *working* read, committed before it opens. Its Resources are not placed. A Space with Maps but no default records its first Map. Conflict reload accepts a competing initialization. Listing, import, export and reference checks never initialize. (0079, 0080; `packages/persistence/test/working-space.test.ts`, `test/unit/aggregate-round-trip.test.ts`)
9. Newness is never inferred from content, and no creation marker is stored. (0080)

### 3. Graphs (about 600 words)
10. A Graph is a set of directed Edges over one Map's members, owned by exactly one Map and never shared. Two Maps wanting one narrative hold two Graphs. (0040, 0041, 0007)
11. The Graph id is unique across the Space (`duplicate-graph-id`), even though ownership is Map-scoped. **This needs a live source:** today it is only in superseded 0045, with a dead rationale. (0045; `validate.ts:118`)
12. A Map owns a non-empty ordered collection of Graphs. Creation appends, deletion preserves order, and the last Graph cannot go (`map-must-keep-graph`). Deleting the active Graph activates the first survivor. (0040; `space-authoring.ts:1466`)
13. The Active Graph is `activeGraph`, falling back to the first Graph. Intake rejects one that is missing or foreign (`map-active-graph-*`). Activation is navigation, not an Edit. Emphasis is not filtering: every owned Graph is drawn. (0040, 0026*, 0028, 0079; `lookup.ts`, `canvas-projection.test.ts`)
14. Graphs may contain forks, merges, cycles and self-Edges. Graphs are independent and may order the same pair oppositely. No code assumes a global order. (0003, 0032)
15. A duplicate `(from,to)` within one Graph: the gesture is a no-op and intake refuses it (`duplicate-graph-edge`). Imports are not deduplicated. The same pair in two Graphs is two Edges. (0032)
16. Presenting owns traversal. Traversal history is transient and never persisted. An Active Graph with no Edges cannot be presented. (0032, 0041, 0015→CONTEXT; `dock-chrome.ts:366`, `traversal.test.ts`)
17. A Graph has a title, an optional colour (palette rule in `graph-color.ts`) and an optional head shape (see 6). (0041, 0105)

### 4. Edges (about 350 words)
18. An Edge's identity is `(from,to)` within its Graph. Edits find it by endpoints (`sameEdge`). (0032, 0104)
19. The optional one-line Title is never minted, stored trimmed, has no cap, and refuses a line break (`edge-title-one-line`). `titleHidden: true` is allowed only beside a Title, and clearing the Title clears it. The schema is strict. The word is Title, not Label. (0104; `graphEdgeSchema`)
20. There is no per-Edge style. The line's appearance belongs to the Graph. (0104, 0105)
21. A redrawn Edge carries nothing over and is appended. (0104)

### 5. Layout strategies (about 250 words)
22. A LayoutStrategy is behaviour. It populates `x`/`y` on the elements it is given, with no arranged-result type and no ports or sections. (0005, 0014, 0086; `packages/graph/src/layout.ts`, `strategy-contract.test.ts`)
23. Only `positionedStrategy` runs at render. `gridStrategy` is kept as a pure second implementation, and no strategy is privileged. (0086)
24. Auto-arrange, when built, is a destructive, undoable Edit over a Map (LayoutStrategyGraph → Map). Negative: never seed an optimiser to honour a drop point. (0014, 0086, 0013* residue)

### 6. Drawing Edges (about 800 words; could live in rendering.md instead)
25. There are four anchors per Resource, which are the authoring handles. An Edge attaches to the facing sides, decided per frame in the Edge component from React Flow's store. The pure rule reads the gap between rects. Nothing is stored. (0087; `edge-attachment.ts` `facingSides`, `edge-attachment.test.ts`)
26. Anchors always render (never `display:none`). Geometry is declared and never re-measured. A self-Edge takes a fixed loop first. There is no per-Graph port family. (0087, 0033)
27. Edges sharing a pair are drawn in lanes 8 units apart. The Active Graph's Edges are centred and connect. Others sit below/right in Graph order and stop short by 20%, trimmed in geometry. There is no fanning. Lanes are assigned in the projection (`graphLanes`). The Active Graph is painted last. (0100; `edge-lanes.ts`, `edge-lanes.test.ts`)
28. A lane is the normal offset of the curve over one span per pair, with cubic bridges to the anchors, falling back to a translate when there is no span. (0103; `laneBezier`)
29. Head shapes are arrow/vee/dot/diamond, with arrow the default. Every drawn Edge ends in its Graph's head shape. There is one shared `<defs>` marker per Graph. Legend marks are miniature Edges. (0105; `graphHeadShape`, `GraphHeadMarkers`, `GraphLegendMark`)

### 7. Vocabulary guard (about 100 words)
30. Route, Walk, Layout (as the entity), Diagram, Thing, Card, and Computed/Space/Algorithmic View are retired. `LayoutStrategy*` and `GraphRender*` are the qualified intermediates. Lowercase "route" is used only for HTTP routes or edge routing. (0041, 0079, 0085, 0101; `test/unit/current-domain-vocabulary.test.ts`)

Material deliberately excluded: every rename table, roll-forward plan, ticket build list, rejected-alternative argument, and the Algorithmic View/conversion history. That history stays in the ADRs as an archive.

## Contradictions and drift

1. **A live rule rests only on a superseded ADR.** The Space-wide uniqueness of a Graph id (`duplicate-graph-id` across Maps, `validate.ts:118`, `schema.ts:372`) is decided only in 0045, which 0079 superseded wholesale. 0040, which is live, says the opposite ("Route identity is scoped to the owning Layout"). The rationale the code repeats is dead: "the flatten a space-subject view draws" (removed by 0079) and "`<graphId>::out`/`::in` handles" (removed by 0087). See `space-intake.test.ts:545`.
2. **0087 contradicts current guidance on the facing rule.** 0087 says the rule "divides by the vector between two centres". `docs/agents/rendering.md` says it "reads the gap between the rects, not the vector between their centres". The code (`edge-attachment.ts` `facingSides`) follows rendering.md, by that doc's account. I did not read the function body.
3. **0003's own correction is wrong.** Its parenthetical says 0012 means "a route now visits each card at most once". 0012 was superseded by 0023 and then 0032, which make cycles legal.
4. **0079 is factually wrong about new Spaces** ("still begins with one Card centered in an authored Layout"). 0080 corrects it, but 0079 carries no in-body pointer. Its status block only lists 0080 as a refiner.
5. **0104's reconnect clause is stale.** It says `reconnected-edge` "stays live" until issue 05. A grep finds no `reconnected-edge` in `packages/`, and AGENTS.md says reconnection went.
6. **0100's arrowhead rule is overtaken by 0105.** 0100 says only the connecting Edge has an arrowhead. 0105 says every drawn Edge has one. README reflects this, but the 0100 body does not.
7. **0015's "Present disabled when there are no routes" no longer describes the gate.** The code gate is `activeGraph.edges.length === 0` (`dock-chrome.ts:366`), and no working Map can have zero Graphs (0040/0079).
8. **0041's canonical document example uses `layouts`.** The schema uses `maps` (renamed in 0085/0101). Component names like `GraphEmphasis` (0 hits) and `graphEntryCards` (now `graphEntryResources`) have moved on.
9. **CONTEXT.md drift.** "Layout strategy … two of the three that ship read no Map at all". After 0086 two ship (`gridStrategy`, `positionedStrategy`), and only one reads no Map.
10. **Code comments assert superseded behaviour.**
    - `packages/graph/src/grid.ts:15`: "editing one is legal and **converts** it … (ADR 0025)". Conversion was removed by 0075 and then 0079.
    - `packages/graph/src/placement.ts:162`: "conversion copies every resource already on screen (ADR 0025)".
    - `packages/graph/src/graph-rendering.ts:10`: defines the "overview" by ADR 0021, which is superseded.

### Superseded ADRs still cited as live outside docs/adr
- **0026** in about 20 files: `packages/core/src/schema.ts:393`, `graph/src/validate.ts:208`, `graph/src/lookup.ts:25`, `graph/src/traversal.ts:45`, `app/src/navigation.ts:357`, `app/src/compose-app.ts:167`, `build-space-resource-rail.tsx:70`, `persistence/src/space-resource-planning.ts:197`, `test/support/repository-contract.ts:1305`, `graph/test/space-intake.test.ts:482` (a describe title), `app/ladle-e2e/graph-hud.spec.ts:23`, and several app tests. All of these should cite 0040.
- **0045** in about 15 files: `canvas-projection.ts:69`, `navigation.ts:159`, `snapshot.ts:45`, `space-authoring.ts:863,1111`, `schema.ts:372`, `lookup.ts:8`, `graph/src/space.ts:297`, `validate.ts:119`, tests, and `docs/agents/rendering.md`.
- **0025** in 11 files, including `docs/agents/rendering.md:22` (given as the source of "Placement is authored"), `schema.ts:361,405`, `types.ts:64`, `grid.ts`, `placement.ts`, `positioned.ts`, `space.ts`, `validate.ts:8,150`.
- **0055**: `test/unit/current-domain-vocabulary.test.ts:476,551` names its describe block for it, and `space-intake.test.ts:671` cites it too.
- **0072**: `AGENTS.md:29` headline "ADR 0069 / ADR 0072 — Entities have durable web addresses".
- **0031**: `packages/app/e2e/overview.spec.ts:166`.
- **0021**: `packages/graph/src/graph-rendering.ts:10`.
