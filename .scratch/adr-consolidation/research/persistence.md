# Cluster: persistence

ADRs 0016 (rejected) 0018 0028 0030 0035 0042 0054 0056 0057 0077 0078 0088 0094 0095 0096 0098; superseded 0019 0029. Percentages are reading estimates (+/-10pts), not counts.

| ADR | words | LIVE% | STALE-VOCAB% | OVERTAKEN% | HISTORY% | #live | verdict | where rule lives now |
|---|---|---|---|---|---|---|---|---|
| 0016 | 969 | 15 | 0 | 10 | 75 | 2 | ARCHIVE (rejected) - but extract its one live rule first | AGENTS.md Conventions; packages/app/test/minting.ts |
| 0018 | 433 | 35 | 10 | 10 | 45 | 2 | CONSOLIDATE | CONTEXT.md:13; graph/src/new-space.ts; e2e/new-space.spec.ts |
| 0028 | 653 | 30 | 15 | 15 | 40 | 4 | CONSOLIDATE | app/src/navigation.ts:339, space-authoring.ts:1074; core schema.ts:395; doc (1 sentence) |
| 0030 | 939 | 30 | 10 | 35 | 25 | 6 | CONSOLIDATE | doc SpaceBackend bullets; AGENTS.md Commands; src/cli, src/export, identify-space.ts |
| 0035 | 639 | 50 | 15 | 15 | 20 | 9 | KEEP (re-vocab) / CONSOLIDATE | doc "installs atomically"/"install gate"; space-authoring.ts |
| 0042 | 897 | 60 | 5 | 5 | 30 | 10 | KEEP | doc "install gate"; replacement-invalidation.test.tsx |
| 0054 | 206 | 50 | 0 | 0 | 50 | 2 | CONSOLIDATE (fully restated and generalised by 0056) | 0056; AGENTS.md intro; doc bullet 1 |
| 0056 | 457 | 65 | 5 | 0 | 30 | 6 | KEEP | AGENTS.md intro; doc bullet 1 |
| 0057 | 524 | 65 | 10 | 0 | 25 | 8 | KEEP | authoring-refusal.ts; docs/agents/authoring-refusal-cascade.md; http.md; doc |
| 0077 | 198 | 40 | 10 | 20 | 30 | 3 | CONSOLIDATE | CONTEXT.md Meta Space; src/startup/default-content.ts |
| 0078 | 697 | 60 | 0 | 15 | 25 | 10 | KEEP (with 0094/0095/0096 folded in) | test/support/repository-contract.ts; src/persistence/space-repository.ts; CONTEXT.md |
| 0088 | 835 | 25 | 5 | 0 | 70 | 3 | CONSOLIDATE | CONTEXT.md; doc; current-domain-vocabulary.test.ts |
| 0094 | 308 | 65 | 0 | 0 | 35 | 4 | KEEP (short) - or fold into 0078 consolidation | doc CLI bullet; src/import/import-aggregate.ts |
| 0095 | 749 | 45 | 5 | 5 | 45 | 6 | CONSOLIDATE | AGENTS.md ADR 0095 entry; sql-store.ts; revision-codec.ts |
| 0096 | 371 | 30 | 0 | 0 | 70 | 3 | CONSOLIDATE (keep as a one-line 'do not' guard) | ADR only (+1 AGENTS clause); aggregate-lifecycle.ts |
| 0098 | 572 | 55 | 0 | 0 | 45 | 5 | KEEP | http-protocol.ts:717; (http.md?) |
| 0019 | 513 | 5 | 0 | 70 | 25 | 1 | ALREADY-SUPERSEDED | - |
| 0029 | 905 | 0 | 0 | 75 | 25 | 0 | ALREADY-SUPERSEDED | leave-guard.ts (guard only) |

Totals: 16 live-status ADRs = 9,447 words (10,865 with 0019/0029). Word-weighted: LIVE+STALE ~49%, HISTORY ~42%, OVERTAKEN ~9%. 83 distinct live decisions. The oldest four (0016, 0018, 0028, 0030) are where the hypothesis holds: 15-35% live each. The newer ones (0078, 0094, 0098, 0056, 0057, 0042) are 55-65% live; their bulk is rejected-alternatives and "why", not obsolete rules. 0088 and 0096 are mostly narrative around a 2-3 line rule.

