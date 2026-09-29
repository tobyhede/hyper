# Domain cluster — ADR liveness analysis

All percentages are estimates by word share of each ADR, made by reading the text and spot-checking code. LIVE means live and already in current words. STALE-VOCAB means live but written in retired words (Card, Thing, Alias, Layout, Diagram, Route). HISTORY includes rejected alternatives, costs, ticket chatter, and ADR 0068's unbuilt cross-Space Edge hypothesis (about 700 words).

Cluster total: 19534 words (18,290 active + 1,244 superseded). Word-weighted shares: LIVE 16%, STALE-VOCAB 21%, OVERTAKEN 26%, HISTORY 37%. **Live content in any wording is about 37%.** Verdicts: KEEP 5, CONSOLIDATE 10, ARCHIVE 6, ALREADY-SUPERSEDED 4.

| ADR | words | LIVE% | STALE-VOCAB% | OVERTAKEN% | HISTORY% | #live | verdict | where rule lives now |
|---|---|---|---|---|---|---|---|---|
| 0001 | 141 | 0 | 60 | 5 | 35 | 2 | CONSOLIDATE | CONTEXT.md (Resource kinds, Space Resource) |
| 0004 | 305 | 0 | 45 | 25 | 30 | 3 | CONSOLIDATE | CONTEXT.md Placement |
| 0007 | 485 | 0 | 20 | 20 | 60 | 1 | ARCHIVE | CONTEXT.md Graph |
| 0009 | 724 | 0 | 40 | 20 | 40 | 4 | CONSOLIDATE | packages/graph/src/lookup.ts, validate.ts |
| 0010 | 591 | 35 | 5 | 20 | 40 | 5 | CONSOLIDATE | docs/agents/editing-and-persistence.md:20; vocab test |
| 0020 | 771 | 0 | 35 | 15 | 50 | 6 | CONSOLIDATE | docs/agents/editing-and-persistence.md:18; CONTEXT Aggregate directory |
| 0038 | 348 | 0 | 0 | 60 | 40 | 0 | ARCHIVE | — (moot, ADR 0086) |
| 0039 | 525 | 0 | 5 | 60 | 35 | 0 | ARCHIVE | — (ADR 0070) |
| 0046 | 772 | 0 | 5 | 60 | 35 | 1 | ARCHIVE | — (ADR 0070/0083/0089) |
| 0051 | 333 | 0 | 70 | 0 | 30 | 4 | KEEP | CONTEXT.md Resource; schema.ts |
| 0068 | 2751 | 3 | 35 | 25 | 37 | 12 | CONSOLIDATE | CONTEXT.md Space Resource/Entering/Open Spaces; open-spaces.ts |
| 0070 | 443 | 0 | 65 | 10 | 25 | 5 | KEEP | AGENTS.md ADR 0070 entry; CONTEXT Reference Resource |
| 0074 | 768 | 0 | 45 | 35 | 20 | 6 | CONSOLIDATE | CONTEXT.md Meta Space/Aggregate; space-aggregate.ts |
| 0076 | 403 | 0 | 55 | 10 | 35 | 6 | CONSOLIDATE | docs/agents/editing-and-persistence.md:29 (stale re 0097) |
| 0083 | 1349 | 20 | 50 | 5 | 25 | 10 | KEEP | core/src/title.ts; CONTEXT Resource |
| 0085 | 2148 | 5 | 10 | 45 | 40 | 4 | ARCHIVE | vocab test carve-outs; CONTEXT layout strategy |
| 0092 | 417 | 30 | 0 | 20 | 50 | 2 | ARCHIVE | CONTEXT Reference Resource _Avoid_ |
| 0097 | 541 | 25 | 30 | 15 | 30 | 5 | CONSOLIDATE | session-registry.ts (docs stale) |
| 0099 | 645 | 50 | 10 | 0 | 40 | 3 | KEEP | persistence/src/session-registry.ts |
| 0101 | 2793 | 35 | 0 | 5 | 60 | 7 | CONSOLIDATE | vocab test (partial); conventions nowhere |
| 0106 | 1037 | 85 | 0 | 0 | 15 | 12 | KEEP | core/src/schema.ts; CONTEXT Image Resource |
| 0049 | 317 | 0 | 0 | 100 | 0 | 0 | ALREADY-SUPERSEDED | — |
| 0058 | 696 | 0 | 0 | 85 | 15 | 0 | ALREADY-SUPERSEDED | — |
| 0059 | 114 | 0 | 0 | 100 | 0 | 0 | ALREADY-SUPERSEDED | — |
| 0060 | 117 | 0 | 0 | 100 | 0 | 0 | ALREADY-SUPERSEDED | — |

