# Local-first architecture options — landscape survey (late 2026)

Research note, 2026-07-22. **This informs a human/model decision; it does not pre-empt
one.** It is a scan of the real options a project like `hyper` would choose between if it
ever grows a mutable edit buffer ("Draft") and, later, sync — not a recommendation to
adopt any of them now. Every non-obvious claim is cited to a primary source (official
docs, repos, first-party blogs, release notes). Where I could only reach a secondary
source or couldn't verify a version, it's flagged.

`hyper` today: single-user, file-first (one validated JSON space file at intake), strict
TypeScript, React + Zustand + TanStack Router + Vite + Zod. So the lens throughout is:
**web/TS-native, single-user-first, with a credible-but-optional path to offline/multi-user
sync, and where document/graph-shaped data fits.**

---

## TL;DR

1. **"Local-first" is a 2019 Ink & Switch term with 7 ideals** (fast, multi-device,
   offline, collaboration, longevity, privacy, user control). It has since drifted to mean,
   loosely, "the client has a real local database and syncs in the background" — often
   without the privacy/longevity/ownership ideals the essay led with. Keep the two senses
   separate. ([inkandswitch.com](https://www.inkandswitch.com/essay/local-first/))

2. **The field has split into two families.** (a) **CRDT libraries** — you own merge and
   networking: Yjs (13.6.x, ubiquitous), Automerge 3 (Rust/Wasm core, ~10x lighter than
   v2, July 2025), Loro (1.13.x, Rust, Fugue text + movable tree). (b) **Sync engines /
   local-first databases** — a product that gives you a local queryable store + a sync
   protocol + (usually) a backend: ElectricSQL, Zero, PowerSync, Jazz, Triplit, InstantDB,
   LiveStore, TanStack DB, plus Convex (server-authoritative contrast) and tldraw sync
   (canvas-specific).

3. **Several of these reached 1.0 / GA in 2026**, which is the single biggest change from
   their 2024 state: **Zero 1.0** (~June 2026, Rocicorp), **Triplit 1.0** (now a Supabase
   project), PowerSync v1.0, Automerge 3 (2025). Yjs and Automerge are the mature, boring,
   safe end. Zero, Jazz, LiveStore, TanStack DB are newer and moving fast.

4. **Backend requirement is the main axis for the engines.** Electric/Zero/PowerSync sync
   *from your Postgres* (Electric and Zero add a sync service; PowerSync supports
   Postgres/MongoDB/MySQL/SQL Server). Jazz/Triplit/Instant/Convex are *their own backend*
   (hosted, some self-hostable). This matters a lot for a file-first app that has **no
   server today**.

5. **The conflict model splits query-sync vs CRDT.** Electric and Zero are **read-path
   query sync** — server (Postgres) stays authoritative, writes go through your API, and
   they do *not* do CRDT merge. PowerSync uses buckets + a server-authority reconciliation.
   Jazz/Triplit/Yjs/Automerge/Loro/LiveStore are genuinely CRDT- or event-merge-based and
   converge offline peers automatically. Convex is server-authoritative and **not** offline-
   first on its own.

6. **On persistence primitives, OPFS + SQLite-Wasm is now the credible durable-local-DB
   path**, but with real footguns (SharedArrayBuffer / COOP+COEP headers, Safari incognito
   gaps). `hyper`'s current filesystem-JSON approach is the simplest durable option and is
   fine until query/scale/partial-load pressure appears.
   ([powersync.com](https://powersync.com/blog/sqlite-persistence-on-the-web))

7. **Fit for `hyper` today:** its shape (single-user, small JSON doc, wants
   longevity/ownership, might one day sync) points at the **CRDT-library** family —
   specifically **Automerge (via Automerge-Repo)** or **Yjs** — over any sync-engine, because
   those keep the "no server, file is the source of truth" property and add sync only when
   you plug in a network adapter. The sync engines mostly assume a backend `hyper` doesn't
   have. See the last section. **This is a starting hypothesis, not a decision.**

---

## 1. What "local-first" means

The canonical definition is the Ink & Switch essay **"Local-first software: You own your
data, in spite of the cloud"** (Kleppmann, Wiggins, van Hardenberg, McGranaghan, 2019). It
proposes **seven ideals**: (1) no spinners / fast, (2) multi-device, (3) offline,
(4) collaboration, (5) longevity ("the software should work indefinitely"),
(6) privacy (E2E encryption), (7) user control / ownership. Its core argument: cloud apps
give collaboration but sacrifice ownership and longevity; "old-fashioned" files give
ownership but not collaboration; the essay wants both, and nominates **CRDTs** as the
enabling technology. ([inkandswitch.com/essay/local-first](https://www.inkandswitch.com/essay/local-first/))

Ink & Switch has kept working the thesis rather than restating it: Automerge is their
CRDT; more recent lab work (Patchwork, and 2025 essays on "restoring user agency in a
world of locked-down apps") continues it, and they are explicit that CRDT libraries do
**not** yet fully realise the ideals — "more work is still required."
([inkandswitch.com/essay](https://www.inkandswitch.com/essay/), [inkandswitch.com](https://www.inkandswitch.com/))

**Drift to watch.** In 2025-2026 marketing, "local-first" increasingly means only ideals
1-4 (fast/offline/multi-device/collab) — a local cache that syncs — while 5-7
(longevity, privacy, ownership) quietly drop off, because most sync engines route through
a vendor backend and a proprietary protocol. PowerSync's own history-of-the-term post is a
useful primary-ish marker of this broadening. ([powersync.com](https://powersync.com/blog/local-first-software-origins-and-evolution))
For `hyper`, whose CLAUDE.md leans on "you own your data / file is the source of truth,"
the *original* seven-ideal sense is the relevant one — and that biases toward CRDT
libraries with a file/local storage story over vendor-backed sync services.

---

## 2. CRDT libraries (you own merge + networking)

These give you a mergeable data type and leave storage/networking to you (or to a
companion "repo"/provider layer). No mandatory backend; sync is whatever transport you plug
in. Best fit when the *document* is the unit and you want ownership/longevity.

### Yjs — the incumbent
- **Data model:** shared types `Y.Map`, `Y.Array`, `Y.Text`, `Y.Xml`, nestable into a
  `Y.Doc`. Changes are transactional and observable. ([docs.yjs.dev](https://docs.yjs.dev/api/y.doc), [docs.yjs.dev/getting-started](https://docs.yjs.dev/getting-started/working-with-shared-types))
- **Maturity / TS:** very mature, `yjs@13.6.31` (latest as of ~mid-2026; 13.6.30 was
  2026-03-14), ships types. The de-facto CRDT behind most collaborative editors (ProseMirror/
  TipTap, Monaco, etc.). ([npmx.dev/package/yjs/versions](https://npmx.dev/package/yjs/versions) — npm registry direct fetch was 403; version corroborated via npmx and version-checker mirrors, flag: mirror not first-party)
- **Storage/sync:** modular **providers** — network (`y-websocket`, `y-webrtc`) combined
  with persistence (`y-indexeddb`); any providers compose. You bring the server (a websocket
  relay) or go P2P. ([docs.yjs.dev/getting-started](https://docs.yjs.dev/getting-started/working-with-shared-types))
- **Tradeoffs:** smallest/most battle-tested, but the model is lower-level (you design your
  schema out of shared types), it keeps tombstones/history that grow, and rich structured
  querying isn't its job. Great for text/canvas; more manual for app state.

### Automerge (+ Automerge-Repo) — the ownership-first choice
- **Data model:** JSON-like document CRDT — maps, lists, text, rich text, counters — mergeable
  concurrently without a central server. Implementations in **JS, Rust, Swift** with TS types;
  the Rust core compiles to Wasm for the browser. ([automerge.org/docs/hello](https://automerge.org/docs/hello/), [github.com/automerge/automerge](https://github.com/automerge/automerge))
- **Maturity:** **Automerge 3.0 shipped July 2025** — same file format as v2, near-full API
  back-compat, and **>10x lower memory** (their example: pasting *Moby Dick* went ~700 MB →
  ~1.3 MB). v3 is the default when you install current `@automerge/automerge-repo` / `@automerge/react`.
  ([automerge.org/blog/automerge-3](https://automerge.org/blog/automerge-3/))
- **Automerge-Repo:** the "batteries-included" layer — manages many docs, with **pluggable
  storage adapters** (IndexedDB, filesystem/Node) and **network adapters** (WebSocket,
  BroadcastChannel, MessageChannel), plus the sync protocol. Currently `automerge-repo`
  ~v2.6.x (2026). ([automerge.org/automerge-repo](https://automerge.org/automerge-repo/), [automerge.org/blog/automerge-repo](https://automerge.org/blog/automerge-repo/), [github.com/automerge/automerge-repo](https://github.com/automerge/automerge-repo))
- **Tradeoffs:** the most "local-first in the Ink & Switch sense" option — filesystem
  storage adapter means the *file stays the source of truth* and sync is additive. Wasm core
  is a build consideration. Slightly heavier conceptually than Yjs for pure text.

### Loro — the strong newer entrant
- **Data model:** Rust CRDT with Text, List, **MovableList**, Map (LWW), **MovableTree**,
  Counter; uses the **Fugue** algorithm to minimise text/list interleaving; ships `loro-crdt`
  for JS/Wasm. Has version-control-style features (frontiers/checkout, shallow snapshots) and
  an ephemeral store for presence. ([loro.dev](https://www.loro.dev/), [github.com/loro-dev/loro](https://github.com/loro-dev/loro/releases))
- **Maturity:** **1.x stable** (reached 1.0 in 2024); `loro-crdt` at ~**1.13.x** in mid-2026,
  with recent releases focused on memory + text-edit performance. ([github.com/loro-dev/loro/releases](https://github.com/loro-dev/loro/releases) — exact patch date uncertain: the fetched release page returned inconsistent dates, flag)
- **Tradeoffs:** the **MovableTree** is genuinely interesting for a *graph/tree-shaped* doc
  like `hyper`'s cards/routes — moving a node concurrently is a known CRDT pain point Loro
  targets directly. Younger ecosystem than Yjs/Automerge; fewer turnkey providers.

**CRDT family summary for `hyper`:** all three keep the "no server required, document is the
artifact" property. Automerge-Repo's filesystem adapter and Loro's movable tree are the two
most directly relevant capabilities.

---

## 3. Sync engines / local-first databases

These bundle a local queryable store + sync protocol + (usually) a backend. Bigger leap
for `hyper` because most assume a server it doesn't have. Grouped by conflict/sync model.

### Query-sync over Postgres (server stays authoritative, no CRDT)

**ElectricSQL / "Electric"** — a **read-path sync engine for Postgres**. Its unit is a
**Shape** (a filtered/parameterised query, incl. subqueries + composite keys) synced to
clients **over HTTP**, CDN-friendly. Writes are **not** Electric's job — they go through
*your* API to Postgres; Electric is explicitly **not CRDT-based**. Pairs with **PGlite**
(embedded Postgres in Wasm) client-side. Notable in 2026: the project **rebranded/moved to
`electric.ax`** and repositioned messaging toward **AI-agent / "durable sessions for
collaborative AI"** use cases, though the Postgres-read-sync core is unchanged. Open source,
self-hostable, plus Electric Cloud. ([electric.ax/docs/intro](https://electric.ax/docs/intro), [electric-sql.com/docs/intro](https://electric-sql.com/docs/intro), [github.com/electric-sql/electric](https://github.com/electric-sql/electric))

**Zero (Rocicorp)** — general-purpose web sync engine. Queries in **ZQL** (a streaming,
incrementally-executed query language) run **against the local store first** (instant), then
authoritative results sync from **`zero-cache`**, a read replica of your **Postgres**. Writes
use **custom mutators** with optional server verification; permissions run server-side.
**Zero 1.0 shipped ~June 2026** — its first stable release after ~2 years and 50+ pre-releases;
1.0 itself was a *symbolic, non-breaking* bump over 0.26.2 signalling API-stability commitment.
Open source + self-hostable, with a managed cloud. ([zero.rocicorp.dev](https://zero.rocicorp.dev/), [zero.rocicorp.dev/docs/release-notes/1.0](https://zero.rocicorp.dev/docs/release-notes/1.0), [infoq.com (secondary, for the GA framing)](https://www.infoq.com/news/2026/06/zero-version-1/))
*Conflict/offline note:* client-first with server-authoritative reconciliation; strong for
"instant apps," less oriented to long-offline divergent editing than a CRDT engine.

**TanStack DB** — a reactive client store (not a backend). Data lands in **collections**;
**live queries** update **incrementally via a TS implementation of differential dataflow**
(sub-ms); **optimistic mutations** tie into whatever sync you attach. Collections can be fed
by ElectricSQL, PowerSync, plain fetches, or local data; ElectricSQL is pushing **query-driven
sync** through it (progressive per-navigation loading). At **0.5.x** in 2026 — new but from the
TanStack team. ([tanstack.com/db/latest/docs](https://tanstack.com/db/latest/docs), [tanstack.com/blog/tanstack-db-0.5-query-driven-sync](https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync), [electric-sql.com/primitives/tanstack-db](https://electric-sql.com/primitives/tanstack-db))
*Relevant to `hyper`:* it's the closest thing to "a better Zustand for synced data," and it
composes with a sync source rather than being one — so it could sit **in front of** any
backend choice, or none.

### Bucket sync (server-authority reconciliation)

**PowerSync** — replicates from a **source DB (Postgres, MongoDB, MySQL, SQL Server, or
Convex)** into a server-side **bucket** store (MongoDB or Postgres as bucket storage) and
streams buckets to a **client-side SQLite** DB (schemaless, exposed as SQLite views). Client
writes go to an **upload queue** and are applied server-side (you own the write/conflict
logic). **v1.0** shipped (Postgres↔SQLite), now multi-backend. Offline-first is a first-class
property. Commercial (open-source SDKs + hosted/self-hosted service). ([docs.powersync.com/architecture/powersync-service](https://docs.powersync.com/architecture/powersync-service), [powersync.com/blog/introducing-powersync-v1-0](https://powersync.com/blog/introducing-powersync-v1-0-postgres-sqlite-sync-layer), [powersync.com](https://powersync.com/))

### CRDT / event-sourced full-stack (their own backend)

**Jazz** — a local-first framework where the data *is* the sync layer. Core protocol
**CoJSON**; data are **CoValues** (CoMap, CoList, CoText, CoStream/CoFeed) that auto-merge to
eventual consistency, with **built-in auth, relationship-based permissions, and E2E encryption**.
Sync via **Jazz Cloud** or self-hosted sync server; framework bindings for React/Expo, Vue,
Svelte, Solid. **Jazz 2.0** (new API) in progress in 2026. Of the engines, the closest to the
full Ink & Switch ideal set (privacy + ownership included). ([jazz.tools](https://jazz.tools/llms.txt), [github.com/garden-co/jazz](https://github.com/garden-co/jazz))

**Triplit** — full-stack sync engine + database: an in-browser DB and a server DB joined by a
**CRDT-based sync protocol**; **offline by default** (optimistic local writes, an **outbox**
that flushes on reconnect, eventual consistency). Relational model with a typed query language.
**Triplit 1.0** shipped, and Triplit was **acquired by Supabase (2025)** — so its steward is now
Supabase, which is a maturity signal but also a strategic-direction flag to watch. ([triplit.dev/docs](https://www.triplit.dev/docs), [triplit.dev/docs/offline-mode](https://www.triplit.dev/docs/offline-mode), [triplit.dev/blog/triplit-1.0](https://www.triplit.dev/blog/triplit-1.0))

**InstantDB** — "Firebase-but-relational." All data stored as **triples `[entity, attribute,
value]`** in a multi-tenant Postgres behind a Clojure sync server; queries in **InstaQL**
(GraphQL-ish) / Datalog; a **client-side triple store** caches recent queries to **IndexedDB**
(web) / AsyncStorage (RN); every query is live + multiplayer. Auth, storage, presence, permissions
included. In 2026 it leans hard into being **"the backend for AI-coded apps."** Open source +
hosted. ([instantdb.com/about](https://www.instantdb.com/about), [github.com/instantdb/instant](https://github.com/instantdb/instant), [instantdb.com/essays/next_firebase](https://www.instantdb.com/essays/next_firebase))

**LiveStore** — local-first data layer built on **event sourcing + reactive SQLite**: user
actions commit **events** to a local eventlog, materialised into a queryable local SQLite DB;
events sync via a **git-inspired push/pull** model through a central sync backend (pull-before-
push). Best when you want replay/audit/event-sourcing semantics. Actively developed, ~0.3.x —
**more experimental** than the hosted options. ([docs.livestore.dev/evaluation/how-livestore-works](https://docs.livestore.dev/evaluation/how-livestore-works/), [docs.livestore.dev/evaluation/event-sourcing](https://docs.livestore.dev/evaluation/event-sourcing/))

### Server-authoritative contrast

**Convex** — open-source **reactive** backend: schema + business logic as **TypeScript
functions**, mutations are **ACID transactions**, queries are reactive (subscribed clients
re-render). It is **not offline-first on its own** — historically needs connectivity; the
recommended offline path is **bolting PowerSync onto Convex** (local SQLite + optimistic +
partial sync). Self-hostable. Included here as the "if you *don't* actually need local-first,
this is the strong reactive-backend baseline" contrast. ([github.com/get-convex/convex-backend](https://github.com/get-convex/convex-backend), [releases.powersync.com/announcements/announcing-convex-backend-support-experimental](https://releases.powersync.com/announcements/announcing-convex-backend-support-experimental))

### Domain-specific

**tldraw sync** — a WebSocket-based real-time collab layer purpose-built for the tldraw
canvas SDK; **self-hostable** (Cloudflare Durable Objects template, or a generic Node/Bun
server), SQLite persistence, presence/cursors, automatic conflict resolution. Only relevant if
you adopt tldraw itself — but `hyper` is a *spatial canvas of cards*, so it's a notable prior-
art data point for "graph-on-a-canvas + sync." ([tldraw.dev/docs/collaboration](https://tldraw.dev/docs/collaboration), [tldraw.dev/starter-kits/multiplayer](https://tldraw.dev/starter-kits/multiplayer))

---

## 4. Local persistence primitives

What actually stores bytes on the client. `hyper` currently uses the **filesystem (a JSON
file)**, loaded + Zod-validated at intake — the simplest durable option and aligned with
"file is the source of truth." The alternatives if durable local *querying* becomes a need:

- **OPFS (Origin Private File System)** — random-access, origin-private files with a special
  high-performance synchronous-access surface. The foundation for real client-side SQLite.
  ([developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system](https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system))
- **SQLite-Wasm** (official, since late 2022) and **wa-sqlite** (community, multiple VFS
  implementations) — SQLite compiled to Wasm over OPFS/IndexedDB. As of the PowerSync **May
  2026** survey: the official build's OPFS mode needs **SharedArrayBuffer**, hence **COOP+COEP
  headers**; `OPFSCoopSyncVFS` is the recommended general-purpose VFS (fast even >1 GB),
  `OPFSWriteAheadVFS` (April 2026) adds concurrent reads-during-writes but is Chrome-121+ only,
  and `IDBBatchAtomicVFS` is the compatible fallback that **degrades past ~100 MB**. **Safari
  incognito has no OPFS**, and Chrome incognito caps DB size — real production constraints.
  ([powersync.com/blog/sqlite-persistence-on-the-web](https://powersync.com/blog/sqlite-persistence-on-the-web), [github.com/sqlite/sqlite-wasm](https://github.com/sqlite/sqlite-wasm))
- **SQLocal** — ergonomic wrapper over the official SQLite-Wasm build with **Kysely/Drizzle**
  query-builder integration; nice DX if you go the SQLite route. ([powersync.com/blog/sqlite-persistence-on-the-web](https://powersync.com/blog/sqlite-persistence-on-the-web))
- **IndexedDB** — universal, but a KV/object store, not a query engine; used *underneath* many
  of the above (Yjs `y-indexeddb`, InstantDB's cache, wa-sqlite's IDB VFS). Fine as a cache,
  awkward as a primary store for structured querying.
- **Durability caveat** (all SQLite-Wasm): `PRAGMA synchronous` trades crash-safety for speed;
  `OPFSWriteAheadVFS` defaults to *weak* durability. Worth knowing before trusting it as
  system-of-record. ([powersync.com/blog/sqlite-persistence-on-the-web](https://powersync.com/blog/sqlite-persistence-on-the-web))

**For `hyper`:** the JSON-file approach is the right durability/simplicity choice while the
doc is small and loaded whole. You'd only reach for OPFS+SQLite when partial-load, large
docs, or rich local querying become real — and note that a CRDT library (Automerge-Repo /
Yjs) brings its *own* storage adapter (filesystem / IndexedDB), so adopting one may settle the
persistence question without a separate SQLite decision.

---

## 5. Decision guidance

### Comparison at a glance

| Option | Category | Conflict model | Backend needed | Offline | Maturity (late 2026) | License |
|---|---|---|---|---|---|---|
| **Yjs** | CRDT lib | CRDT (YATA) | none (bring transport) | yes | Very mature (13.6.x) | MIT |
| **Automerge 3 / Repo** | CRDT lib | CRDT | none (adapters) | yes | Mature (v3, 2025; repo 2.6.x) | MIT |
| **Loro** | CRDT lib | CRDT (Fugue) | none | yes | Stable-ish (1.13.x) | MIT |
| **ElectricSQL** | Query sync | none (read-path; writes via your API) | **Postgres** + sync svc | reads yes | GA-ish, self/cloud | Apache-2.0 |
| **Zero** | Query sync | server-authoritative + mutators | **Postgres** + zero-cache | partial | **1.0 (Jun 2026)** | self-host + cloud |
| **PowerSync** | Bucket sync | server-authority reconcile | PG/Mongo/MySQL/MSSQL/Convex | yes | v1.0+, commercial | OSS SDK + paid svc |
| **Jazz** | CRDT full-stack | CRDT (CoJSON) | Jazz Cloud / self-host | yes | 2.0 in progress | OSS + cloud |
| **Triplit** | CRDT full-stack | CRDT | own server (Supabase-owned) | **yes, default** | **1.0**, Supabase-backed | OSS + cloud |
| **InstantDB** | Full-stack DB | server sync (triples) | Instant (hosted/OSS) | cache-level | Maturing, AI-focused | OSS + cloud |
| **LiveStore** | Event-sourced | event merge | central sync backend | yes | **Experimental (0.3.x)** | OSS |
| **TanStack DB** | Client store | (delegated to source) | none itself | via source | New (0.5.x) | MIT |
| **Convex** | Reactive backend | server-authoritative | Convex (self-host ok) | **no (add PowerSync)** | Mature | OSS (FSL) + cloud |
| **tldraw sync** | Canvas collab | CRDT-ish, canvas-specific | self-host WS server | yes | Stable (tldraw SDK) | tldraw license |

*(License column: "MIT/Apache" verified from repos where fetched; treat the commercial/cloud
rows as "OSS core + paid hosting" and confirm exact terms before relying on them — I did not
re-read every LICENSE file.)*

### Which fits a file-first single-user prototype with optional future sync

`hyper`'s constraints — **no backend today, single user, small self-contained JSON doc,
strict TS, values ownership/longevity, sync is a *maybe*** — rule out most of Section 3 as
present-tense choices: Electric/Zero/PowerSync want a Postgres and a server; Jazz/Triplit/
Instant/Convex want *their* backend. Adopting any of them now would trade away the
"file is the source of truth, runs with zero infrastructure" property that defines the repo.

So the honest guidance:

- **Do nothing yet is defensible.** The current JSON-file + Zod intake is the correct amount
  of machinery for a single-user prototype. None of this is needed until the **Draft** edit
  buffer is real, and *definitely* not until multi-user is real. Don't adopt a sync engine to
  hedge a maybe.
- **When the Draft buffer lands and you want a merge-ready future**, the lowest-regret move is
  a **CRDT document library**, because it preserves file-first and makes sync additive
  (a network adapter), not architectural:
  - **Automerge 3 + Automerge-Repo** — best ideological + practical fit: JSON-document model
    that mirrors the space file, a **filesystem storage adapter** (file stays source of truth),
    pluggable network adapters for later sync, mature, v3 fixed the old memory problem. TS-native.
  - **Yjs** — pick if editing behaviour (esp. text/markdown card bodies) dominates and you want
    the largest ecosystem; lower-level for whole-app state.
  - **Loro** — worth a spike specifically because **MovableTree** matches `hyper`'s
    card/route/graph shape and concurrent-move is exactly where naive CRDTs hurt; younger, so
    treat as evaluate-not-adopt.
- **TanStack DB** is the one Section-3 item that could enter early *without* a backend — as the
  reactive client store in front of the existing data — and later attach a sync source. But
  that's a state-management change, orthogonal to the local-first/merge question.
- **If `hyper` ever pivots to a hosted multiplayer product** (server acceptable), then the
  Postgres-sync engines (**Zero**, now 1.0; **Electric**) or a full-stack CRDT backend
  (**Jazz**, closest to the seven ideals) become the real contenders — but that's a different
  product than the file-first prototype described in CLAUDE.md.

**Production-ready vs experimental, late 2026 (be honest):** *Safe/boring:* Yjs, Automerge.
*GA but younger:* Zero (1.0), Triplit (1.0, Supabase), PowerSync (commercial), Electric.
*Maturing:* Loro, Jazz, InstantDB, TanStack DB. *Experimental:* LiveStore. *Not local-first
on its own:* Convex.

---

## What I could and couldn't verify

- **Verified from primary sources:** the seven ideals + essay authorship (Ink & Switch);
  Automerge 3 (July 2025, >10x memory, repo defaults) via the Automerge blog; Zero 1.0
  (release note + site) as a symbolic non-breaking GA over 0.26.2; Electric's read-path/no-CRDT
  model + the `electric.ax` move + AI-agent repositioning (Electric docs); PowerSync bucket
  architecture + source-DB list (PowerSync docs); the OPFS/SQLite-Wasm state incl. VFS names,
  SharedArrayBuffer/COOP-COEP, Safari-incognito gap (PowerSync May-2026 survey + Chrome blog);
  Triplit offline/outbox + Supabase acquisition + 1.0 (Triplit docs/blog); InstantDB triple
  store + IndexedDB cache (Instant docs/repo); LiveStore event-sourcing + push/pull (LiveStore
  docs); Jazz CoJSON/CoValues/E2E (jazz.tools); TanStack DB differential-dataflow collections
  (TanStack docs/blog); tldraw sync self-host/WebSocket/Durable Objects (tldraw docs).
- **Could not fully verify / flagged:** exact **Yjs** version (npm registry returned 403;
  13.6.31/13.6.30 taken from npmx + a version-checker mirror, not first-party npm). Exact
  **Loro** patch-release date (the releases page fetch returned internally inconsistent dates;
  the 1.13.x / mid-2026 range and "1.0 reached in 2024" are consistent across sources, the
  specific day is not). **Zero pricing** tiers seen in one fetch looked plausibly stale — omitted
  rather than cited. **License** specifics for the commercial/cloud products were not each read
  from LICENSE files. **Automerge-Repo** exact current version (~2.6.x alpha) from search/npm
  listing, not a release note. Nothing here should be treated as a version pin without a
  confirming `npm view` / release-page check at implementation time — this is late 2026 and
  these move fast.