## Per-ADR live decisions (current vocabulary)

### 0016 - ARCHIVE (rejected) - but extract its one live rule first
- An entity has exactly one id; no second identifier beside it (the one id is now a UUID, per 0030).
- Tests never mock crypto.randomUUID; nondeterminism is owned by the code and supplied at composition, never controlled by a global mock.
- _Notes:_ Body is the rejected argument (two ids, UUIDv5 derivation from file path, UUIDv7). Optional-ids half was carried by 0019, itself superseded by 0030. Cited ~20 times in live source (compose-app.ts, open-spaces.ts, space-authoring.ts, continuation.ts, browser-location.ts, titles.ts, identify-space.ts, new-space.ts, test/minting.ts) and in AGENTS.md as the authority for 'inject newId/reporter at composition, required with no default' - a rule this ADR does not state. Only its mock-rejection paragraph supports that. Rule really lives in AGENTS.md Conventions + packages/app/test/minting.ts.

### 0018 - CONSOLIDATE
- With nothing else to open, the starting state is a new Space: one Resource, not an empty canvas and not the test fixture.
- The one Resource is framed centred by the camera (stored position is the origin; centring is a camera fit, see camera.ts).
- _Notes:_ 'Gets a Layout the moment it opens (0017)' and 'has no routes' are overtaken: 0079/0080 give a new Space a complete Map 1 with one empty Graph. Rule lives in CONTEXT.md:13, packages/graph/src/new-space.ts (initializeSpace/newSpace), packages/app/e2e/new-space.spec.ts, camera.ts:42.

### 0028 - CONSOLIDATE
- Activating a Graph is navigation, not an Edit: it submits nothing and does not persist on its own.
- A Map's absent activeGraph resolves on read to its first Graph; that fallback is never written back by itself.
- The next real Edit writes Navigation's current Active Graph into the Map's activeGraph explicitly (updatePositionedMap).
- A Graph created by an Edit is set active explicitly in that same Edit.
- _Notes:_ The 'space with no Layout has nowhere to record it / activation would convert' rationale is overtaken (every Space has a Map since 0079). 'First edge mints the route' overtaken (a Map owns >=1 Graph, 0040). Held by space-authoring.ts:1074 comment, navigation.ts:339, core schema.ts:395, doc bullet 'Graph activation is not an edit and does not submit'.

### 0030 - CONSOLIDATE
- A SQL database (PostgreSQL by default, SQLite opt-in per 0095) is the live write model; every completed Edit persists automatically and there is no Save action.
- Files are not the working copy: they enter only by CLI import and leave only by CLI export; the browser reaches persistence only over HTTP.
- Export is CLI-only, canonical rather than byte-preserving, and records the revision it projected (markExported).
- An id is optional only in import input; an explicit id must be a UUID; missing ids are minted at the aggregate-directory read boundary (identify-space.ts).
- An imported aggregate is self-contained: stored state cannot supply anything it omits.
- Prisma Next supplies the contract-first runtime and migrations behind the repository seam, version-pinned.
- _Notes:_ Overtaken: version-2 document, Routes/Layouts nested in Space doc, Space-scoped Route id reuse rules, 'insert-only importer rejects any existing identity' (now initializeAggregate/replaceAggregate, 0078), '--dangerous-truncate deletes all' (now replaceAggregate authorized by Meta identity, 0094), 'Space id comes from spaces.id column default' (import now mints via newId in identify-space.ts; column default dbgenerated(gen_random_uuid()) survives unused in contract.prisma), PostgresSpaceRepository (deleted, 0095), 'memory adapter lands first'. Implementation-status section is build chatter.

