# Map and Graph pilot: rule-to-source inventory

Ticket: `.scratch/adr-consolidation/issues/01-prove-map-graph-pilot.md`, checklist items 1 and 2.
This inventory is the input to the specimen contract. It is non-normative. It restates accepted decisions, and it decides nothing.

## Snapshot

- Commit: `e836ecab07d339425320513d52c9ccb39b158db4` (branch `adr-consolidation-pilot`, worktree clean)
- Date: 2026-10-03
- On 2026-10-03 the main checkout held uncommitted edits to `CONTEXT.md` and `docs/adr/README.md`, plus then-untracked ADRs 0112 and 0113. None of these is in this snapshot, and none was read.
- Code locators below are as of `e836ecab`. R10, R12, R25 and R27 carry a later note where `main` at `9cb40e16` (after PRs #332 and #336) changed what they describe; D21 records the disagreement that change opened.

## Scope

In scope:
- authored Map versus automatic arrangement
- listing versus first working load of a mapless Space
- empty Map creation with an Active Graph
- explicit Resource membership in a Map, and removal
- one-axis displacement
- memoryless Close
- the surviving reason for rejecting an intermediate Arrangement type

Also in scope where they bind those topics: Map ownership of Graphs, the default Map and last-Map deletion, and the Active Graph.

Out of pilot scope, listed only so the omission is visible:
- Edge geometry: anchors, facing side, lanes, lane offset, head shapes and Edge Titles (ADRs 0033, 0087, 0090, 0100, 0103, 0104, 0105, 0110).
- What a Graph may contain: independent orders, cycles, duplicate Edges (ADRs 0003, 0007, 0012, 0023, 0032).
- Space Resource selection and framing detail (ADRs 0068, 0074, 0076, 0091), except where a Map or Graph deletion binds it.

## Sources read

- **ADR catalogue:** `docs/adr/README.md`.
- **Live ADRs:** 0002, 0003, 0004, 0005, 0007, 0014, 0015, 0018, 0028, 0038, 0040, 0041, 0064, 0066, 0079, 0080, 0084, 0086, 0089 (placement lines), 0091, 0093, 0101, and 0085 (headings and status block).
- **Superseded ADRs** (`docs/adr/superseded/`): 0012, 0013, 0017, 0022, 0025, 0026, 0031, 0045, 0075.
- **Undo search:** `grep` for "undo" across `docs/adr`. This surfaced 0048 and 0074; only their undo lines were read.
- **`CONTEXT.md`:** Space, Graph, Edge, Active Graph, Authoring, Edit, Map, Placement, Layout strategy, Resources View, Opening.
- **`AGENTS.md`:** the entries for ADRs 0079, 0064, 0066 and 0084, and the Hard rules note on elkjs.
- **`docs/agents/editing-and-persistence.md`:** "The Map/Graph model" and Space Authoring's completed-edit lifecycle (Map resolution).
- **`docs/agents/rendering.md`:**
  - lines 17 and 19–23 (resizing, and "The strategy contract and Placement")
  - line 56 (multi-Graph rendering)
- **Prior audit:** `.scratch/adr-consolidation/research/map-graph.md`. It is dated and was used only as a lead, and its claims are attributed below where they were rechecked.
- **Code checked:**
  - `packages/graph/src/`: `layout.ts`, `grid.ts`, `new-space.ts`, `placement.ts`, `snapshot-edits.ts`, `validate.ts`
  - `packages/core/src/schema.ts`
  - `packages/persistence/src/working-space.ts`
  - `packages/persistence/src/session-registry.ts` (`deleteMap`, `deleteGraph`)
  - `packages/http/src/index.ts` (the collection and single-Space GETs)
  - `packages/app/src/`: `map-resolution.ts`, `space-authoring.ts`, `snapshot.ts`, `placement-rendering.ts`, `dock-chrome.ts`, `components/DeleteConfirmation.tsx`
  - `eslint.config.js` (the elkjs zone)
- **Tests read by name:**
  - `packages/persistence/test/working-space.test.ts`
  - `test/unit/aggregate-round-trip.test.ts` ("a mapless Space")
  - `packages/graph/test/placement.test.ts`
  - `packages/graph/test/snapshot-edits.property.test.ts`

### Prior-audit claims rechecked against this snapshot

The audit's drift findings below no longer hold at this snapshot:
- **Its contradiction 1**, that Graph-id uniqueness rested only on superseded 0045: ADR 0108 now restates it.
- **Its contradiction 2**, about the facing rule: ADR 0110 now states it. This is out of pilot scope.
- **Its drift 9**, that CONTEXT counted three strategies: CONTEXT now says "Two exist".
- **Its drift 10**, about the `grid.ts` "converts" comment: the comment no longer says that.
- **Its claim that `rendering.md:22` cites superseded 0025**: the line now cites ADR 0014 and ADR 0079.

The audit's per-ADR live-decision lists were used only to cross-check this inventory for omissions.

## Build-status convention

- **Built:** behaviour verified in the named file, test or both.
- **Accepted-but-unbuilt:** decided in an accepted ADR, with no implementation found. The delivery issue is linked, or "none found" is stated.
- Code shows build status only. It never retires an accepted decision.

---

## Live rules

### A. Authored Map versus automatic arrangement

**R1. A Map is authored data and a layout strategy is behaviour.**
- **Statement:** A Map is authored data: its Resource membership, positions, Open/Closed state, Open Sizes and owned Graphs. A layout strategy is the behaviour that arranges Resources.
- **Sources:**
  - ADR 0014, paragraphs 1–2
  - ADR 0040, paragraph 1
  - ADR 0101, "The four nouns" (vocabulary)
  - CONTEXT "Map" and "Layout strategy"
  - `docs/agents/editing-and-persistence.md`, the Map/Graph model, bullet 3
- **Reason:** One word naming both hid the asymmetry. Every Map has a strategy that draws it, but not every strategy has a Map behind it (0014).
- **Negatives:**
  - Do not collapse the two back together.
  - Do not name the Map a layout, or use prefixes such as `AuthoredLayout`, `SpaceLayout` or `StoredLayout` (0014, rejected).
  - "Layout" survives only in `LayoutStrategy*`.
- **Status:** Built. Evidence: `positionedMapSchema` in `packages/core/src/schema.ts` and the contract in `packages/graph/src/layout.ts`.

**R2. Only the positioned strategy runs while drawing.**
- **Statement:** The positioned strategy is the only one that runs while the canvas is drawn. It reads the selected Map and answers the strategy graph to draw.
- **Sources:**
  - ADR 0086, paragraph 1 and "Nothing can reach it"
  - ADR 0079, paragraph 2
  - CONTEXT "Layout strategy", paragraph 3
- **Reason:** A strategy that runs at render computes an arrangement nobody authored and nothing persists. That is the computed-at-render placement 0014 exists to separate from authorship (0086).
- **Negatives:**
  - No automatic strategy draws the canvas.
  - Nothing computes placement at render in place of authorship (0084, "Authored positions may now be written").
- **Status:** Built. `positionedStrategy` is constructed in `packages/app/src/placement-rendering.ts:41`, which is the only application consumer. The other constructor is the Ladle support file `packages/app/stories/support/ReactFlowCanvas.tsx`.

**R3. Automatic strategies are capabilities, and none is privileged.**
- **Statement:** Automatic strategies are non-addressable application capabilities. `gridStrategy` is the one that exists. It is pure and deliberately kept unused so the contract has one implementation on each side. No strategy is privileged.
- **Sources:**
  - ADR 0086, paragraph 1 and "What survives"
  - ADR 0079, paragraph 2
  - ADR 0014
  - CONTEXT "Layout strategy", paragraphs 3–4
  - `rendering.md:21–22`
- **Reason:** A pure, dependency-free function in the package where Auto-arrange will live costs nothing, and it keeps `LayoutStrategy` honest (0086).
- **Negatives:**
  - The grid is "not the arrangement that returns".
  - No engine is what "layout" means.
  - If a change only works for one implementation, the seam has leaked (`rendering.md`).
- **Status:** Built. `gridStrategy` is imported only by tests: `packages/graph/test/layout.test.ts` and `packages/react-flow-adapter/test/strategy-contract.test.ts`.

**R4. The strategy contract carries positions only.**
- **Statement:** Each `LayoutStrategyResource` carries optional `x`/`y`, with no port collection. A `LayoutStrategyEdge` carries only its endpoints, with no routed sections.
- **Sources:**
  - ADR 0086, "Routing output can never be persisted" and "What this deletes" (ticket 02)
  - `rendering.md:21`
  - `editing-and-persistence.md`, Map/Graph bullet 3
- **Reason:** A Map stores a Resource and its position and nothing else. Routed geometry therefore has nowhere to land, either at render or in a future Auto-arrange (0086).
- **Negatives:** Do not add ports, edge sections or waypoints to the contract.
- **Status:** Built. Evidence: the interfaces in `packages/graph/src/layout.ts`. The contract is uniformly async (`layout.ts` doc). That is an implementation constraint, not a decision.

**R5. There is no intermediate arranged-result (Arrangement) type.**
- **Statement:** A strategy takes a `LayoutStrategyGraph` and returns the same shape with geometry populated.
- **Sources:**
  - ADR 0005, paragraph 3. 0014's "costs accepted" paragraph keeps this explicitly binding: "its actual decision — no `Arrangement` type, geometry as optional fields on the elements — is untouched and still binding".
  - ADR 0041, "Domain and module interfaces", last sentence of paragraph 3: "does not add an intermediate arrangement type or a new seam"
  - CONTEXT "Placement" and "Layout strategy", _Avoid_: arrangement
  - `editing-and-persistence.md`, Map/Graph bullet 3: "don't introduce one"
  - `AGENTS.md`, Conventions ("arrangement" is reserved for prose)
- **Reason:** See A1.
- **Negatives:**
  - "Arrangement" is not a domain entity.
  - Applying a strategy produces no separate entity.
- **Status:** Built. Evidence: the `layout.ts` doc comment and types.

**R6. Auto-arrange is a destructive Edit over an existing Map.**
- **Statement:** An automatic arrangement (Auto-arrange) is a destructive authoring operation the author invokes explicitly, by a named tool, over an existing Map. It rewrites that Map's positions in one Edit. The positions it writes have authored standing once the Edit completes.
- **Sources:**
  - ADR 0086, paragraph 2 and "A removal, not a prohibition"
  - ADR 0014, paragraph 2 (strategy graph → Map is the opposite direction to positioned Map → strategy graph)
  - ADR 0084, "Authored positions may now be written by the application"
  - CONTEXT "Layout strategy", paragraph 3
  - `AGENTS.md`, intro and Hard rules note
- **Reason:** The render path is the wrong place to run an algorithm, not the algorithm itself (0086). The destructive form is a global rearrangement the author asked for, which is why it escapes the drop-point finding in R7.
- **Negatives:**
  - It is not a second kind of canvas.
  - It is not a selectable or addressable context.
  - It is not decided by the renderer.
  - It is not incremental placement.
  - It does not create a new Map; it works "over an existing" one.
- **Status:** Accepted-but-unbuilt.
  - No Auto-arrange exists in `packages/` or `src/`. The only hit is the doc comment at `packages/graph/src/layout.ts:52`.
  - Delivery issue: none found. `.scratch/positioned-layout/issues/05-auto-arrange.md`, 14 and 15 are resolved tickets from the superseded computed-view model.
  - It will live in `graph` (0086: the package "where Auto-arrange will live"). See D13.
  - It is one atomic Edit; undo is a future feature (D12, resolved).

**R7. An engine may return, but only attached to an Edit.**
- **Statement:** A graph-layout engine may return, attached to an Edit. Never seed or constrain an optimiser to honour a drop point.
- **Sources:**
  - ADR 0086, "A removal, not a prohibition"
  - Originally superseded ADR 0013, preserved by superseded 0025, "The negative 0013 carried"
- **Reason:** Three spike increments each reshuffled the existing Resources by global optimisation and placed the new one arbitrarily. The failure is structural, not a matter of tuning. The write-up is `.scratch/graph-editing/`.
- **Negatives:**
  - No incremental, drop-point-honouring engine placement.
  - elkjs is not in any package today. Re-adding it is "a line and a lockfile" when Auto-arrange is built.
- **Status:** Negative, which holds. elkjs is a dependency of no package. `eslint.config.js:8–13` keeps a render-time ban and disclaims ruling on where a returning engine lives.

### B. Canvas context, default Map and Map lifecycle

**R8. A Map is the only canvas context.**
- **Statement:** An authored Map is the only selectable and addressable canvas context. The canvas shows the selected Map and only the Graphs that Map owns.
- **Sources:**
  - ADR 0079, paragraphs 1–2
  - ADR 0069 with 0079 (Map URL `/spaces/:spaceId/maps/:mapId`)
  - `AGENTS.md`, ADR 0079 entry
  - `editing-and-persistence.md`, Map/Graph bullet 2
- **Reason:** Keeping Computed Views dormant would preserve most of the complexity being removed (0079). See A4.
- **Negatives:**
  - There is no Computed View or Space View, and no flatten of Graphs across Maps.
  - Obsolete canvas identities are invalid input, and their product URLs are not found.
  - There is no hidden compatibility machinery.
- **Status:** Built. Evidence: `resolveMap` and `MapNotFoundError` in `packages/app/src/map-resolution.ts`, and the single-member `discriminatedUnion('kind', [positionedMapSchema])` in `schema.ts:420`.

**R9. A working Space always has a durable default Map.**
- **Statement:** A Space's persisted opening selection is `defaultMap`, and a working Space always has a durable one.
- **Sources:**
  - ADR 0079, paragraphs 1 and 5
  - CONTEXT "Map" ("A working Space always has at least one Map")
- **Status:** Built. `requireDefaultMap` throws when a working Space lacks one (`map-resolution.ts:28`).

**R10. Choosing a Map is navigation.**
- **Statement:** Choosing a Map is navigation, not an Edit. A Space opens on the Map most recently edited in. Selecting a Map is navigation and saves nothing; every Edit in a Map records it as `defaultMap`, Add Map included, and writes the Map's resolved `activeGraph` explicitly.
- **Sources:**
  - ADR 0079, paragraph 5 ("may record it")
  - ADR 0028, first two paragraphs (the write side for the active Graph; refined by 0040 and 0041)
  - CONTEXT "Active Graph", paragraph 2
  - `editing-and-persistence.md`, Map/Graph bullet 2
- **Negatives:** Selecting a Map does not dirty or submit anything.
- **Status:** Built. `updatePositionedMap` in `packages/app/src/snapshot.ts:91–113` writes `defaultMap: mapId` on every Map-writing Edit, and writes `activeGraph` when one is named. The code always records where 0079 says "may"; the user confirmed "always" as the rule (D16). *On `9cb40e16`:* only an Edit through the canvas's Map records it; see D21.

**R11. Add Map creates and selects an empty Map in one Edit.**
- **Statement:** Add Map creates and selects an empty Map, with no Resource members, owning exactly one empty Graph that is its Active Graph. Existing Resources stay outside the new Map until an author adds them, for example from the Resources View.
- **Sources:**
  - ADR 0079, paragraph 5
  - ADR 0040, paragraph 3 ("Creating a Layout creates its initial empty active Route in the same Edit")
  - ADR 0041, paragraph 3 (invariants)
  - CONTEXT "Graph", paragraph 4
- **Negatives:**
  - No Map is ever without a Graph.
  - Existing Resources are not copied in.
- **Status:** Built. The `'created-map'` branch in `packages/app/src/space-authoring.ts:993–1027`:
  - `positions: {}`
  - `newGraph(graphId, 'Graph 1', [])`, made active
  - `defaultMap: mapId`, with `nextMapId: mapId` selecting it

**R12. The last Map cannot be deleted.**
- **Statement:** The last Map of a Space cannot be deleted.
- **Sources:** ADR 0079, paragraph 5 ("A working Space always has a durable default Layout, so its last Layout cannot be deleted").
- **Reason:** The working Space must keep a durable default.
- **Status:** Built. The refusal is `space-must-keep-map` (`space-authoring.ts:1033`). *On `9cb40e16`:* PR #336 removed the code and the `deleted-map` completion; Delete Map is not offered while one Map remains (`map-authoring-commands.ts`), and `planContextDeletion` (`packages/persistence/src/space-resource-planning.ts`) answers `unchanged` when no survivor exists, choosing the shown Map, else the stored default, else the first. Deleting the default Map re-points `defaultMap` to a survivor: the selected one if it survives, otherwise the first (`space-authoring.ts:1036–1049`). The choice of survivor is code-level treatment with no ADR; see G5.

**R13. Deleting a Map or Graph relocates the Space Resources that select it.**
- **Statement:** Deleting a Map or Graph atomically relocates every Space Resource that selected it, rather than leaving a dangling selection.
- **Sources:**
  - ADR 0091
  - `editing-and-persistence.md`, Space Resource lifecycle bullet
- **Status:** Built. Evidence: `deleteMap`/`deleteGraph` in `packages/persistence/src/session-registry.ts:164–167, 703–704`. Framing detail is out of pilot scope.

### C. Space completeness and first working load

**R14. Every new Space is created complete.**
- **Statement:** Every path that creates a new Space creates it complete: `Map 1` with an empty Active `Graph 1`, recorded as `defaultMap`, with the first Resource placed. It is persisted atomically, so it never enters repair.
- **Sources:**
  - ADR 0080, paragraph 1
  - ADR 0018 (one Resource, not an empty canvas)
  - CONTEXT "Space", "A new space"
- **Status:** Built. Evidence: `initializeSpace` and `newSpace` in `packages/graph/src/new-space.ts`.

**R15. A stored or imported Space may have no Map.**
- **Statement:** A stored or imported Space may have no Map, and therefore no Graph. That is valid stored state.
- **Sources:**
  - ADR 0079, paragraph 3
  - ADR 0041, "The first-public document" (`maps` optional, then spelled `layouts`)
  - ADR 0015 (residue)
  - CONTEXT "Graph" ("A Space with no Map has no Graphs")
- **Status:** Built. Evidence:
  - `maps` and `defaultMap` are optional in `schema.ts:478–480`.
  - The "a mapless Space" round trip in `test/unit/aggregate-round-trip.test.ts:384`.
  - `AGENTS.md`'s 0079 entry: only a mapless **Meta** Space can appear in a valid aggregate.

**R16. First working load initializes a mapless Space.**
- **Statement:** The first complete working-state read of a mapless stored Space atomically persists an empty `Map 1`, its empty Active `Graph 1` and `defaultMap` before returning. The Space's existing Resources are not placed.
- **Sources:**
  - ADR 0079, paragraph 3
  - ADR 0080, paragraph 2
  - `editing-and-persistence.md`, Map/Graph bullet 1
- **Reason** for not placing: the repository has no authored basis for guessing their positions (0080).
- **Negatives:**
  - Existing Resources stay outside the new Map, reachable through the Resources View.
  - No layout strategy seeds their positions.
- **Status:** Built. Evidence: `initializedSnapshot` in `packages/persistence/src/working-space.ts` (`positions: {}`), and the test "persists an empty default Map before returning a mapless stored Space".

**R17. A Space with Maps but no default records its first Map.**
- **Statement:** A stored Space that has Maps but no default records its first Map, in authored order, as the default, and creates nothing.
- **Sources:**
  - ADR 0079, paragraph 3
  - ADR 0080, paragraph 2
- **Status:** Built. Evidence: `working-space.ts` and the test "adopts the first existing Map without creating another Map or Graph".

**R18. One server-side boundary initializes; reads that only list or export do not.**
- **Statement:** One server-side first-working-load boundary serves:
  - direct opening
  - Entering
  - rendering an open Space Resource
  - making a link target working

  Listing, import completion, export and reference validation read stored state and never initialize.
- **Sources:**
  - ADR 0079, paragraphs 3–4
  - ADR 0080, paragraph 3
  - `AGENTS.md`, 0079 entry (link makes the target working first)
- **Status:** Built. Evidence:
  - The single-Space `GET` uses `createWorkingSpaceLoader` (`packages/http/src/index.ts:453, 576`).
  - The collection `GET` answers `repository.listSpaces()` (line 458).
  - Link targets go through `loadWorkingSpace` (`packages/persistence/src/session-registry.ts:600–650`).
  - The test "round-trips unchanged, initialized by neither export nor import" (`aggregate-round-trip.test.ts`).

**R19. Initialization commits before the Space becomes working.**
- **Statement:** Initialization commits before the Space becomes working state. A conflict reloads the stored Space and accepts a competing initialization; otherwise the normal retry follows. Any other commit failure prevents the Space from opening.
- **Sources:**
  - ADR 0079, paragraph 4
  - ADR 0080, paragraph 3
- **Status:** Built. Evidence: the loop in `working-space.ts`, and the tests "accepts a concurrently initialized winner…" and "retries initialization after an unrelated mapless edit wins the conflict". The loader also returns an invalid stored snapshot unrepaired, so intake reports it. That is implementation, not decision.

**R20. Newness is never inferred.**
- **Statement:** Newness is never inferred from Resource count, and no creation marker is stored.
- **Sources:** ADR 0080, paragraph 4.
- **Reason:** Content is not provenance. A one-Resource import is still an import, and the creation boundary already knows when it is constructing a Space.
- **Status:** Negative, which holds. No marker exists in `schema.ts`.

**R21. Import does not rewrite its source Markdown.**
- **Statement:** Import does not rewrite its source Markdown. Export is the crossing back to repository files.
- **Sources:**
  - ADR 0079, paragraph 3
  - CONTEXT "Importing"
- **Status:** Built (CONTEXT; not separately rechecked in code).

### D. Map ownership of Graphs and the Active Graph

**R22. A Map owns a non-empty ordered collection of Graphs.**
- **Statement:** A Map owns a non-empty ordered collection of Graphs. Every Graph belongs to exactly one Map and is authored only through it. Graphs are never shared: two Maps that need the same narrative hold two Graphs.
- **Sources:**
  - ADR 0040, paragraphs 1 and 3, and "Why ownership follows authoring"
  - ADR 0041, paragraph 3
  - CONTEXT "Graph"
- **Reason:** With a shared Graph, removing a Resource from one Map would either leave an Edge with an absent endpoint or change every other Map. Ownership makes each edit local. See A10.
- **Negatives:**
  - There is no Space-level Graph collection.
  - A Map does not filter Graphs.
  - A Map with no Graph is invalid.
- **Status:** Built. `graphs: z.array(graphSchema).min(1)` (`schema.ts:390`), and there is no Space-level `graphs` key.

**R23. Every Edge is closed over its Map's members.**
- **Statement:** Every Edge endpoint names a member of the owning Map. Intake checks both levels: every member names a Space Resource, and every Edge endpoint names a member.
- **Sources:** ADR 0040, Consequences.
- **Status:** Built. Refusals `map-member-missing-resource`, `graph-edge-missing-resource` and `graph-edge-resource-outside-map` (`packages/graph/src/validate.ts:32–45`).

**R24. A Graph id is unique across its Space.**
- **Statement:** A Graph id is unique across its Space, although exactly one Map owns the Graph.
- **Sources:** ADR 0108.
- **Reason:** Lookup, the Graph URL and render keys all resolve a Graph without a Map.
- **Negatives:** No `(map, graph)` pair lookups.
- **Status:** Built. Refusal `duplicate-graph-id` (`validate.ts`).

**R25. Graph order is authored.**
- **Statement:** Creation appends a Graph, and deletion preserves the order of the survivors. Manual reordering is a separate operation.
- **Sources:**
  - ADR 0040, Consequences
  - CONTEXT "Graph", paragraph 3
- **Status:** Built for append and delete (`space-authoring.ts`). Reordering was not checked. *On `9cb40e16`:* deletion is `planContextDeletion` in `space-resource-planning.ts`, which keeps survivors' order.

**R26. Add Graph appends and activates in one Edit.**
- **Statement:** Add Graph appends a new empty Graph to the Map and makes it active, in one Edit.
- **Sources:**
  - ADR 0040, paragraph 3
  - CONTEXT "Interaction draft" (Add Graph completes before its title field opens)
- **Status:** Built. The `'added-graph'` branch in `space-authoring.ts:1451–1465`.

**R27. The last Graph cannot be deleted.**
- **Statement:** The last Graph of a Map cannot be deleted. Deleting the Active Graph makes the first survivor, in authored order, active.
- **Sources:**
  - ADR 0040, paragraph 3
  - ADR 0041, paragraph 3
  - CONTEXT "Graph"
- **Status:** Built. Refusal `map-must-keep-graph` and `survivors[0]` (`space-authoring.ts:1502–1511`). *On `9cb40e16`:* PR #336 removed the code and the `deleted-graph` completion; Delete Graph is not offered while the Map has one Graph (`graph-authoring-commands.ts`), and `planContextDeletion` answers `unchanged` when no survivor exists. Deleting the Active Graph still activates the first survivor.

**R28. A Map may name its opening Graph.**
- **Statement:** A Map may name `activeGraph`; otherwise its first Graph is active. Intake rejects an `activeGraph` that is dangling or that names another Map's Graph.
- **Sources:**
  - ADR 0040, paragraph 3
  - ADR 0041, "The first-public document"
  - ADR 0028 (the fallback is a read, never a write)
  - CONTEXT "Active Graph"
- **Status:** Built. Refusals `map-active-graph-missing` and `map-active-graph-outside-map` (`validate.ts:214–226`).

**R29. Activating a Graph emphasises it and is navigation.**
- **Statement:** The Active Graph is the one Graph drawn emphasised in the current Map, and the one new Edges join. Activating a Graph is navigation, not an Edit, and is never a side effect of drawing or reading. Every Graph the Map owns is still drawn: activation is emphasis, not filtering.
- **Sources:**
  - ADR 0028
  - ADR 0041, "Authoring, navigation and rendering"
  - ADR 0079, paragraph 2
  - CONTEXT "Active Graph"
  - `rendering.md:56`
- **Reason:** Activation is reading. It changes no Resource, Graph or Edge (0028, whose original conversion-based argument is dead).
- **Accepted cost:** An activation is not durable until a later Edit in that Map records it (0028).
- **Negatives:**
  - Activation does not submit.
  - There is no second "selected Graph" concept.
- **Status:** Built. Evidence: `activateGraph` in `packages/app/src/navigation.ts`, and `editing-and-persistence.md` ("Graph activation is not an edit and does not submit").

**R30. An empty Graph cannot be presented until it has an Edge.**
- **Statement:** An empty Graph is valid and may be active, but it cannot be presented until it has an Edge.
- **Sources:**
  - CONTEXT "Graph", paragraph 4
  - ADR 0015 states the older form ("no routes → cannot present").
- **Status:** Built. `presentDisabled … activeGraph.edges.length === 0` (`packages/app/src/dock-chrome.ts:390`). This is a source gap; see G2.

### E. Explicit membership and removal

**R31. Membership and position are one authored fact.**
- **Statement:** A Map's membership is its position keys, so membership and position are one authored fact. Omission means the Resource is absent and not drawn there; it never means the origin. A position may not name a Resource the Space does not have.
- **Sources:**
  - ADR 0040, paragraph 2 and Consequences
  - ADR 0004 (no placement layer)
  - CONTEXT "Map" and "Placement"
  - `rendering.md:23`
- **Negatives:**
  - No deterministic placement for omitted Resources: 0040 retires it, and 0013's grid past the bounding box is gone.
  - The canvas never manufactures a position.
  - Positions are not stored on the Resource.
  - No entity sits between a Resource and its position, and a Map holds at most one position per Resource.
- **Status:** Built. Evidence: `mapResources`/`resourcesOutsideMap` in `map-resolution.ts`, and `map-member-missing-resource`.

**R32. Placement belongs to the Map, not the Resource.**
- **Statement:** Membership, position, Open/Closed state and Open Size are properties of the Map, never of the Resource. The same Resource may be absent from one Map and placed differently in others.
- **Sources:**
  - CONTEXT "Map"
  - ADR 0040
  - ADR 0064, paragraph 2
  - ADR 0066
- **Status:** Built (schema position entries).

**R33. Add to Map adds a Resource Closed and detached.**
- **Statement:** Add to Map adds an existing Resource with an initial position. The Resource arrives Closed and with no Edges; earlier Edges are never inferred back.
- **Sources:**
  - ADR 0040, paragraph 2 ("writes membership and an initial position")
  - CONTEXT "Placement", paragraph 3
- **Status:** Built. `SnapshotEdit.addToMap` (`packages/graph/src/snapshot-edits.ts:510–544`). The "Closed, no Edges" detail is stated only in code; see G4.

**R34. Remove from Map removes membership and incident Edges in one Edit.**
- **Statement:** Remove from Map removes the Resource's membership and position, and every incident Edge in that Map's Graphs, in one Edit. Graphs that become empty remain. The Resource stays in the Space and in every other Map.
- **Sources:**
  - ADR 0040, paragraph 2
  - CONTEXT "Graph", paragraph 5, and "Placement"
- **Negatives:**
  - Removal does not delete the Resource.
  - It does not affect other Maps.
  - It does not delete emptied Graphs.
- **Status:** Built. `SnapshotEdit.removeFromMap` with `withoutIncidentEdges` (`snapshot-edits.ts:548–574`).

**R35. Removing or deleting an Open Resource gives back its room.**
- **Statement:** Removing an Open Resource from a Map, or deleting it from the Space, Closes it in the same Edit and then removes it: Close's reclaim gives back the room it held, by the memoryless rule, before its position and Edges go. Removing a Closed Resource moves nothing. Removal itself never displaces; only Open, Close and Resize do.
- **Sources:**
  - CONTEXT "Placement", paragraph 3 ("giving back the room it held if it was Open")
  - ADR 0084 (Close's reclaim), applied by the Edit that removes; confirmed by the user as a live rule, see G1.
- **Status:** Built. Evidence:
  - `Placement.reclaim` (`packages/graph/src/placement.ts:415–421`)
  - `removedFrom` (`snapshot-edits.ts:192`)
  - The test "gives back the room an Open Resource held…" (`snapshot-edits.property.test.ts:1049`)

**R36. Deleting a Resource cascades through every Map.**
- **Statement:** Deleting a Resource from the Space performs Remove from Map's cascade in every Map.
- **Sources:** ADR 0040, paragraph 3.
- **Status:** Built. `SnapshotEdit.deleteFromSpace` (`snapshot-edits.ts:211–243`), with the test at `:1066`. The code also refuses deletion while Reference Resources target the Resource (`resource-has-references`). That precondition belongs to Resource context and is out of pilot scope.

### F. Open/Close displacement

**R37. Open and Closed are authored on the Map.**
- **Statement:** Open/Closed state and Open Size are authored on the Map. Opening, closing and resizing are Edits, and they survive reload and export.
- **Sources:**
  - ADR 0064, paragraph 2
  - ADR 0066
  - CONTEXT "Opening", paragraph 2, and "Authoring"
- **Status:** Built. `SnapshotEdit.open`, `close` and `resize` (`snapshot-edits.ts:431–508`). `AGENTS.md` marks 0064 "being built" overall, but its pilot-scope parts were verified built.

**R38. Displacement is applied by the Edit that causes it.**
- **Statement:**
  - Open moves the Resources it grows past, once, and writes their new positions into the Map.
  - Close applies the negation.
  - Resize applies the difference.
  - Between those Edits a drawn position is an authored one.
- **Sources:**
  - ADR 0084, paragraphs 1–2 and "The transform, stated once"
  - `AGENTS.md`, 0084 entry
  - CONTEXT "Placement", paragraph 4
  - `rendering.md:17`
- **Reason:** Displacement derived at render had three linked defects (0084, "Why the derived version had to go"):
  - every Open Resource's size became an input to every other position;
  - a strict comparison created discontinuous jumps (a measured 454-unit jump);
  - drawn ≠ authored forced an inverse that is not total.
- **Negatives:**
  - Nothing is derived at render, and there is no conversion at a drop site.
  - A settled drag lands exactly where it was dropped.
  - There is no `move` draft.
  - A resize preview shows only the resizing Resource's own rect; its neighbours do not move until the Edit lands.
  - `Placement.drawn` and `Placement.authoredPoint` are deleted and must not return.
- **Status:** Built. Evidence: `snapshot-edits.ts`, `placement.ts`, and the absence of `drawn`/`authoredPoint` from the `Placement` export (`placement.ts:423–436`).

**R39. Growth is floored at zero per axis.**
- **Statement:** Growth is Open Size minus the fixed Closed (collapsed) Size, floored at zero on each axis.
- **Sources:**
  - ADR 0084, "The transform"
  - `AGENTS.md`, 0084 entry
- **Status:** Built. `growth()` (`placement.ts:292–297`).

**R40. A Resource makes room on at most one axis, x first.**
- **Statement:**
  - A Resource at or past the subject's collapsed right edge takes the width growth only.
  - Otherwise, a Resource at or past the collapsed bottom edge takes the height growth only.
  - Otherwise it overlaps the collapsed subject and does not move.
- **Sources:**
  - ADR 0093
  - CONTEXT "Placement", paragraph 4
  - `AGENTS.md`, 0084 entry
- **Reasons** (0093):
  - The half-plane rule treated a Resource *beside* the subject as *below* it, producing an unpredictable jump on a memoryless Close.
  - One axis is enough to stay clear.
  - Measuring against the collapsed rect keeps Open and Close selecting the same set, which makes them a pair.
  - "At or past" because touching the edge is clear.
- **Negatives:**
  - Do not restore independent per-axis moves (A15).
  - Do not measure against the Open rect (A16).
- **Accepted cost:** A grid no longer scales uniformly. A Resource below the subject that is not clear on `x` still moves down, however far left it sits.
- **Status:** Built. Evidence: `placement.ts:324–325`, and the test "moves each Resource on one axis, x first" (`placement.test.ts:355`).

**R41. Open and Close are memoryless.**
- **Statement:** Open and Close each read the Map as it is at that moment and remember nothing about how it got there. Close reclaims from every Resource currently clear of the closing Resource on the decided axis, including Resources the author moved there while it was Open. It reclaims from none when the closing Resource has itself been dragged past the neighbours its own Open displaced.
- **Sources:**
  - ADR 0084, "Closing reclaims from where things are now"
  - ADR 0093, paragraph 2
  - CONTEXT "Placement", paragraph 4 (the only source for the "reclaims from none" clause, which follows from the memoryless rule but appears in no ADR)
  - `AGENTS.md`, 0084 entry
- **Reason:** See A14. Opening and closing are each a Map decision taken at a moment.
- **Negatives:** Never record which Resources a particular Open pushed.
- **Status:** Built. `SnapshotEdit.close`, and the tests "reclaims on x alone from a Resource moved beside the Open Resource, which the Open never pushed" (`snapshot-edits.property.test.ts:800`) and "reclaims from where the subject is now…" (`placement.test.ts:535`).

**R42. An Open-then-Close round trip restores positions.**
- **Statement:** An Open followed by a Close restores every position, because growth is nonnegative. The asymmetry for negative growth is stated, not clamped: a Resource the author drops past the collapsed edge inside an Open subject was never pushed, so Close carries it back inside the subject, and a reopen skips it.
- **Sources:**
  - ADR 0084, "The transform"
  - ADR 0093, Consequences
  - `AGENTS.md`, 0084 entry
- **Status:** Built. Round-trip property tests at `snapshot-edits.property.test.ts:698, 723`.

**R43. One Edit can move many Resources, as a unit.**
- **Statement:** A single Open, Close or Resize Edit may move many Resources, and it is one unit.
- **Sources:** ADR 0084, "Authored positions may now be written by the application".
- **Status:** Built (one completion, one snapshot). Undo is not built; a future undo reverses the unit whole (D12, resolved).

**R44. Open Size survives Close.**
- **Statement:**
  - Close changes only the state, and the next Open returns to the remembered Open Size.
  - A first Open records a default Open Size (ADR 0066 says only "the concrete default Open Size"; that the kind chooses it, as an Image Resource fitting its image, is from CONTEXT "Opening").
  - The Closed Size is fixed domain policy and is never stored.
  - A resize that lands within the application's magnetic range of the Closed Size on both axes is completed as a Close, which keeps the remembered Open Size.
  - A one-axis match is an ordinary Resize.
- **Sources:**
  - ADR 0066
  - `AGENTS.md`, 0066 entry
  - `rendering.md:17`
  - CONTEXT "Opening"
- **Status:** Built. `resize` closes on exactly `COLLAPSED_RESOURCE_SIZE` (`snapshot-edits.ts:491–496`), and `RESOURCE_CLOSE_SNAP_DISTANCE` is 24 (`rendering.md`).

---

## Important rejected alternatives

**A1. An intermediate Arrangement type.**
- **What was rejected:** Splitting a strategy into a specification plus an `Arrangement` of resolved geometry between strategy and consumers (ADR 0005, paragraph 3).
- **Surviving reason:** "It buys nothing — every consumer wants the positions — and adds a translation step at exactly the seam we are trying to keep thin." React Flow carries `position` on the node and has no layout entity, so an inventing type would sit between Hyper and the library (0005, paragraph 2).
- **Reinforcing decisions:**
  - ADR 0086 makes positions the whole of a strategy's output, so an Arrangement would carry nothing a Map's placement does not.
  - ADR 0041 adds no intermediate type.
  - ADR 0014 declares the decision still binding.
- **Evidence that no longer stands:** 0005's ELK evidence (`ElkShape`'s optional `x`/`y`) is implementation history while elkjs is out of the tree (0086). If an engine returns, it may apply again.
- **Accepted cost:** The noun names no separate object on screen (0005).
- **Related:** CONTEXT lists "arrangement" under _Avoid_ for both Placement and Layout strategy.

**A2. Disambiguating prefixes for the Map, or leaving "Layout" on the function.**
- **What was rejected:** `AuthoredLayout`, `SpaceLayout`, `StoredLayout`, or keeping `Layout` as the name of the function (ADR 0014).
- **Reason:** These buy the collision off instead of settling it. "Stored" wrongly implies positions are a cache.
- **Accepted cost:** A broad rename, and residual "layout" in `LayoutStrategy*`.

**A3. Running an automatic strategy at render, or keeping elkjs wired to a render path.**
- **Reason:** No surface could reach it, routed output could never persist, and render-time placement is unauthored (ADR 0086).
- **Accepted cost** (0086, "What it cost"):
  - The elkjs knowledge leaves the guidance and lives in `.scratch/layout-seam/issues/01` and `04`.
  - Nobody has looked at an automatic arrangement here for some time.
  - 0079's sentence about automatic strategies "thins out".

**A4. Keeping Computed Views dormant for later.**
- **Reason:** Their dormant ids, schema cases, URL semantics, conversion path and renderer resolution preserve most of the complexity being removed (ADR 0079).
- **Accepted cost:** V1 deliberately loses the view that flattened Graphs across Maps.

**A5. Requiring every import to author a Map before Hyper accepts it.**
- **Reason:** Loading existing Markdown into an empty Map is the streamlined manual-authoring path (ADR 0079).

**A6. A read-only or application-owned draft instead of authoring state on first open.**
- **Reason:** Without Computed Views, a Map is the state that makes a Space usable, and completing it before display is preferable (ADR 0079).
- **Accepted cost:** First open authors state. This reverses superseded 0025's objection that viewing becomes indistinguishable from editing.

**A7. Inferring a new Space from its Resource count.**
- **Reason:** Content is not provenance (ADR 0080).

**A8. Storing a creation marker.**
- **Reason:** The creation boundary already knows it is creating a Space (ADR 0080).

**A9. Placing a repaired mapless Space's existing Resources.**
- **Reason:** There is no authored basis for guessing their positions (ADR 0080). Instead they stay outside the new Map.

**A10. Graphs as Space-level peers of Maps, each Map filtering or sharing them.**
- **Source:** ADR 0040, "Why ownership follows authoring"; historically ADRs 0022 and 0026, both superseded.
- **Reason:** Removing a Resource from one Map would either leave an Edge whose endpoint is absent or mutate every Map showing the Graph. A filter cannot make either local.
- **Accepted cost:** Deliberate duplication when two Maps need the same narrative. The copies then diverge silently (0040; superseded 0045, "What it cost").

**A11. Map-scoped Graph ids.**
- **Reason:** Every lookup would need a `(map, graph)` pair, every render key would carry the Map, and the Graph URL would have to name a Map. That defends an ability nobody uses (ADR 0108).

**A12. Seeding or constraining an optimiser to honour a drop point.**
- **Reason:** Each spike increment reshuffled the existing Resources. The failure is structural (0013, carried by 0025, restated in 0086).
- **What survives:** The destructive, whole-Map form of Auto-arrange is clear of this finding.

**A13. Displacement derived at render.**
- **Source:** Originally ADR 0064, reversed by ADR 0084.
- **Reason:** It made size an input to every position, created step jumps, and forced a non-total inverse that misplaced drops. Previewing the step during a drag moves the jump under the pointer rather than removing it (0084).
- **Accepted cost of the replacement:** One Edit moves many Resources' authored positions, and this is stated honestly.

**A14. Recording which Resources an Open pushed, so Close reverses exactly that set.**
- **Reason:** This is per-open stored state. It goes stale as soon as the author moves anything, and two Maps with identical positions would behave differently because of history neither shows (ADR 0084).
- **Accepted cost:** Close also reclaims from Resources moved into the room while the subject was Open.

**A15. Independent per-axis thresholds.**
- **Covers:** The half-plane rule (strict `>` on each axis), and the same collapsed-edge thresholds applied independently.
- **Reason:** Both leave the beside-but-lower jump, which only grows with a larger threshold (ADR 0093).
- **What was given up:** These rules preserved a grid's shape under an Open.

**A16. Bands measured against the Open rect.**
- **Reason:** The Open width differs between Open, Resize and Close, so the selected set changes between Edits and the round trip fails (ADR 0093).

**A17. A stored Closed Size, optional or required.**
- **Reason:** Optional gives two document shapes for one fact, and required repeats a constant (ADR 0066).

**A18. Making Graph activation an Edit, or marking the Space dirty on activation.**
- **Reason:** Activation reads and changes nothing authored. The original 0028 argument (activation would force conversion) is dead, but the rule stands.
- **Accepted cost:** Activation is not durable until the next Edit.

---

## Historical claims a specimen would omit

Each claim below is classified as one of:
- **superseded-by-X:** a later decision replaced it.
- **renamed-vocabulary:** the claim survives only under a retired name.
- **implementation-history:** it describes code, a measurement or a ticket, not a rule.
- **out-of-pilot-scope.**

**O1. 0002: "A layout is an arrangement… a view renders it; a space holds layouts (a route-driven graph, a grid, a cluster map); the ELK Presentation view".**
- Classification: superseded-by-0014/0079/0086, plus renamed-vocabulary.
- Reason:
  - Strategies are not stored; 0014 splits the noun.
  - Views are gone (0079).
  - ELK is gone (0086).
- Residue: the arrange/draw seam, carried by R1 and R2.

**O2. 0005: "A Layout is a named strategy".**
- Classification: renamed-vocabulary, reversed by 0014.
- Reason: Its decision (A1, R5) is retained explicitly.

**O3. 0005: "Which cards a layout arranges belongs to the View".**
- Classification: superseded-by-0040/0079.
- Reason: Membership is the Map's (R31), and Views are gone.

**O4. 0005: the ELK and React Flow type evidence (`ElkShape`, `LayoutOptions`).**
- Classification: implementation-history.
- Reason: elkjs was removed by 0086. Only the "every consumer wants positions" reason is carried, in A1.

**O5. 0005 cost: "a Layout is a kind plus its parameters; no code may assume a single shape".**
- Classification: superseded-by-0014/0079.
- Reason: A Map has one kind (`positioned`), and strategies carry no stored parameters.

**O6. 0013 (superseded): positioned versus automatic "layouts"; automatic views read-only; Auto-arrange as the on-ramp; optional layouts; a grid past the bounding box for omitted cards.**
- Classification: superseded-by-0025→0075→0079, and omitted-placement superseded-by-0040.
- Reason: Only the drop-point negative (R7) survives.

**O7. 0017 (superseded): create a Layout at open from the strategy's output.**
- Classification: superseded-by-0025.
- Reason: 0079 re-accepts first-open authoring on different grounds, with an empty Map and no strategy seeding (R16).

**O8. 0025 (superseded): an app-supplied algorithmic default; "editing converts"; conversion copies what is on screen; dirty state.**
- Classification: superseded-by-0075→0079, and dirty superseded by 0030's automatic persistence.

**O9. 0031 and 0075 (superseded): the View selector; `defaultView`; Create Layout conversion; no strategy provenance on conversion.**
- Classification: superseded-by-0079.
- Reason: Provenance is relevant only to Auto-arrange's open questions (G6).

**O10. 0045 (superseded): a View takes Resources and Graphs and returns a Map; the Space-wide flatten; Flow view behaviour.**
- Classification: superseded-by-0079.
- Reason: Graph-id uniqueness is restated live by 0108 (R24).

**O11. 0022 and 0026 (superseded): a Map filters Space-level Graphs; Graphs are peers of Maps.**
- Classification: superseded-by-0040.
- Reason: "Emphasis, not filtering" survives in R29.

**O12. 0040: "Algorithmic Views have explicit subjects", and conversion of Space- and Graph-scoped Views.**
- Classification: superseded-by-0045→0079.

**O13. 0040: "Route identity is scoped to the owning Layout".**
- Classification: superseded-by-0108.

**O14. 0041: owner-scoped `getGraph(layout, graphId)`.**
- Classification: superseded-by-0108.

**O15. 0041:**
- the rename tables
- the `layouts` document example
- the Flow view rename, and `GraphView`→`SpaceCanvas`
- `GraphEmphasis` and the other adapter names
- the roll-forward plan and completion criterion

Classification: renamed-vocabulary (0085/0101: `layouts`→`maps`) and implementation-history.

**O16. 0064: "That displacement is derived and never written to the Layout"; the step-boundary cost; the negative "Neighbour displacement remains derived".**
- Classification: superseded-by-0084.
- Reason: These were explicitly reversed.

**O17. 0064: "Opening on an Algorithmic View converts it into a Layout".**
- Classification: superseded-by-0079.

**O18. 0064: "Expanded" and "expansion".**
- Classification: renamed-vocabulary.
- Reason: CONTEXT "Opening" puts them under _Avoid_.

**O19. 0066: "During the drag … neighbours move continuously"; one draft feeds the neighbours.**
- Classification: superseded-by-0084.
- Reason: The preview now shows only the resizing Resource's own rect.

**O20. 0066: "An automatic strategy supplies Closed entries… Conversion copies them".**
- Classification: superseded-by-0079.

**O21. 0084: the strict per-axis half-plane rule ("every Card whose authored x is strictly greater…").**
- Classification: superseded-by-0093.

**O22. 0084:**
- the measured `B.y=400/399` jump
- the deletion narrative for `Placement.drawn` and `authoredPoint`
- the list "what remains — `next`, `place`, `remove`, `fromEntries`"
- `.scratch/expanded-cards/issues/06` and `07`

Classification: implementation-history.
Reason: `Placement` now also exposes `growth`, `displace` and `reclaim`. The reason survives in R38.

**O23. 0079: "A newly created Space still begins with one Card centered…".**
- Classification: superseded-by-0080.
- Reason: The claim about the past is factually corrected, and the rule is in R14.

**O24. 0079: "Cards View".**
- Classification: renamed-vocabulary.
- Reason: It is now the Resources View (CONTEXT, 0082).

**O25. 0079: the lineage argument against ADR 0025.**
- Classification: implementation-history.
- Reason: The reason itself is kept in A6.

**O26. 0086:**
- ticket build lists
- `App.tsx:518` and other line references
- the `moved` flag
- the "open question" on which side an Edge attaches, and the per-Graph `::in`/`::out` ids
- the five surviving handle rules

Classification: implementation-history, and out-of-pilot-scope (answered by 0087/0110).

**O27. 0086: the `FIXED_ORDER` and namespaced-port knowledge for elkjs.**
- Classification: implementation-history.
- Reason: It is kept in `.scratch/layout-seam/issues/01` and `04`.

**O28. 0014: `LayoutPoint`/`LayoutPosition` duplication "structural"; `elkStrategy`; `LayoutGraph`, `LayoutCard`, `LayoutPort`.**
- Classification: superseded-by-0038 (one point type, now `MapPosition` per 0101), superseded-by-0086, and renamed-vocabulary (0041).

**O29. 0015: "routes may be empty"; "Present disabled when there are no routes"; `visibleCardIds`; the Draft deferral.**
- Classification: superseded-by-0040/0079, and implementation-history.
- Residue: R15 and R30.

**O30. 0028: activation "converts no algorithmic layout"; the first edge in a route-less space mints a Route (0021).**
- Classification: superseded-by-0079/0040.
- Reason: Every working Map already has a Graph. The rule itself survives in R10 and R29.

**O31. 0018: "A new space has no routes… gets a Layout the moment it opens (ADR 0017)".**
- Classification: superseded-by-0080.

**O32. 0003, 0007, 0012, 0023 and 0032: Graph content (independent orders, cycles, duplicates, no authored edges array).**
- Classification: out-of-pilot-scope.

**O33. 0033, 0087, 0090, 0100, 0103, 0104, 0105 and 0110: Edge geometry, lanes, head shapes and Edge Titles.**
- Classification: out-of-pilot-scope.

**O34. 0091's framing detail; 0068, 0074 and 0076 Space Resource lifecycle; the `resource-has-references` deletion precondition.**
- Classification: out-of-pilot-scope.
- Reason: Only R13's relocation is kept.

**O35. 0018 and 0080: why centred rather than at the origin; the fixture or template is not the default.**
- Classification: out-of-pilot-scope.
- Reason: New-Space content. Completeness is kept in R14.

---

## Source disagreements

**D1. ADR 0064 versus ADR 0084: is displacement derived and never written, or applied by the Edit?**
- Resolution: Resolved. 0084 `Refines: 0064` and says "This reverses the sentence in ADR 0064".
- `AGENTS.md` and CONTEXT agree with 0084.

**D2. ADR 0084 versus ADR 0093: the half-plane rule (strict, independent per axis) versus one axis decided against the collapsed rect.**
- Resolution: Resolved. 0093 `Refines: 0084` and "changes the rule".

**D3. ADR 0066 versus ADR 0084: does a resize preview move the neighbours?**
- Resolution: Resolved. 0084 `Refines: 0066`, and 0084 says a resize "no longer republishes its neighbours".
- The `AGENTS.md` 0066 entry and `rendering.md:17` agree with 0084.

**D4. ADR 0079 versus ADR 0080: "a newly created Space *still* begins with one Card centered in an authored Layout".**
- Resolution: Resolved. 0080 `Refines: 0079` and corrects it explicitly.
- Residual drift: CONTEXT "A new space" cites "(ADR 0018, ADR 0079)" rather than 0080. Citation fix only.

**D5. ADRs 0040 and 0041 versus ADR 0108: is a Graph id unique per Map or per Space?**
- 0040: "Route identity is scoped to the owning Layout".
- 0041: `getGraph(layout, graphId)`.
- 0108: unique in the Space.
- Resolution: Resolved. 0108 `Refines: 0040, 0041` and supersedes the prior audit's contradiction 1.

**D6. ADR 0015 versus ADRs 0040 and 0079: may a Space have no Graph?**
- 0015: a Space may have no routes and still renders.
- 0040: a Map owns a non-empty set of Graphs.
- 0079: every working Space has a Map.
- Resolution: Resolved. 0040 and 0079 both `Refines: 0015`. What survives is that a stored, not-yet-working Space may be mapless (R15).
- See also D19 on the presentation gate.

**D7. Who chooses which Resources a strategy arranges?**
- ADR 0005: the View.
- CONTEXT "Layout strategy": "the Map's choice".
- `rendering.md:21`: "the caller's choice".
- `packages/graph/src/layout.ts:20` doc comment: "decided by the view".
- Resolution: Resolved.
  - 0040 makes membership Map-owned.
  - 0079 removes Views; its `Supersedes` covers 0031, 0045 and 0075, which carried View machinery.
  - The `layout.ts` comment is stale vocabulary in code, not a decision.
  - For Auto-arrange over a Map, the arranged set is that Map's members (0086: the Map's positions are rewritten).