## Per-ADR live decisions (current vocabulary)

### 0001 — CONSOLIDATE
- A Space Resource's content is another Space, explored in place (Opened/Entered), so Spaces nest to any depth, acyclically
- Nesting is a Resource kind, not a separate subgraph concept beside Resources
- _Notes:_ Whole ADR is one paragraph in Card vocabulary; 'routing/layout per level' cost is loosely stale (Graphs are per-Map, strategies non-addressable). Rule lives in CONTEXT.md (Resource kinds, Space Resource).

### 0004 — CONSOLIDATE
- A Graph's Edges name Resources directly by id; no node/placement entity sits between a Resource and its position
- A Map holds at most one position per Resource (keyed by Resource id)
- Recurring content is a Reference Resource, never a duplicate placement
- _Notes:_ Overtaken: 'authored positions went ... ELK computes positions' (ADR 0014/0040 put positions in the Map; ADR 0086 removed ELK); route steps/revisit (ADR 0023 superseded, 0032 cycles); 'Alias is a later change' (built). CONTEXT.md Placement paragraph restates the live rule and names ADR 0004.

### 0007 — ARCHIVE
- Graphs are a Map's only connection structure; there is no separately authored, un-Graphed connection between Resources
- _Notes:_ 'Edge stops being a domain term' is overtaken: Edge is a domain term (ADR 0040/0041, CONTEXT.md Edge). Removal of manifest.edges, sequence/reference kinds and ReferenceErrorKind members is history. Live sentence already in CONTEXT.md Graph entry.

### 0009 — CONSOLIDATE
- Reference resolution is lazy and non-destructive: intake keeps Reference Resources as pointers; content is resolved on read
- Resolution lives in @project/graph (resolveContentResource, packages/graph/src/lookup.ts), not core
- Referencing is single-hop: a Reference Resource may not target itself or another Reference Resource (validate.ts reference-targets-self / reference-targets-reference), so no cycle check exists
- Every content consumer goes through the resolver (the accepted tax)
- _Notes:_ Overtaken: redraw-vs-revisit routing argument (routes-as-steps gone); open visual-signal question settled by ADR 0083 (kind glyph + dotted border, no Target name). Drift: resolveContentResource resolves only markdown|space targets, so an Image target resolves to nothing (ADR 0106 ticket 06 unbuilt).

### 0010 — CONSOLIDATE
- The single top-level domain value is a Space
- loadSpace(input, resourceFiles) is the one intake: parse, validate references, index; a Space is consistent by construction
- 'manifest' is retired in vocabulary and code (guarded by test/unit/current-domain-vocabulary.test.ts)
- A value that merely passes spaceFileSchema is not a Space; the file schema keeps a file-flavoured name
- Space is never widened into an edit buffer (no Draft Space)
- _Notes:_ Overtaken: 'edit buffer is a future Draft' prediction (ADR 0035/0042: editors install valid state; drafts stay local); 'space card kind deferred'; getCard/buildRouteEdges names. Note loadSpaceSnapshot and loadSpaceAggregate now also exist beside loadSpace. Lives in docs/agents/editing-and-persistence.md:20 and CONTEXT.md Space _Avoid_.