### 0035 - KEEP (re-vocab) / CONSOLIDATE
- An Edit is a validated transition from one Space to another; Authoring is the interaction that may produce one.
- Space Authoring is one framework-neutral deep module in packages/app owning eligibility, derivation, validation, id minting, optimistic submit, retry, conflict acceptance, reentrant completion and publication; React/React Flow types do not cross it.
- An editor installs its authoritative completed state first, then notifies with the completed authored fact only (no snapshot, ids-to-be, or plan).
- SpaceSession.working is the sole authoritative authored snapshot; Navigation holds no second Space copy.
- Installation order: placement, then working Space, then Navigation; external subscribers see one publication per Edit.
- A reentrant completion is queued and derived from the fully installed prior state.
- Observer notification is non-throwing; only a failure to derive a valid Space rejects synchronously; persistence failure is async state and never disables Authoring.
- Ids are minted only when their Edit succeeds; nothing reserves a future id.
- Accepting the stored Space after a conflict is a replacement, not an Edit, and does not remount the app.
- _Notes:_ Overtaken: Navigation owns 'selected renderer' (0079 removed renderers) and 'opened Card' (0064 put Open/Closed on the Map); Algorithmic View conversion; first Route mint; 'Space Authoring is the only module allowed to mutate the session' is narrowed by 0076's Space Resource lifecycle, which coordinates sessions itself. Much restated in doc 'Authoring installs a completed Edit atomically' and 'The install gate counts depth'.

### 0042 - KEEP
- An unfinished interaction's state is an Interaction draft owned locally by its surface; it is never a partial Space, and cancelling needs no compensating Edit.
- A completed semantic operation crosses Space Authoring once, is derived from the current working Space, installed optimistically and is then authoritative (Escape cannot undo it; persistence failure does not roll it back).
- Creation completes before its follow-up title field opens; cancelling that rename keeps the entity.
- Outcomes are completed / unchanged / refused; broken invariants still throw.
- Pending persistence never locks Authoring; Retry and Keep local commit the newest local snapshot.
- Accept stored validates first, then installs session, placement, Navigation and an advanced replacementEpoch as one publication; a refusal changes nothing.
- Every draft owner discards on replacementEpoch change; the epoch is invalidation, not a registry.
- Queued reentrant completions record the epoch and are discarded, not derived, if it has changed.
- Retry, Keep local, status changes and ordinary Edits do not advance the epoch.
- No Draft Space beside the validated Space; no central draft coordinator.
- _Notes:_ Overtaken: 'Alias creation remains a local picker draft until a target' (0089 - Reference Resource is created from its Target; no picker). Stale: Card, Alias. Doc 'install gate' bullet restates the epoch/drain rules in more depth and records that draft invalidation is unevenly built; test: packages/app/test/replacement-invalidation.test.tsx.

### 0054 - CONSOLIDATE (fully restated and generalised by 0056)
- No backwards compatibility for document shapes: a format change rolls schema, fixtures, examples and tests forward in one change.
- This does not remove relational schema management: migrations/ and the Prisma Next contract still define and apply the SQL schema.
- _Notes:_ Every live sentence is repeated in 0056. docs/adr/README.md's binds line ('adds no migration') inverts the ADR's own boundary sentence.

### 0056 - KEEP
- Only two environments (clone, CI); every database, directory and generated artifact is derived from tracked sources.
- Generated state disagreeing with its generator is a bug fixed at the source, never taught to a reader.
- No compatibility path for state a previous build wrote: no transitional read, aliased key, version bump, or refusal naming the retired shape.
- Boundary: migrations, the contract and SPACE_FILE_VERSION remain; documentRefusal keeps its refusals for versions this build cannot read or shapes a current producer can write.
- Bootstrap and hard reset must stay cheap.
- Exception (0106): an Image Resource's picture bytes are not repository-derived.
- _Notes:_ Stale: example rename 'defaultView to defaultRenderer (ADR 0055)'; the doc tells the same story as 'defaultView -> defaultLayout' - the two disagree on the example. Held in AGENTS.md intro, doc bullet 1, core schema.ts strictObject comment.