- Fix the comment's wording separately.

**D8. ADR 0005 "A Layout is a named strategy" versus ADR 0014.**
- Resolution: Resolved. 0014 `Refines: 0005` and keeps 0005's no-Arrangement decision binding.

**D9. The README binds line for 0002, "A Layout and a View are different entities", versus CONTEXT and ADR 0079.**
- CONTEXT puts View under Map's _Avoid_, and ADR 0079 removes Views from the domain.
- Resolution: Resolved, with a gap in the record.
  - 0002's "view" meant the rendering, not the later Computed View.
  - 0085 refines 0002 for vocabulary only, and 0079 has no status link to 0002.
  - The live residue is the arrange/draw seam (R1, R2).
- No behaviour conflicts. A status or binds-line correction is a later documentation decision.

**D10. ADRs 0013, 0017 and 0025 (editing converts; create at open from the strategy's output) versus ADR 0079.**
- Resolution: Resolved by the supersession chain 0013→0025, 0017→0025, 0025→0075→0079.

**D11. ADR 0028's reasoning (activation would force conversion) versus the current model.**
- Resolution: Resolved. The rule is carried by 0040 and 0041 (both `Refines`), and the reason is now "activation changes nothing authored" (A18).

**D12. ADRs 0086 and 0084 versus ADRs 0048, 0074 and the code: can an Edit be undone?**
- ADR 0086 says Auto-arrange is "undoable like any other" Edit, and ADR 0084 says "undoing it is undoing all of them".
- ADR 0048 says "there is no undo anywhere in this app", and ADR 0074 says "V1 has no undo".
- Code: `packages/app/src/components/DeleteConfirmation.tsx`, "V1 has no undo", and no undo command exists.
- Resolution: **Resolved by the user, 2026-10-04.** Undo is not built; it is a planned future feature. Every Edit, including Open, Close, Resize and Auto-arrange, is derived, submitted and stored as one atomic unit, so a future undo will reverse an Edit as a whole: undoing an Open moves back every Resource it displaced, and undoing an Auto-arrange restores every position it rewrote. Until undo exists, an Edit is reversed only by another Edit. So 0086's and 0084's "undoable" describe the unit a future undo reverses, and 0048's and 0074's "no undo" describe V1. Both hold. Atomicity rests on the Edit path (`docs/agents/editing-and-persistence.md`: complete snapshots derived before effects, submitted whole, never split across commits). Left open, for Auto-arrange's future delivery issue: whether it asks for confirmation before rewriting a whole Map while no undo exists.

**D13. Does ADR 0086 site Auto-arrange in `graph`, given the `eslint.config.js` zone that bans elkjs from `graph`?**
- Sources: ADR 0086 ("the package where Auto-arrange will live") and the `AGENTS.md` Hard rules note.
- Resolution: Resolved. `eslint.config.js:8–13` says the zone "is not a ruling on where a returning elkjs lives" and that re-siting the ban is part of building Auto-arrange. Enforcement config does not decide.

**D14. Does `docs/agents/editing-and-persistence.md`'s claim that "`map-resolution.ts` … exports exactly four names" match the code?**
- The code exports five: `resourcesOutsideMap` was added.
- Resolution: Resolved as guide drift (implementation detail, not a rule). Correct the guide; the decision is unaffected.

**D15. Does `rendering.md:23` say construction of `Placement` is closed (`new Map()` will not typecheck) while CONTEXT says "Placement is also what an automatic layout strategy computes"?**
- Resolution: No conflict. Both are consistent with `Placement.fromLayoutStrategyGraph` (`placement.ts:426`). Listed only because a reader may read it as one.

**D16. ADR 0079 versus the code: does a later Edit record the default Map?**
- 0079 says a later successful Edit "**may** record" the Map as default.
- The code records it on **every** Map-writing Edit (`snapshot.ts:111`), and Add Map records its new Map as default (`space-authoring.ts:1015`).
- Resolution: **Resolved by the user, 2026-10-04: the code's behaviour is the rule.** A Space opens on the Map most recently edited in. Selecting a Map is navigation and saves nothing; every Edit in a Map records it as `defaultMap`, Add Map included, and writes the Map's resolved `activeGraph` explicitly. This narrows 0079's "may" to "does" and confirms existing behaviour, needing no code change. *Later:* D21 split this rule by Edit target, and ADR 0116 records both D16 and D21, since ADR 0112 requires an ADR for the difference. Remembering the last Map viewed, or a pinned default, would be a new decision.
- *On `9cb40e16`:* PR #332 narrowed the code. `updatePositionedMap` (`snapshot.ts:113`) records `defaultMap` only when `opening` is set, and `space-authoring.ts:1532` sets it only for a canvas target, so an Edit through a Map drawn inside an Open Space Resource leaves that Space's `defaultMap` unchanged. See D21.

**D17. ADR 0086's open question on which side an Edge attaches, versus 0087 and 0110.**
- Resolution: Resolved. 0087 `Refines: 0086`. Out of pilot scope.

**D18. ADR 0003's parenthetical saying 0012 forbids a revisit.**
- Resolution: Resolved. 0032 supersedes 0012. Out of pilot scope.

**D19. The README binds line for 0015, "A Space may hold no Graph. It then cannot present", versus the code and CONTEXT gate.**
- The code and CONTEXT withhold presenting for an Active Graph with no Edges.
- Resolution: No contradiction. A mapless Space indeed cannot present.
- The current gate (an empty Graph cannot be presented) has no ADR in Graph terms; see G2.

**D20. ADR 0040's Graph-scoped View "architectural allowance" versus ADRs 0045 and 0079.**
- Resolution: Resolved. 0045 replaced the section, then 0079 superseded 0045.

**D21. ADR 0112 versus the code: does an Edit through a drawn Map record `defaultMap`?**
- ADR 0112: a Map drawn inside an Open Space Resource offers everything the canvas Map does, and "a difference without a recorded reason is a defect". It says nothing about `defaultMap`.
- The code (PR #332, commit `b5c63561`: "only a canvas Edit makes its Map the opening one") records `defaultMap` for canvas Edits only. No ADR or `.scratch/a-map-is-a-map/` ticket records a reason.
- Resolution: **Resolved 2026-10-04 by the user: it is a rule.** `defaultMap` and the Active Graph record where the author was working in that Space, which is navigation; editing a drawn Map does not navigate into its Space. ADR 0112 permits a difference only when an ADR records its reason, so ADR 0116 records it, refining 0112 and 0079. Found after evaluation; no grade depends on it.

### Source gaps (no contradiction, but the rule has no accepted ADR as its source)

**G1. Removing or deleting an Open Resource gives back its room (R35).**
- Stated in: CONTEXT "Placement", and built in `placement.ts` `reclaim`.
- Gap: No ADR says it. 0040's Remove from Map predates Open state, and 0084 speaks only of Open, Close and Resize.
- **Resolved by the user, 2026-10-04: keep the current behaviour, as a live rule.** Removing an Open Resource from a Map, or deleting it from the Space, Closes it in the same Edit and then removes it: Close's reclaim gives back the room it held, by the memoryless rule, before its position and Edges go. Removing a Closed Resource moves nothing. Removal itself never displaces; only Open, Close and Resize do. Sources: ADR 0084 for the reclaim, CONTEXT "Placement", and `snapshot-edits.ts:193` with its property test. No new ADR: nothing changes. The user considered and declined the alternative, removal leaving a gap (keeping every other position intact).

**G2. An empty Active Graph cannot be presented (R30).**
- Stated in: CONTEXT and `dock-chrome.ts:390`.
- Gap: The only ADR is 0015's older "no routes" form. Non-blocking for the pilot.

**G3. Auto-arrange has no delivery issue (R6).**
- Gap: It is accepted-but-unbuilt with no `.scratch/` issue tracking it. The spec requires a link, so one has to be filed or "none" stated.

**G4. Add to Map adds a Resource Closed and detached (R33).**
- Gap: This is code-only (`snapshot-edits.ts` `addToMap`). Treatment, non-blocking.

**G5. Which survivor becomes `defaultMap` after deleting the default Map (R12).**
- Gap: Code-only. Treatment, non-blocking.

**G6. Whether Auto-arrange records which strategy produced a Map's positions.**
- Gap: No live rule. 0031's rejection of provenance was superseded with conversion. Open design question for Auto-arrange, non-blocking for the pilot.