### 0020 — CONSOLIDATE
- A Resource is one Markdown file: frontmatter (id, title, kind, kind fields) + body
- The space file holds structure only (version, id, title, maps, defaultMap); no resources array
- Discovery scans *.md beside space.json and resources/*.md, non-recursively
- Identity comes from frontmatter id, never the filename; duplicate ids are a load error
- Default Resource order is by title then id (packages/graph/src/space.ts)
- loadSpace takes the space file and raw resource files and stays pure/synchronous
- _Notes:_ Overtaken: description frontmatter (ADR 0051); routes/layouts/defaultView keys (ADR 0040/0079); 'a card cannot yet be written / save endpoint' (ADR 0030 PostgreSQL is the live store; the file form is now the export/import projection). Lives in docs/agents/editing-and-persistence.md:18 and CONTEXT.md Aggregate directory; src/aggregate-directory/space-directory.ts.

### 0038 — ARCHIVE
- (none)
- _Notes:_ Split by ADR 0085 (authored position vs bare Point) and then made moot by ADR 0086: strategies return positions only, no routed edge sections exist (packages/graph/src/layout.ts). Still status 'accepted' with no Superseded-by; README binds line reads as live.

### 0039 — ARCHIVE
- (none)
- _Notes:_ Delegated content pane replaced by ADR 0049, itself superseded by ADR 0070 (read-only Open, Target opened to author). Only surviving idea (Reference Resource owns no content) is ADR 0009's. Status still 'accepted'; README binds line ('gives content authoring to its Target') paraphrases a mechanism that no longer exists.

### 0046 — ARCHIVE
- (residual) A Reference Resource's own Title is authored as the Reference Resource's, independently of its Target — restated in ADR 0070
- _Notes:_ Pane with Title+Target fields removed (ADR 0070/0089); empty-Title-takes-Target fallback removed (ADR 0083, then ADR 0089 names it after its Target). Rename-to-blank refusal now comes from ADR 0083's normalization (RESOURCE_TITLE_REQUIRED).

### 0051 — KEEP
- A Resource's only shared authored field beyond identity and kind is its Title
- The kind owns everything else: additional fields, opened surface, what the front draws around the Title
- No shared Description, subtitle, summary, excerpt or second content slot
- Resource fronts keep uniform geometry across kinds
- _Notes:_ Fully live, Card/Alias vocabulary. Restated in CONTEXT.md Resource entry; schema.ts has no description field.

### 0068 — CONSOLIDATE
- A Space Resource references one target Space and carries its own Map and Graph selection; the reference is immutable
- Many Space Resources may reference the same Space; references may converge but not cycle (space-resource-reference-cycle)
- The selection belongs to the Resource and never changes the target Space's own defaultMap/activeGraph
- A standalone or new-tab Space uses its own selection; an embedded one uses the Resource's
- Opening a Space Resource embeds its selected Map; editing inside authors the target Space, moving/resizing the Resource authors the containing Map
- Entering seeds a live selection from the Resource; changing Map/Graph inside is navigation, not an Edit; re-entering an open Space keeps its live selection
- Creating a Space creates a Markdown Resource, a Map containing it and an empty Active Graph in one Edit
- Open Spaces: selecting an entry switches and closes nothing; Exit is the only close; it is a set, not a stack; entering an already-open Space focuses its entry
- Switching away awaits the left Space's in-flight commit (activateAfterLeavingSettles)
- A conflict dialog opens only in the Space that owns it (not verified in code)
- Exit waits on in-flight commit, refuses on failed/conflicted (persistence-recovery-required), warns and allows on rejected (open-spaces.ts)
- Embedded Maps render as compound nodes in the containing React Flow instance; an entered Space gets its own instance and camera
- _Notes:_ Overtaken: Space View/Computed View namespace (ADR 0079); non-owning reference and refused Space deletion (ADR 0074); optional selection with fallback to target default (ADR 0079 Ticket 04); refusing deletion of a selected Map/Graph (ADR 0091 relocates); Open Spaces beside a Sidebar, SIDEBAR_WIDTH, Sheet (ADR 0082); 'an entry remembers nothing else' (CONTEXT.md now records an Opener, with no ADR). ~700 words on cross-Space Edges are an unbuilt hypothesis: graphEdgeSchema from/to are bare ids and canvasNodeConnection (packages/app/src/embedded-map.ts) answers 'invalid' for a mixed pair. UX-prototype section is history.

### 0070 — KEEP
- A Reference Resource chooses its Target once, at creation, and is never retargeted (reference-target-immutable)
- Otherwise it is an ordinary Resource: Title, Map membership, position, Edges, Open/Closed, Open Size are authorable
- Opening it is the ordinary Map-owned Open; it renders the Target's content read-only with no content-authoring controls
- It reuses the Target kind's renderer under a read-only capability rather than its own
- Authoring Target content means opening the Target itself; Jump to Target stays deferred
- _Notes:_ 'When the proposed Space Card kind is accepted and built' is overtaken (built); creation picker overtaken by ADR 0089 (create from Target). AGENTS.md ADR 0070 entry is the current restatement. Image targets (ADR 0106) not yet built.

### 0074 — CONSOLIDATE
- The Space Resources referencing a Space jointly own its lifetime; deleting the last one deletes it
- Deletion cascades through Spaces left unreferenced; acyclicity guarantees termination
- The Meta Space is permanent: no Space Resource creates it and no deletion reaches it
- Every ordinary Space is created by creating its first Space Resource (ordinary-space-unreferenced otherwise)
- Reference counting is sufficient; do not add a reachability sweep
- Destructive Resource deletion confirms instead of refusing (no undo in V1)
- _Notes:_ Its own 'Meta Space and the built Entry Space' section (~35% of words) is self-declared out of date and its two paragraphs contradict each other. Lives in CONTEXT.md Meta Space/Aggregate/Space Resource; docs/agents/editing-and-persistence.md:29; packages/graph/src/space-aggregate.ts.

### 0076 — CONSOLIDATE
- Each Space is its own optimistic-concurrency unit (own working state, revision, persistence status)
- A multi-Space Space Resource lifecycle operation is one atomic Edit over coordinated per-Space sessions
- Its interface is domain-shaped (create, link, delete; plus delete Map/Graph per ADR 0091); callers never pass snapshots, revisions or ordering
- One browser-wide persistence barrier; every participant installed before one publication; barrier held through the repository answer
- Participants in failed/conflicted must recover first; rejected may participate; the persistence outcome is shared by all participants
- This is the only exception to Space Authoring owning SpaceSession mutation
- _Notes:_ 'Derives the Edit from the latest authoritative working Spaces' is overtaken by ADR 0097 (stored aggregate + participants' working Spaces). Code: packages/app/src/space-resource-lifecycle.ts, packages/persistence/src/session-registry.ts.

### 0083 — KEEP
- A Resource Title is one or more Title Lines stored in one string; the first line is the name
- Roles: title, subtitle, caption, and every later line is caption; no count limit
- titleLines/titleName in @project/core are the only readers of the structure
- Every list/reference surface and accessible name shows only the name; only the Resource front draws the ladder, Open or Closed
- Search filters on the whole Title and displays the name
- Authored breaks are load-bearing; wrapped breaks are not
- A Title never resizes a Resource; overflow clamps
- Normalization at the schema boundary (CRLF, trailing whitespace, blank edge lines); at least one non-empty line or refusal
- Multiline Titles are Resources' only; Space, Map, Graph, Edge titles are single-line
- Enter completes, Escape cancels, Shift+Enter inserts a line
- _Notes:_ Overtaken: 'an unnamed Alias mints Card N' (ADR 0089 names a new Reference Resource after its Target). Surface names (Cards drawer, CardSearchCombobox, Space Card selectors) are stale; ResourceSearchCombobox now has no consumer and search lives in ResourcesPopover.

### 0085 — ARCHIVE
- (beyond vocabulary) LayoutStrategy keeps its name: 'layout' is the verb (restated by ADR 0101)
- (beyond vocabulary) The vendored shadcn Card* registry names are exempt from the vocabulary guard (current-domain-vocabulary.test.ts carve-out)
- (beyond vocabulary) 'entity' is the generic word for any referenceable thing in prose
- (process) Accepted ADR bodies are not rewritten on rename; status blocks point to the rename (docs/agents/workflow.md)
- _Notes:_ Rename verdict: carries three decisions beyond the word — the LayoutStrategy negative, the registry carve-out, and splitting authored MapPosition from a bare routed-geometry Point. The point split was then made moot by ADR 0086; the `views` URL segment retirement was superseded by ADR 0101's /maps. Thing/Diagram names are themselves overtaken. Object-rejection argument is history.

### 0092 — ARCHIVE
- Do not rename SpaceReferenceError/validateReferences: they name a failed cross-id check, not the Reference kind
- A Space Resource is not a Reference Resource; 'Reference' is not a family both kinds belong to
- _Notes:_ Rename verdict: essentially pure vocabulary plus two negatives, both already in CONTEXT.md (Reference Resource _Avoid_) and code. Jump/Copy link to Target deferral duplicates ADR 0070/AGENTS.md.

### 0097 — CONSOLIDATE
- A coordinated lifecycle Edit is derived and judged against the stored aggregate with participants' working Spaces applied — the aggregate the repository will judge
- The browser's pre-commit verdict is decideCommit (same as every repository)
- One stored-aggregate read per coordination turn; deletion cascades count references in that view
- A link whose target Space is failed or conflicted refuses persistence-recovery-required
- The later repository answer differs from the browser verdict only when stored state moves during the turn
- _Notes:_ 'Barrier waits for every open Space's queued local work' is overtaken by ADR 0099. Drift: docs/agents/editing-and-persistence.md:29 still says the coordination derives participants 'from the latest authoritative working sessions' and passes 'normal Space and aggregate intake' — the ADR 0076 wording 0097 replaced.

### 0099 — KEEP
- The barrier pauses every session, then awaits only commits already in flight; queued local work stays queued for a later turn
- Consequence: linking right after adding a Graph sees the target's stored Graphs, not the queued one
- One recovery rule for Space Resource deletion and Map/Graph deletion: a Space needing recovery whose stored or working state references a Space being removed, or selects the Map/Graph being deleted, refuses persistence-recovery-required; rejected Spaces do not refuse
- _Notes:_ Built in packages/persistence/src/session-registry.ts (barrier/pausePersistence).

### 0101 — CONSOLIDATE
- Space, Resource, Graph and Map are the four domain nouns; Thing and Diagram must not reappear anywhere
- Map conventions: capitalised in prose; no domain value bound to a local named `map` (initial `m`); a …Map identifier suffix means the entity, lookup tables use …ById/…ByKind; MiniMap/flatMap/ReadonlyMap/WeakMap/@@map are foreign
- Do not rename LayoutStrategy to MapStrategy; LayoutStrategyResource names the arranged entity
- Do not rename `kind` to `type`
- The stored-seam types were renamed away from 'Resource' (StoredSpaceRepository)
- URN for a Resource is deferred to its own ADR
- The document stays version 1; no compatibility parser for renamed keys
- _Notes:_ Rename verdict: carries real decisions beyond the word — the Map naming conventions, the kind-not-type negative, the seam rename, the URN deferral. 'markdown, space and reference are what a Resource can be' is overtaken by ADR 0106. Codemod/mask/measurement sections are history. Drift: it says the Map conventions and Thing/Diagram _Avoid_ entries 'belong in CONTEXT.md'; neither is there. The 'no local named map' convention is violated (packages/http/src/product-destination.ts:137,155; packages/app/src/snapshot.ts:96).

### 0106 — KEEP
- An Image Resource (kind image) owns an image URL, not bytes; no flag says where the URL points
- Accepted URLs: https:, http:, or root-relative /images/<id>; data: and all else refused (image-url-unsupported)
- Stored images live outside the aggregate at /images/<id>, id = unpadded base64url SHA-256 of bytes; PNG/JPEG/WebP/GIF sniffed from bytes, up to 10 MiB
- No single stored image is ever deleted; only a reset clears the store
- Export/Import carry the URL only; a missing picture is not an intake error
- Fixtures seed tracked image files through the same store
- The Title is the text alternative; no alt field
- Natural size is measured when the URL is set; first Open sizes from it within 1280x960, never below Closed size
- Replacing the image is one Edit that keeps identity, Title, placement, Edges and Open Size
- A picture that will not load is not a refusal
- A Reference Resource may target an Image Resource and shows it read-only
- Creation completes on activation; Title is Resource N
- _Notes:_ Explicit waiver of ADR 0056 (repo is the only source of state). Partially unbuilt: .scratch/image-resource/issues/05 (Replace) and 06 (Reference → Image) are ready-for-agent, yet CONTEXT.md states both as present fact.

### 0049 — ALREADY-SUPERSEDED
- (none)
- _Notes:_ Superseded by ADR 0070; the pane it governs is deleted. No citations outside docs/adr.

### 0058 — ALREADY-SUPERSEDED
- (none)
- _Notes:_ Superseded by ADR 0068. Surviving ideas (atomic create of Resource + target Space, immutable reference, no cycles, chooser retired) are restated by 0068/0074. Still cited as live: packages/app/src/space-authoring.ts:1296 and packages/app/test/space-authoring-operations.test.ts:1593 ('A Space Resource owns the Space it names (ADR 0058)' — single ownership is 0060's model; shared ownership is ADR 0074); docs/agents/ui.md:21 ('space-selection is condemned under ADR 0058', but no space-selection entry remains in the inventory or src).

### 0059 — ALREADY-SUPERSEDED
- (none)
- _Notes:_ No-Map new Space overtaken by ADR 0068/0079/0080.

### 0060 — ALREADY-SUPERSEDED
- (none)
- _Notes:_ Single owner replaced by ADR 0074's shared reference count.

### Rename ADRs (0085, 0092, 0101): do they decide anything beyond the word?
- **0085**: yes, three things. It keeps `LayoutStrategy` (still live), exempts the shadcn `Card*` registry from the guard (still live), and splits authored `MapPosition` from computed `Point` (made moot by 0086). It also retired the `views` URL segment, which 0101 then replaced. About 5% of it is live and not vocabulary. It can be archived once its two surviving negatives sit in the consolidated doc, and 0101 already restates the `LayoutStrategy` one.
- **0092**: almost none. It adds two negatives: do not rename `SpaceReferenceError`/`validateReferences`, and Reference is not a family that Space Resource belongs to. Both are already in CONTEXT.md and the code. It can be archived.
- **0101**: yes, and it is the only rename ADR with a real live nucleus. It sets the Map naming conventions, says not to rename `kind` to `type`, renames the `SpaceResourceRepository` seam, defers URN, and repeats the `LayoutStrategy` negative. About 60% of it is codemod process, measurements and costs. The conventions it says belong in CONTEXT.md are not there.

## Consolidated "current design" outline — domain cluster

Target: one document (~2,300–2,700 words) replacing ~18,300 words of active ADR text (plus 1,244 superseded). Ratio roughly 1:7. Each item: decision, source ADRs, what holds it.

### 1. The four nouns and naming discipline
1. Space, Resource, Graph, Map are the domain nouns; Card, Thing, Layout, Diagram, Alias, Route, manifest are retired in every identifier shape. — 0010, 0085, 0092, 0101 (+0041). Held by `test/unit/current-domain-vocabulary.test.ts`.
2. `entity` is the generic word for a referenceable thing. — 0085. (Convention only.)
3. Map conventions: capitalised in prose, no local named `map` for a domain value, `…Map` suffix means the entity, lookup tables use `…ById`/`…ByKind`; foreign names (`MiniMap`, `flatMap`, `ReadonlyMap`, `WeakMap`, `@@map`) untouched. — 0101. Held by nothing (review only; already violated in 3 sites).
4. Negatives: `LayoutStrategy` keeps its name (layout is the verb); `kind` is not renamed `type`; `SpaceReferenceError`/`validateReferences` keep theirs; shadcn `Card*` registry names are vendored and exempt. — 0085, 0092, 0101. Held by the vocabulary test's carve-outs.

### 2. The Space value and intake
5. The Space is the single top-level value; `loadSpace(input, resourceFiles)` is the one intake (parse → validate references → index); a value that only passes `spaceFileSchema` is not a Space; there is no Draft Space. — 0010 (+0035/0042). `packages/graph/src/space.ts`; `docs/agents/editing-and-persistence.md`.
6. Serialized form: `space.json` holds structure only (`version`, `id`, `title`, `maps`, `defaultMap`); each Resource is one Markdown file with frontmatter; discovery is `*.md` + `resources/*.md`, non-recursive; identity from frontmatter id; duplicate id is a load error; default order title-then-id. — 0020 (+0051, 0101). `src/aggregate-directory/space-directory.ts`, `packages/graph/src/space.ts`.

### 3. Resources and kinds
7. A Resource has an id, a kind and a Title; the kind owns everything else; no shared Description/subtitle/summary; uniform front geometry. — 0051. `packages/core/src/schema.ts`.
8. Four kinds: markdown, image, space, reference. — 0001, 0009, 0068, 0106.
9. Title Lines: one string, first line is the name; roles title/subtitle/caption(+); `titleLines`/`titleName` are the only readers; lists and accessible names show the name; only the front draws the ladder; search matches the whole Title; authored vs wrapped breaks; never resizes; schema normalization with a stable refusal; Resource-only; Enter/Escape/Shift+Enter. — 0083. `packages/core/src/title.ts`, `InlineTitleEditor`.
10. No placement layer: Edges name Resources directly; a Map holds at most one position per Resource; recurring content is a Reference Resource. — 0004 (+0040). CONTEXT.md Placement.
11. Graphs are a Map's only connection structure. — 0007 (+0040).

### 4. Reference Resources
12. Target chosen at creation (from the Target's own menu, named after it — 0089), immutable (`reference-target-immutable`); otherwise an ordinary authorable Resource. — 0070, 0089.
13. Resolution is lazy, non-destructive, in `graph`, single-hop; self- and reference-targets are intake errors. — 0009. `packages/graph/src/lookup.ts`, `validate.ts`.
14. Open is the ordinary Map-owned Open; content read-only via the Target kind's renderer; no content-authoring controls. — 0070, 0083 (front names nothing outside itself).
15. Deleting a Resource a Reference Resource targets is refused (`resource-has-references`). — (no ADR in this cluster; `packages/graph/src/snapshot-edits.ts`).

### 5. Image Resources
16. Owns a URL, not bytes; accepted URL schemes; stored images outside the aggregate at `/images/<sha256-b64url>`; never individually deleted; Export carries URL only; Title is the alt text; natural size measured at URL-set time drives first Open; replace is one Edit; unloadable picture is not a refusal; Reference may target an Image. — 0106 (waiver of 0056). `packages/core/src/schema.ts`. Mark items 05/06 as not yet built.

### 6. Space Resources and nested Spaces
17. A Space Resource references one target Space immutably and stores its own required Map + Graph (+ optional framing); selection never writes the target's own defaults; convergence allowed, cycles refused. — 0001, 0068, 0079. `spaceResourceFrontmatterSchema`, `space-resource-reference-cycle`.
18. Lifetime: references jointly own the target; last reference deletes it and cascades; Meta Space is permanent; every ordinary Space must be referenced; reference counting, no sweep; confirm rather than refuse. — 0074 (+0077/0078). `packages/graph/src/space-aggregate.ts` (`ordinary-space-unreferenced`).
19. Deleting a selected Map/Graph relocates every selecting Space Resource. — 0091 (replaces 0068's refusal).
20. Opening embeds the selected Map (compound React Flow nodes); editing inside authors the target; moving/resizing authors the containing Map. Entering gives the target its own canvas/camera and a live navigation-only selection. — 0068.
21. Open Spaces: a set, not a stack; switching closes nothing and awaits the left Space's in-flight commit; Exit is the only close — waits, refuses failed/conflicted with `persistence-recovery-required`, warns on rejected; re-entering focuses the existing entry; Opener recorded as history. — 0068, CONTEXT.md (Opener has no ADR). `packages/app/src/open-spaces.ts`.

### 7. Multi-Space Edits
22. Per-Space sessions and revisions; Space Resource lifecycle (create, link, delete, delete Map/Graph) is the only multi-Space Edit and is one atomic, domain-shaped operation. — 0076, 0091.
23. Barrier: pause all sessions, await only in-flight commits; queued work waits a turn. — 0099. `packages/persistence/src/session-registry.ts`.
24. Judge against what commits: one stored-aggregate read per turn with participants' working Spaces applied; browser verdict is `decideCommit`. — 0097.
25. Recovery: a participant or affected Space in failed/conflicted refuses; a link target in failed/conflicted refuses; a recovering Space whose stored or working state references/selects what a deletion removes refuses; rejected never refuses; one shared outcome for all participants. — 0076, 0097, 0099.

### Explicitly not decided / deferred (one short list)
- Cross-Space Edges (0068 hypothesis; not built).
- Jump to Target / Copy link to Target (0070, 0092).
- Resource URN (0101).

## Drift and contradictions

1. **Codemod rewrote history in the vocabulary test.** `test/unit/current-domain-vocabulary.test.ts:961` says "ADR 0085 makes Map the first-public name for the entity that was a Layout" and `:1325–1334` says "ADR 0085 makes Resource the first-public name ... ADR 0085 chose Resource over Object". ADR 0085 chose *Thing* and *Diagram*; Resource/Map are ADR 0101. The 0101 sweep appears to have rewritten the 0085 citation text along with the nouns. `describe('a Map is named once (ADR 0085)')` at :1161 has the same problem.
2. **ADR 0101's promised CONTEXT.md changes did not land.** It says the Map conventions "belong in `CONTEXT.md`" and that "`CONTEXT.md` gains both [Thing, Diagram] under `_Avoid_`". Neither is in CONTEXT.md (Resource's `_Avoid_` lists Card; Map's lists Layout).
3. **0101 convention violated:** domain Map values bound to a local named `map` at `packages/http/src/product-destination.ts:137,155` and `packages/app/src/snapshot.ts:96`.
4. **editing-and-persistence.md describes pre-0097 coordination.** Line 29 says the coordination "derives every participant and expected revision from the latest authoritative working sessions" and passes "normal Space and aggregate intake". ADR 0097 replaced that with stored aggregate + participants' working Spaces, judged by `decideCommit`.
5. **Superseded ADR 0058 cited as live authority:** `packages/app/src/space-authoring.ts:1296` and `packages/app/test/space-authoring-operations.test.ts:1593` ("A Space Resource owns the Space it names (ADR 0058)"). The model is ADR 0074's shared ownership, not 0058/0060's single ownership. `docs/agents/ui.md:21` says `space-selection` is "condemned ... under ADR 0058" and "goes with space-cards/04", but no `space-selection` exists in src or the inventory any more, so the sentence is stale. (`test/unit/ui-catalog.test.ts` uses "Retired by ADR 0058" only as synthetic fixture text, which is harmless.)
6. **ADR 0106 is stated as built where it is not.** CONTEXT.md says a Reference Resource "may target ... an Image Resource" and describes Replace. `.scratch/image-resource/issues/05` and `06` are `ready-for-agent`. `resolveContentResource` (`packages/graph/src/lookup.ts:69`) resolves only markdown or space, and `validate.ts` does not refuse an image target, so a Reference to an Image is accepted but draws nothing.
7. **Cross-Space Edges read as current in CONTEXT.md.** Presenting says the presenter follows "the applicable cross-Space Edges carried through Space Resources". `graphEdgeSchema` has only id endpoints, and `canvasNodeConnection` answers `invalid` for a mixed pair. ADR 0068 calls these a hypothesis, and they are not built.
8. **Open Spaces' Opener has no ADR.** ADR 0068 says an entry "remembers nothing else" and keeps no crossing chain. CONTEXT.md and `open-spaces.ts` record an Opener and re-home it on Exit. No ADR records the change.
9. **ADR 0083's Reference-naming refinement is itself overtaken.** 0083 says "an unnamed Alias mints `Card N`". ADR 0089, as restated in AGENTS.md, names a new Reference Resource after its Target. ADR 0083 carries no Refined-by 0089.
10. **CONTEXT.md:148, "two of the three [strategies] that ship read no Map".** ADR 0086 removed ELK, so two strategies ship (grid and positioned) and one of them reads no Map. The count was inherited from ADR 0085's text.
11. **Status blocks lag.** 0038, 0039 and 0046 are `accepted` with no Superseded-by, although nothing in them binds (0038 was moot after 0085 and 0086; 0039 and 0046 were replaced by 0049→0070 and by 0083/0089). The README binds lines for 0038 and 0039 read as live rules.
12. **ADR 0074 contradicts itself.** Its closing section has two paragraphs. The first says Meta Space is built and Entry Space is retired. The second, kept, says "Meta Space is not built". It also says Default Content is unbuilt (`.scratch/v1-release/issues/16`), and I did not check that.
13. **ADR 0101 says the kinds are "markdown, space and reference".** ADR 0106 added image without refining 0101. This is minor, but a reader of 0101 alone gets the wrong kind set.