### 0057 - KEEP
- An expected failure crosses every seam as a stable code with typed context, never prose.
- AuthoringRefusal is a closed discriminated union; the domain names no form field, HTTP status or sentence.
- The application maps each code to wording, field attribution and recovery; a broken invariant throws.
- Persistence failure codes get application-owned copy; CommitResult failure arms carry no message; a protocol failure carries a typed ProtocolFault.
- Retryable failure, permanent rejection and conflict remain Space-level persistence states, not duplicated in the editor.
- HTTP errors are RFC 9457 Problem Details; `type` is the wire identity, title/detail are never branched on; extensions may carry coded errors with JSON Pointers.
- The HTTP adapter decodes Problem Details once into CommitResult; 409 may carry the current LoadedSpace as recovery value.
- The stored seam's RepositoryCommitResult keeps rejected.message (sent as problem.detail, not carried by the browser adapter).
- _Notes:_ Stale: card-title-required (now resource-title-required, core/src/title.ts), alias-target-not-found (now reference-target-not-found), 'workspace'. Held in authoring-refusal.ts, docs/agents/authoring-refusal-cascade.md, docs/agents/http.md, doc bullet on completed/unchanged/refused.

### 0077 - CONSOLIDATE
- First initialization creates the Meta Space from one deterministic generated aggregate (Default Content, a fixture label, not a domain term).
- Generated content is ordinary authored state: not protected, repaired or re-added on load; an empty Meta Space is valid.
- No merge-style seed, no silent reseed, no browser reset control; destructive administration is CLI-only.
- _Notes:_ The 'OVERTAKEN' share here is really UNBUILT: 'concise examples of the V1 kinds' (default-content.ts is still newSpace() named Meta, pending v1-release/16) and 'the same generator supplies an explicit CLI hard reset ... confirmation or forced' (the CLI has only `hyper <path> --dangerous-truncate`; no reset command, no confirmation, no --force). README binds line claims 'CLI hard reset restores' it. Stale: Cards, Layouts.

### 0078 - KEEP (with 0094/0095/0096 folded in)
- The server-side SpaceRepository owns Meta establishment, validated complete reads, integrity-affecting commits and administrative replacement; no separate Meta lifecycle interface; the browser seam exposes neither.
- Two named doors, no mode parameter: initializeAggregate and replaceAggregate, each taking a complete aggregate with explicit metaSpaceId; Meta is never inferred.
- All repository implementations pass one behavioural contract; a differing observable outcome is a defect.
- Uninitialized = no Spaces and no Meta; loadAggregate answers uninitialized or a validated loaded aggregate; contradictory stored state is an invariant failure on read and initialize.
- initializeAggregate answers initialized / existing (identical concurrent proposal) / already-initialized (different) / aggregate-refused; identity compares canonical authored meaning, ignoring id-keyed inventory order.
- replaceAggregate answers uninitialized on an empty repository (first state only via initialize), requires the expected Meta identity and conflicts when stale.
- Inputs carry no revisions; the repository assigns fresh revisions and returns what it established.
- Replacement and an incompatible commit cannot both succeed; two authorized replacements may serialize, later wins, never partial.
- CLI confirmation/authority is outside the repository interface.
- importSpaces(input, mode) is retired; seeds, fixtures and tests use the same two doors.
- _Notes:_ Overtaken: 'topology-preserving Edit keeps its unlocked fast path' - the fast path now takes the aggregate lock in shared mode (lockAggregateShared, ticket 42); 'contradictory state is an invariant failure for replaceAggregate too' (0094); 'each adapter supplies its own atomicity... future SQLite adapter its own mechanisms' (0095 for SQL). Held by test/support/repository-contract.ts, src/persistence/space-repository.ts, aggregate-lifecycle.ts. Doc covers only the 'importSpaces gone' part and the lock detail.

### 0088 - CONSOLIDATE
- 'Aggregate' means only the complete Meta-rooted collection {metaSpaceId, spaces}; it contains Meta and is not Meta.
- One Space plus its Resources is a Space snapshot; the stored Meta pointer is the Meta identity row.
- current-domain-vocabulary.test.ts bans validateSpaceAggregate and the two retired phrases; aggregate-refused keeps its wire name.
- _Notes:_ Three-senses survey, collision narrative and code-rename list are history (renames done: preservesSnapshotBoundary, loadStoredSpace in sql-space-repository.ts). Fully restated in CONTEXT.md and doc bullet 'Aggregate has one meaning'. Stale: 'Space Thing'.

### 0094 - KEEP (short) - or fold into 0078 consolidation
- --dangerous-truncate replaces whatever is stored, valid or not (Spaces without Meta, failed intake, unparseable documents).
- Replacement is authorized by the Meta identity read with loadMetaSpaceId (unvalidated), never loadAggregate; a different identity at write is conflict.
- Reading and initializing still fail contradictory state; an invalid proposal is refused before deletion; an empty repository is still uninitialized to replace and the CLI then initializes.
- Replacement is never unconditional.
- _Notes:_ Fully restated in doc bullet 'The CLI's unit is the complete aggregate'. Held by src/import/import-aggregate.ts, integration tests.

### 0095 - CONSOLIDATE
- PostgreSQL and SQLite share one SqlSpaceRepository owning row mapping, Meta lifecycle, commit procedure and outcome mapping; each database supplies only a small SqlStore value, and a new SqlStore member needs a reason.
- Memory keeps its own candidate-state implementation.
- decideCommit in @project/persistence is the one place a change set is validated, for SQL, MemorySpaceRepository and MemorySpaceBackend; the SQL fast path runs only after the same identity refusal and hands intake failures to the complete decision.
- SQLite's serialise queue is the only concurrency behaviour varied by database; statements inside a transaction stay sequential.
- Revision is canonical non-negative decimal TEXT on both databases through one codec with a 2^63-1 ceiling; never via Number.
- Shared tables are typed by a structural type (property syntax, no optional row fields, documents unknown) each ORM must satisfy without a cast.
- _Notes:_ SqlStore member list in the ADR is incomplete: code adds lockAggregate, lockAggregateShared (ticket 42) and isUnavailable (ticket 38). Measurement, drift story and Prisma v8 rejection are history. Detail lives in AGENTS.md's ADR 0095 entry (more than the ADR) and the doc's revision bullet.

### 0096 - CONSOLIDATE (keep as a one-line 'do not' guard)
- initializeAggregate/replaceAggregate decide their outcome inside each repository; there is no pure decideInitialize/decideReplace.
- classifyInitializedAggregate (src/persistence/aggregate-lifecycle.ts) is the only shared lifecycle function; spaceRepositoryContract runs the lifecycle against every repository.
- Revisit if a third lifecycle outcome or a third stored implementation appears, or the contract stops covering every repository.
- _Notes:_ Not restated in the doc at all; AGENTS.md mentions it in one clause. Verified: no decideInitialize/decideReplace in src or packages.

### 0098 - KEEP
- CommitOutcome (committed | conflict | aggregate-refused) is declared once in @project/persistence and shared by both seams.
- RepositoryCommitResult = CommitOutcome + rejected; CommitResult = CommitOutcome + client transport failures; neither restates the other.
- Each outcome's HTTP status is one exhaustive table (satisfies Record<CommitOutcome['kind'],...>) read by both the Hono route and the browser transport; the route matches in an exhaustive switch.
- The route pairs body and status at each context.json call (Hono typed-client inference).
- The wire codec decodes shape only; the commit identity rule belongs to the store's decideCommit alone.
- _Notes:_ Not restated in the doc; partially in docs/agents/http.md (not checked in depth). Held by packages/persistence/src/http-protocol.ts:717-733.

### 0019 - ALREADY-SUPERSEDED
- (survives only via 0030) ids are optional in import input and filled in at the read boundary.
- _Notes:_ Deterministic on-load generation and 'short readable id' are dead. Still cited as live in packages/core/src/schema.ts:464 ('Required today; ADR 0019 makes ids optional ... this is the field that becomes optional') and packages/graph/src/space.ts:37.

### 0029 - ALREADY-SUPERSEDED
- (none)
- _Notes:_ Explicit Save reversed by 0030. The beforeunload guard idea survives independently (packages/app/src/leave-guard.ts; doc bullet). No live-source citations found outside docs/adr, .scratch, specs and the status-block test.

## Consolidated "current design" outline (persistence & the Edit lifecycle)

Target ~2,000-2,400 words (vs 9,447 source ADR words, ~22-25%; vs 10,865 incl. superseded, ~20%). Each item: rule -> source ADRs -> what holds it.

**1. State is derived (0054, 0056, 0106)**
- Two environments; every DB/directory/artifact is minted from tracked sources; image bytes are the one exception. -> AGENTS.md intro.
- Format change = schema+fixtures+tests+generators in one change; no transitional read, alias, version bump or retired-shape refusal. -> core `spaceFileObjectSchema` is `strictObject`.
- Boundary: relational migrations, Prisma contract, `SPACE_FILE_VERSION`, and `documentRefusal`'s current refusals stay. Reset must stay cheap.

**2. The live write model (0030, 0095)**
- SQL database is the working copy (PostgreSQL default, SQLite opt-in); every completed Edit persists automatically; no Save. `leave-guard.ts` asks only while persistence is unsettled.
- Files move only through the CLI: `hyper <path> [--dangerous-truncate]`, `hyper export <dir>`; unit is the whole aggregate (`hyper.json` + `<space-uuid>/`); export is canonical and records `markExported` after the destination lands.
- Ids optional only in import input; minted at `identify-space.ts` from an injected `newId`.
- Browser reaches persistence only over HTTP.

**3. Vocabulary (0088)** — aggregate = `{metaSpaceId, spaces}` (contains Meta, is not Meta); one Space = Space snapshot; Meta identity row. -> CONTEXT.md, `current-domain-vocabulary.test.ts`.

**4. Repository lifecycle (0078, 0094, 0096, 0077)**
- `SpaceRepository` (server) extends `StoredSpaceRepository` (browser-safe) with `initializeAggregate`, `replaceAggregate`, `loadMetaSpaceId`, `markExported`; no mode parameter; Meta never inferred.
- Outcomes table: load -> uninitialized|loaded; initialize -> initialized|existing|already-initialized|aggregate-refused (canonical-meaning compare, `classifyInitializedAggregate`); replace -> replaced|uninitialized|conflict|aggregate-refused.
- Contradictory stored state: invariant failure on read/initialize; `--dangerous-truncate` replaces it anyway, authorized by `loadMetaSpaceId`; never unconditional.
- Inputs carry no revisions; replacement vs commit cannot both succeed; later of two replacements wins, never partial.
- Lifecycle decision stays inside each repository (no `decideInitialize`); revisit conditions.
- First init seeds Meta from one deterministic Default Content aggregate; ordinary authored state, never reseeded. (Flag as partly unbuilt.)
- One behavioural contract for every repository -> `test/support/repository-contract.ts`.

**5. One SQL repository (0095)** — `SqlSpaceRepository` over a small `SqlStore` (list current members incl. `lockAggregate`, `lockAggregateShared`, `isUnavailable`); memory separate; revision TEXT codec; structural table typing rules; fast path + shared lock; failure classification (unavailable/unclassified) -> AGENTS.md entry.

**6. The commit seam (0098, 0057, 0095)**
- `CommitOutcome` shared; `RepositoryCommitResult`/`CommitResult` extend it; one exhaustive status table; route switch; codec decodes shape only; `decideCommit` is the one validator.
- Errors cross seams as codes + typed context; Problem Details `type` is the wire identity; app owns copy; `ProtocolFault`. -> http.md, authoring-refusal.ts.

**7. The Edit lifecycle (0035, 0042, 0057)**
- Edit vs Authoring; Space Authoring deep module; editor installs then notifies with a fact; `SpaceSession.working` sole authority; one publication per Edit; reentrant completions queued; non-throwing observers; only derivation failure throws synchronously.
- completed/unchanged/refused; refusal codes catalogue -> authoring-refusal-cascade.md.
- Drafts local; persistence never locks Authoring; Retry/Keep local send newest snapshot.
- Accept stored = validated replacement + `replacementEpoch`; drafts and queued completions discard on epoch change; epoch is not a registry. -> replacement-invalidation.test.tsx.

**8. Navigation is not an Edit (0028, 0079)** — Graph activation and Map selection submit nothing; `activeGraph`/`defaultMap` fall back on read and are written by the next real Edit; a created Graph is set active in its own Edit.

**9. New Space & identity (0018, 0079/0080, 0016-rule)** — new Space = one Resource in Map 1 with one empty Graph, camera-centred; ids minted from composition-injected `newId`, never by mocking `crypto.randomUUID`.

## Is docs/agents/editing-and-persistence.md already the consolidated form?

**No, though it is the better starting point.** Estimate: of the 83 live decisions above it restates ~40 (~50%), sometimes in far more depth than the ADRs (fast-path shared lock, coordinated recovery, install-gate depth counting, epoch drain). But:
- **Missing entirely:** 0078's lifecycle outcomes, canonical compare, revision assignment and replacement concurrency; 0096; 0098 (CommitOutcome/status table); 0077; 0018's new-Space rule except via the 0079 bullet; most of 0028 (one sentence).
- **Out of scope for this cluster:** ~60% of its 5,220 words are Map/Graph model, resource-file format, Space Resource lifecycle (0076) and coordinated recovery — other clusters.
- **Not "nothing historical":** it carries ticket numbers (`code-quality/22-24`, `v1-release/17`, `database-persistence ticket 42`), "used to" lineage, and a self-declared stale preamble ("References below to Reference Resource retargeting describe the superseded surface").
- **Split authority:** the SQL repository's detail lives in AGENTS.md's ADR 0095 entry, not here; Problem Details in http.md; refusal codes in authoring-refusal-cascade.md.
A consolidated doc would pull sections 1-9 above out of the doc + AGENTS.md entries and leave the gotcha detail beside it.

## Drift and contradictions

1. **Rejected ADR 0016 is the live authority for a rule it does not state.** ~20 live source sites (compose-app.ts:32/57/145, open-spaces.ts:222/530, space-authoring.ts:548, continuation.ts:101, browser-location.ts:19, embedded-authoring.ts:67, titles.ts:62, new-space.ts:118, identify-space.ts:70, tests/minting.ts) plus AGENTS.md cite "ADR 0016" for "inject nondeterminism at composition, required with no default". 0016's body only rejects mocking `crypto.randomUUID`; "required, no default" and the reporter rule appear in no ADR in this cluster. `titles.ts:62` and `space-authoring.ts:1263` cite it for "a title is not an identifier", which is a stretch of its file-name argument.
2. **Superseded 0019 cited as live:** `packages/core/src/schema.ts:464` says "Required today; ADR 0019 makes ids optional and generated on load, and this is the field that becomes optional" — 0019 is superseded; ids are optional only in the import schema and minted at `identify-space.ts`. `packages/graph/src/space.ts:37` cites 0019 for Space id.
3. **README binds line for 0054 inverts it:** "a format change rolls forward and adds no migration" — 0054/0056 both say the opposite for relational schema (not licence to skip a migration; `migrations/app/*rename_card_to_thing` exist).
4. **0077 + README claim a CLI hard reset that does not exist.** CLI usage is only `hyper [<aggregate-path>] [--dangerous-truncate]` / `hyper export`; no reset command, no interactive confirmation, no `--force` (0078 also assigns these to the CLI). Default Content is still `newSpace()` renamed Meta (default-content.ts says so, pending v1-release/16).
5. **0078 "unlocked fast path"** — code now takes the aggregate advisory lock in shared mode on the fast path (`SqlStore.lockAggregateShared`, ticket 42). Not recorded in any ADR; only in doc/AGENTS.
6. **0095's SqlStore member list is stale:** code adds `lockAggregate`, `lockAggregateShared`, `isUnavailable`; the ADR says each added member "needs a reason" but those reasons live only in AGENTS.md/tickets.
7. **0030 "a Space's id comes from the spaces.id column default"** — ids are now minted in-process at import; `contract.prisma` still declares `@default(dbgenerated("gen_random_uuid()"))`, apparently unused by the import path (not exhaustively verified for every insert).
8. **0035 "Space Authoring is the only module allowed to mutate the session"** — narrowed by 0076 (Space Resource lifecycle coordinates sessions); 0035 carries no pointer beyond "Refined by: 0076".
9. **0056 vs doc disagree on the example rename:** ADR says `defaultView` -> `defaultRenderer` (ADR 0055); doc says `defaultView` -> `defaultLayout`.
10. **0018 "centered rather than at the origin"** — the stored position is `{x:0,y:0}` (new-space.ts:104); centring is a camera fit (camera.ts:42). Live meaning survives, literal claim is about the viewport.
11. **0042's "Alias creation remains a local picker draft"** is overtaken by 0089 (created from its Target, no picker) with no note in 0042.
12. 0029 is clean: no live citations. 0028 is still cited as live in code and correctly so.
