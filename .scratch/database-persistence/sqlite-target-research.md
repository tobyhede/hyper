# SQLite as a target database

Date: 2026-08-02  
Delivered baseline inspected: `42f1b5d01cee181ca326b1be41e47fe41044e4f7` (`origin/main`)  
Previous baseline: `aab50a4c9cf7f03ed574eb48737d82795b208cfb`  
Prisma Next version pinned by Hyper and current npm `latest`: `0.16.0`  
Prisma Next tag inspected: `v0.16.0`, commit `8a17d519ac2c4ce9b280547fa982ac1e80a8cdc2`
Current Prisma Next upstream inspected: `e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b` (`HEAD` on 2026-08-02)

## Recommendation

SQLite remains a viable **opt-in, local, single-host server database**, selected by trusted server/CLI configuration. PostgreSQL should remain the default live-write target. SQLite is not a browser database, an import format, a replacement for the memory test double, or a multi-host deployment.

The current estimate is **medium-large: one blocking compatibility decision plus three or four implementation increments**. That is smaller than the 2026-07-31 estimate of a spike plus five increments because several formerly forward-looking seams are now delivered:

- canonical export and `markExported` are complete and repository-neutral;
- PostgreSQL migration/integration CI is complete and gives SQLite a concrete CI pattern;
- startup, import, CLI behavior, HTTP resources and the browser backend already terminate at database-neutral interfaces;
- aggregate loading now reads a Space and ordered Cards in one ORM `include` statement, eliminating the former revision-before/cards/revision-after algorithm.

The principal blocker is now more definite, not less. Prisma Next 0.16.0's SQLite driver opens `DatabaseSync(path)` without `readBigInts`, while Hyper preserves signed-64-bit revisions as JavaScript `bigint`. Node throws when an SQLite `INTEGER` outside the safe-number range is read without bigint reads enabled. The target codec can decode a `bigint`, but the driver does not ask Node to produce one. Full-range revision parity therefore **cannot use SQLite INTEGER through the published driver unchanged**. The first decision is storage/driver strategy: obtain an upstream fix, contribute one, store canonical decimal revisions as TEXT, or deliberately narrow SQLite's range. Canonical decimal TEXT is a serious MVP candidate because Hyper increments in JavaScript and SQL only compares revision equality; it needs a focused Prisma text-codec/query/constraint spike. Do not add an application-level `Number` conversion.

## Net change from the previous assessment

| Earlier assessment | Current assessment |
|---|---|
| Issue 09 export was forward-looking. | Export is delivered. SQLite only needs `markExported` parity; the staged filesystem replacement and canonical format are already shared. |
| PostgreSQL CI was still issue 10 work. | CI now provisions the pinned Compose service, migrates, runs integration tests and verifies the live contract. A SQLite job can copy this gate without Docker. |
| Consistent aggregate load might need a SQLite read transaction or retry algorithm. | PostgreSQL now uses one `include('cards', ...)` statement. SQLite should use the same repository shape if the exact target emits one statement; the spike must inspect emitted SQL and prove ordered aggregate consistency. |
| HTTP was a raw Node handler but already repository-neutral. | Delivered HTTP is still repository-neutral and review-hardened. Separate unmerged Hono branches narrow it further to a fetch app and a three-method resource repository; this would reduce hosting coupling but does not change SQLite storage scope. |
| Roughly five increments plus a spike. | Three or four increments plus a blocking compatibility decision/spike. Schema/runtime/repository work remains substantial; browser, HTTP semantics, startup policy, import parsing and export formatting do not. |
| SQLite support existed despite stale upstream status text. | This remains true. npm `latest` is still exactly 0.16.0 as of 2026-08-02; no newer stable release changes the pinned risk. |

No SQLite implementation, dependency, contract, migration, runtime, script or CI job exists on the delivered baseline.

## Product scope

### In scope for the first target

- one file-backed SQLite database on a local filesystem;
- one Hyper server process, with multiple SQLite connections only as the Prisma runtime requires;
- the existing whole-Space optimistic revision contract;
- list, load, commit, insert-only batch import, dangerous truncate, startup and `markExported` parity;
- the existing `/api/spaces` browser behavior;
- CLI import/startup/export parity;
- a separate SQLite contract, generated artifacts, migration history, runtime and CI integration suite;
- explicit file location, journal mode, synchronous level, busy behavior, backup and graceful-close policy.

### Out of scope

- browser/WASM SQLite;
- network filesystems, shared database files across hosts, replication or a hosted SQLite service;
- replacing PostgreSQL as the default;
- live PostgreSQL↔SQLite migration; canonical directory export/import remains the bridge;
- replacing deterministic memory unit/E2E repositories;
- a generic cross-dialect SQL repository abstraction before duplication is measured.

## Current seam assessment

| Surface | Delivered state at `origin/main` | SQLite impact |
|---|---|---|
| Repository port | [`SpaceRepository`](../../src/persistence/space-repository.ts) owns `listSpaces`, `loadSpace`, optimistic `commitSpace`, transactional `importSpaces` and `markExported`. It contains no PostgreSQL types. | Reuse unchanged. It is the primary adapter boundary. |
| Repository implementation | [`PostgresSpaceRepository`](../../src/persistence/postgres-space-repository.ts) is 490 lines and mixes shared domain validation/allocation with PostgreSQL ORM operations, SQLSTATE classification and transactions. | Add `SqliteSpaceRepository`. Extract only proven-identical pure policy helpers; keep dialect errors and transaction mechanics separate. |
| Aggregate reads | `loadStoredSpace` uses one ORM statement with `include('cards', ...)` and orders Cards by UUID. PostgreSQL's statement snapshot now supplies consistency. | Reuse the shape if SQLite emits one statement. Verify generated SQL and concurrent reads; do not reintroduce the old three-read retry. |
| Storage contract | [`contract.prisma`](../../src/prisma/contract.prisma) contains PostgreSQL UUIDs/defaults, JSON, `BigInt`, timestamps and a Card FK/index. Generated JSON/types explicitly name the PostgreSQL target. | Separate SQLite contract and generated directory. UUIDs become canonical text; JSON and dates use target codecs; revision columns should spike canonical decimal TEXT before considering INTEGER. |
| Config/migrations | [`prisma-next.config.ts`](../../prisma-next.config.ts), [`migrations/`](../../migrations/) and root scripts are singular and PostgreSQL-specific. | Add an explicit second config, artifact location, migration history and `--config` scripts. Never make one generated contract conditional. |
| Runtime/lifecycle | [`src/prisma/db.ts`](../../src/prisma/db.ts) creates the PostgreSQL runtime; CLI closes it, while the hosted runtime owns its long-lived instance. | Add a concrete SQLite runtime and close ownership. Keep target selection outside requests. |
| Startup | [`database-startup.ts`](../../src/startup/database-startup.ts) depends only on `SpaceRepository`; zero/one/many behavior and persistence-owned IDs are settled. | Reuse unchanged. SQLite composition invokes it before serving. |
| Import | Import discovery/parsing and missing Card/Route/Layout ID allocation are above the repository. Space IDs are currently reserved through PostgreSQL's column default. | Reuse parsing/policy. Decide whether SQLite mints the omitted Space UUID in process or via a SQL expression; both satisfy persistence ownership, but tests must pin one. |
| Export | [`export-space.ts`](../../src/export/export-space.ts) loads via the repository, builds deterministic files, validates staging, replaces safely, then records the exact projected revision. | Reuse unchanged. SQLite implements `markExported(id, projectedRevision)` even if a concurrent edit advanced the current revision. |
| CLI | [`run.ts`](../../src/cli/run.ts) and [`main.ts`](../../src/cli/main.ts) receive a repository and close callback; only [`entry.ts`](../../src/cli/entry.ts) constructs PostgreSQL. | Add trusted target composition. Command syntax need not change except for the chosen target-selection mechanism. |
| HTTP | [`space-http-handler.ts`](../../src/http/space-http-handler.ts) depends on the repository and maps unexpected failures to retryable HTTP 503; [`postgres-http-runtime.ts`](../../src/http/postgres-http-runtime.ts) is the concrete target composition. | Reuse handler/protocol. Add SQLite runtime composition only. BUSY/LOCKED should reach the existing retryable 503 path, with bounded total latency. |
| Browser | `HttpSpaceBackend`, `SpaceSession`, startup selection, conflict UI and decimal-string revision transport are storage-neutral. | No semantic or UI change. |
| Hosting | [`vite-space-http-plugin.ts`](../../packages/app/vite-space-http-plugin.ts) loads a fixed server module; [`http-server-build.config.ts`](../../packages/app/http-server-build.config.ts) bundles the PostgreSQL runtime entry. | Add a SQLite entry/build/script or a trusted target-selecting entry. Never accept a database path from the browser. |
| CI | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) now has verify, PostgreSQL and E2E jobs; PostgreSQL applies committed migrations, runs 34 integration tests and verifies the live contract. | Add a database-file-in-temp SQLite job: emit/check, migrate, integration tests, live verify, close, remove. Retain PostgreSQL. |
| Tests | PostgreSQL has an 888-line integration suite plus CLI, Prisma contract and browser durability coverage. Memory repositories cover policy but there is no reusable SQL repository contract factory. | Extract a behavioral factory where useful, then add SQLite-specific bigint, lock, pragma, journal, reopen and migration cases. |

### Hono/runtime-hosting branches

The delivered baseline does **not** contain Hono. Four stacked, resolved-but-unmerged branches (`feat/portable-hono-http`, `feat/typed-hono-space-backend`, `feat/hono-runtime-host-cutover`, `chore/remove-raw-node-http-stack`) introduce `@project/http`, a fetch-native Hono application, a typed client and Node host adapter, then remove the old raw handler. Their public resource port contains only list/load/commit, while import/export/startup stay server-side on `SpaceRepository`.

If those branches land first, SQLite gets a slightly cleaner runtime composition: create a SQLite repository, run startup, pass it to `createSpaceHttpApp`, and let the existing host adapter serve it. This reduces raw Node hosting coupling but neither removes nor adds SQLite database work. Do not make SQLite depend on those branches; both HTTP designs already isolate the repository.

## Prisma Next and Node: availability versus maturity

### Exact pinned/current facts

- Hyper pins Prisma Next `0.16.0`. Official npm metadata queried on 2026-08-02 reports `@prisma-next/sqlite` `latest` as `0.16.0`, Node `>=24`, and exact `0.16.0` dependencies on the SQLite target, adapter and driver. [Official npm package](https://www.npmjs.com/package/@prisma-next/sqlite).
- The facade exports config, contract authoring, control, migration and runtime entry points and documents file-backed connections. [SQLite facade README at `v0.16.0`](https://github.com/prisma/prisma-next/blob/v0.16.0/packages/3-extensions/sqlite/README.md).
- The tag contains a working SQLite example and substantial migration planner/runner code, including table recreation. [Official example](https://github.com/prisma/prisma-next/tree/v0.16.0/examples/prisma-next-demo-sqlite) and [target migration source](https://github.com/prisma/prisma-next/tree/v0.16.0/packages/3-targets/3-targets/sqlite/src/core/migrations).
- The published runtime driver uses Node's synchronous `DatabaseSync`, one persistent top-level connection and fresh scoped transaction connections. Every runtime connection executes `PRAGMA foreign_keys = ON` and `PRAGMA busy_timeout = 5000`; transactions begin with plain `BEGIN`, not `BEGIN IMMEDIATE`. [Driver source](https://github.com/prisma/prisma-next/blob/v0.16.0/packages/3-targets/7-drivers/sqlite/src/sqlite-driver.ts).
- The SQLite adapter advertises `jsonAgg: true` and `lateral: false`, and renders JSON aggregates through `json_group_array(json_object(...))`, including aggregate ordering. That makes Hyper's current one-statement ORM `include` plausible on SQLite rather than requiring a separate load design. [SQLite adapter source](https://github.com/prisma/prisma-next/blob/v0.16.0/packages/3-targets/6-adapters/sqlite/src/core/adapter.ts).
- The driver normalizes SQLite UNIQUE/PRIMARY KEY/FK/NOT NULL/CHECK extended codes to SQLSTATE-like values and marks BUSY/LOCKED as transient connection errors. Its `constraint` is parsed from SQLite's message, such as `spaces.id`, not PostgreSQL's constraint name/table metadata. [Error normalizer](https://github.com/prisma/prisma-next/blob/v0.16.0/packages/3-targets/7-drivers/sqlite/src/normalize-error.ts).
- The target's bigint codec accepts `number | bigint` from the driver and returns `bigint`. JSON serialization of that database scalar is intentionally limited to safe integers, but ordinary ORM query decoding is not JSON contract serialization. [SQLite codecs](https://github.com/prisma/prisma-next/blob/v0.16.0/packages/3-targets/3-targets/sqlite/src/core/codecs.ts).

### Current upstream maturity

Availability is stronger than the status prose, whose wording has moved. The pinned `v0.16.0` README calls SQLite the next SQL target “on deck”, despite the same tag publishing a runnable facade, driver, target and example. At current upstream commit `e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b`, the README now calls SQLite “a proof of concept today”; it does not say “not yet”. Both versions describe Prisma Next as Early Access and not recommended for production. The defensible conclusion is a runnable experimental stack, not a production support guarantee. [Pinned status](https://github.com/prisma/prisma-next/blob/v0.16.0/README.md) and [current status](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/README.md).

There is no newer stable npm release to reassess: pinned and current `latest` are the same 0.16.0. Current upstream `HEAD` has also **not** fixed the specific driver issues: it still constructs `new DatabaseSync(path)` without `readBigInts`, configures foreign keys plus the 5-second busy timeout, and starts transactions with plain `BEGIN`. [Current driver source at the inspected commit](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/packages/3-targets/7-drivers/sqlite/src/sqlite-driver.ts). A future implementation should nevertheless re-query npm and inspect the exact chosen tag before coding because the Early Access APIs may evolve.

Node 24 is already Hyper's floor and the Prisma driver uses built-in `node:sqlite`, so no native addon is required. `DatabaseSync` is synchronous. Node 24 supports connection-level and statement-level `readBigInts`; the default is `false`, and reading an out-of-safe-range INTEGER then throws `ERR_OUT_OF_RANGE`. [Node 24 SQLite documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html#class-databasesync).

## Blocking technical findings

### 1. Full-range revisions do not work through the pinned driver unchanged

The exact 0.16.0 runtime executes:

```ts
const db = new DatabaseSync(path);
const stmt = db.prepare(sql);
const rows = stmt.all(...params);
```

It never sets `readBigInts` on the connection or statement. Node therefore produces `number` for safe integers and throws before Prisma's bigint codec can decode an unsafe integer. Hyper's HTTP contract accepts revisions through signed-int64 decimal width and PostgreSQL deliberately avoids narrowing. The existing PostgreSQL test proves an unsafe expected-revision parameter is sent losslessly, but SQLite also needs a stored unsafe revision read test.

Acceptable exits:

1. upgrade to or wait for an upstream release that exposes lossless SQLite bigint reads;
2. contribute an upstream driver change, ideally codec-aware rather than making every INTEGER a bigint;
3. store `revision` and `exported_revision` as canonical non-negative decimal TEXT, convert `bigint`↔string only at the SQLite repository boundary, and use canonical-string equality in the optimistic `WHERE`;
4. adopt and document a SQLite-only safe-integer revision ceiling, with schema/runtime checks and protocol behavior.

The TEXT design preserves the application and wire semantics without unsafe INTEGER reads. Hyper increments in JavaScript and does not require SQL arithmetic or revision ordering, so equality over one canonical decimal spelling is sufficient in principle. It costs target-specific storage representation and needs constraints that reject signs, leading zeroes, non-digits and values above `2^63 - 1`. The spike must prove Prisma's text codec, migration output, equality predicate, updates and nullable `exported_revision`; do not treat the design as feasible until then. The safe-integer ceiling is a product-semantic divergence and should be explicit. Patching emitted artifacts, reaching into transitive packages, or converting through `Number` is not acceptable.

### 2. Transaction acquisition and busy behavior need proof

SQLite permits multiple readers but only one writer. Default `BEGIN` is deferred; the first write upgrades it, and that upgrade may fail with `SQLITE_BUSY`. `BEGIN IMMEDIATE` acquires the write transaction at the start and avoids later upgrade failures if acquisition succeeds. [SQLite transaction modes](https://www.sqlite.org/lang_transaction.html#deferred_immediate_and_exclusive_transactions) and [isolation](https://www.sqlite.org/isolation.html).

Prisma Next 0.16.0 hard-codes plain `BEGIN` and a 5-second runtime busy timeout. Hyper cannot choose `BEGIN IMMEDIATE` or a different timeout through the facade. The spike must run two repositories/connections through:

- same-Space optimistic commits;
- different-Space writes;
- insert-only collisions;
- a transaction that reads before writing, if any generated operation does so;
- truncate+batch import;
- `markExported` racing with commit;
- COMMIT contention.

Classify revision mismatch as `conflict`, identity collisions as existing repository rejections, and exhausted BUSY/LOCKED as operational retryable failure. The current HTTP layer already maps an unexpected repository failure to 503, but the driver's 5 seconds plus HTTP/backend timeout must leave enough budget to receive that response rather than turn every lock into a client timeout.

### 3. One-statement aggregate reads reduce the consistency problem

The previous note assumed multiple reads. Current PostgreSQL code loads parent and ordered children through one ORM `include` statement. SQLite automatically wraps a standalone statement in a transaction and isolated connections see only complete committed transactions. [SQLite transactions](https://www.sqlite.org/lang_transaction.html) and [isolation summary](https://www.sqlite.org/isolation.html#summary).

The target advertises JSON aggregation and renders ordered `json_group_array`/`json_object` expressions, so it is designed for the aggregate include strategy. If the exact Hyper query lowers to one SQL statement, one statement is enough: no explicit read transaction or retry loop is needed. This must still be verified against emitted SQL because the concrete lowering is the fact that matters. Keep Card ordering explicit and run the same concurrent writer/reader invariant test. [SQLite adapter source](https://github.com/prisma/prisma-next/blob/v0.16.0/packages/3-targets/6-adapters/sqlite/src/core/adapter.ts).

### 4. Foreign keys are handled at runtime, but migration/control parity must be checked

SQLite disables foreign-key enforcement by default per connection. The 0.16.0 runtime driver enables it for persistent and scoped connections. [SQLite foreign-key enablement](https://www.sqlite.org/foreignkeys.html#fk_enable) and [Prisma driver](https://github.com/prisma/prisma-next/blob/v0.16.0/packages/3-targets/7-drivers/sqlite/src/sqlite-driver.ts).

The control/migration driver also enables foreign keys, but does not set the runtime's busy timeout. The spike must verify `ON DELETE CASCADE`, the `cards(space_id)` index, foreign-key checks after migration, and that every application path uses the facade rather than opening an unmanaged connection.

### 5. Error normalization is reusable only at the outcome level

The SQLite driver supplies familiar SQLSTATE-like codes, but PostgreSQL's helper checks `table === 'spaces'` and `constraint === 'spaces_pkey'`. SQLite reports message-derived names such as `spaces.id` and may omit table metadata. SQLite requires target-specific primary-key/card-ownership predicates backed by actual error-object tests. BUSY/LOCKED arrives as a transient connection error, not a query conflict. Reuse repository result types, not PostgreSQL error inspection.

## Storage and operational policy

| Concern | Recommended SQLite policy |
|---|---|
| UUIDs | Canonical lowercase UUID text validated at repository boundaries. Prefer in-process `newUuid()` for an omitted Space ID unless the contract spike proves a clear SQL default; persistence still owns allocation. |
| Documents | SQLite JSON codec stores text and parses on read. Retain Zod/domain intake; add `CHECK(json_valid(document))` if the migration surface can express and verify it. [SQLite JSON](https://www.sqlite.org/json1.html). |
| Revisions | Prefer canonical decimal TEXT for the SQLite MVP if the spike proves codec/query/constraint behavior; otherwise require an upstream bigint-read fix before using INTEGER. Preserve `bigint` in application and decimal strings over HTTP. Never silently narrow. |
| Dates | SQLite datetime codec stores ISO-8601 text, not PostgreSQL `timestamptz`. Verify `now()` and `temporal.updatedAt()` behavior; timestamps are metadata, but migrations/tests must reflect the target. |
| Tables | Prefer `STRICT` tables if the exact Prisma migration output supports them; otherwise use explicit NOT NULL/CHECK constraints. [SQLite STRICT tables](https://www.sqlite.org/stricttables.html). |
| Journal | Start with default rollback journal for the single-process MVP unless measured read/write contention justifies WAL. WAL allows readers with one writer but adds persistent `-wal`/`-shm` state and checkpoint policy. [SQLite WAL](https://www.sqlite.org/wal.html). |
| Durability | Choose and record `synchronous` rather than inheriting it accidentally. Test reopen after a normal close; crash/power-loss claims require separate evidence. |
| Busy timeout | The pinned runtime fixes 5000 ms. Align HTTP timeout/retry expectations around that, or require upstream configurability before supporting a different value. [SQLite busy timeout](https://www.sqlite.org/pragma.html#pragma_busy_timeout). |
| Filesystem | Local filesystem only. Use a stable absolute path in an application-owned directory with write permission for database and journal sidecars. Fail clearly if the parent is missing/unwritable. |
| Backup | Document the supported mechanism. Do not advise copying only the main file while WAL is live; SQLite's backup API or a quiesced/closed copy is the safe starting point. [SQLite backup API](https://www.sqlite.org/backup.html). |
| Lifecycle | One runtime owner; explicit close for CLI and server shutdown; integration tests must close all handles before cleanup. Synchronous `DatabaseSync` work blocks Node's event loop, so measure aggregate latency before broad concurrency claims. |

## Recommended architecture

```text
browser
  SpaceSession -> HttpSpaceBackend -> fixed /api/spaces resources
                                      |
                               SpaceRepository
                                /           \
              PostgresSpaceRepository   SqliteSpaceRepository
                    |                         |
          postgres contract/runtime   sqlite contract/runtime
```

1. Keep `SpaceRepository` unchanged and server-side.
2. Add `src/sqlite/` (or equivalently explicit target namespace) for contract artifacts and runtime; do not create a union-typed database singleton.
3. Keep separate PostgreSQL and SQLite config files and migration histories. Generated contracts encode target codecs and are not portable.
4. Implement `SqliteSpaceRepository` directly against its typed ORM. Share pure snapshot parsing, identity validation and missing-ID allocation only after tests show identical policy.
5. Keep import discovery, startup policy, canonical export and browser HTTP semantics above the adapter.
6. Select the target through trusted process configuration or separate scripts/entries. Browser requests remain fixed to `/api/spaces` and never carry database paths/URLs.
7. Build a reusable repository behavioral suite from the current PostgreSQL integration cases, but retain target-specific suites for SQL/error/locking/migration behavior.
8. If the Hono branches land, depend only on their resource repository interface in the HTTP package; SQLite composition still owns full `SpaceRepository` for startup.

## Blocking spike and decisions

### Spike

Using the exact version intended for implementation:

1. Emit a minimal Hyper-shaped SQLite contract to a separate artifact directory; generate, apply and verify a committed baseline migration.
2. Close/reopen a file and verify UUID text, JSON, timestamp/update behavior, cascade FK, index and control tables.
3. Round-trip revisions `0`, `Number.MAX_SAFE_INTEGER`, `Number.MAX_SAFE_INTEGER + 1`, and `2^63 - 1` through create, `where`, update, aggregate include and `markExported`.
4. Inspect the SQL generated for Space+Cards `include` and prove it is one statement with deterministic Card order.
5. Run two runtime instances through the contention matrix above; record timing and normalized errors.
6. Prove insert-only batch rollback, truncate+batch rollback and exact projected `markExported` semantics.
7. Record the migration output's support for CHECK constraints, STRICT tables and target defaults.

Exit only when the bigint decision is explicit and concurrency failures have stable classifications.

### Decisions

1. **Revision storage:** canonical decimal TEXT, upstream/upgrade INTEGER fix, or documented SQLite safe-integer ceiling? Recommend spiking TEXT first because it can preserve full application/wire parity without a driver fork; prefer an upstream-capable INTEGER driver long-term.
2. **Target status:** opt-in only or future default? Recommend opt-in only.
3. **Deployment:** one process/local filesystem? Recommend yes.
4. **Target selection:** separate commands/entries or one environment selector? Prefer explicit server-side entries/scripts unless one validated selector materially reduces duplication.
5. **Space UUID allocation:** process `newUuid()` or SQL default? Recommend process allocation for SQLite.
6. **Journal/durability:** rollback versus WAL and chosen `synchronous` level? Recommend default rollback for the first increment, then measure.
7. **Busy policy:** accept the pinned 5-second timeout or require configurability? It must fit below the HTTP timeout with useful margin.
8. **Backup contract:** quiesced file copy or online backup mechanism? Recommend documented close/quiesce first.
9. **Contract source:** separate explicit target contracts or shared authoring? Recommend separate contracts first.

## Delivery plan

### Increment 0 — compatibility spike

Resolve bigint viability, one-statement include, migrations and actual contention/error shapes. This is a go/no-go gate, not disposable production code.

### Increment 1 — target foundation

- add exact SQLite facade dependency;
- add separate config, contract/artifacts and migration history;
- add file-path validation, runtime creation/close and migration/live-verification scripts;
- add CI contract/migration smoke coverage.

### Increment 2 — repository parity

- implement list/load/commit first, using a shared behavioral suite;
- implement insert-only batch import, truncate and `markExported`;
- cover domain rejection, identity/card ownership, omission deletion, unsafe revisions, consistent aggregate reads and concurrent outcomes;
- keep target-specific error classifiers and transaction code local.

### Increment 3 — composition and operations

- compose startup and the existing HTTP app/handler with SQLite;
- compose CLI import/startup/export and close behavior;
- add reopen durability and one SQLite HTTP integration path;
- document target selection, data path, journal/synchronous/busy settings, backup and shutdown.

### Increment 4 — optional hardening/default evaluation

- only if measurements justify it: WAL/checkpoint policy, configurable busy timeout, browser restart E2E and crash testing;
- only after parity: decide whether SQLite should become a default local target, with an ADR superseding/refining PostgreSQL-only posture.

Increment 4 is not required to ship the recommended opt-in MVP unless product requirements demand those guarantees.

## Test and CI matrix

| Behavior | Memory | SQLite | PostgreSQL |
|---|---:|---:|---:|
| Domain/session/browser unit tests | Keep | No | No |
| Repository behavioral contract | Test-double confidence | **Required** | **Required/refactored from current suite** |
| Contract emit/migration/live verify | No | **Required** | Keep current CI |
| One-statement ordered aggregate | No | **Required exact SQL/runtime** | Keep |
| Revision boundaries | Simulated | **Required: safe+unsafe+int64 max** | Keep |
| Optimistic same-Space conflict | Simulated | **Required** | Keep |
| Different-Space concurrent writes | No | **SQLite-specific** | Keep relevant concurrency |
| BUSY/LOCKED timing/classification | No | **SQLite-specific** | No |
| Batch import/truncate rollback | Unit | **Required** | Keep |
| Identity/card ownership errors | Unit | **Required actual errors** | Keep |
| FK/cascade/index/pragma | No | **Required** | Keep contract checks |
| Reopen/file lifecycle | No | **Required** | No |
| HTTP handler/backend contract | Keep memory | One integration pass | Keep |
| CLI import/startup/export | Unit | **Required integration** | Keep |
| Browser restart durability | Keep memory E2E | Optional opt-in | Keep PostgreSQL opt-in |

SQLite CI needs no service container: create an isolated temporary directory, emit/check the SQLite contract, apply committed migrations, run integration tests, verify the live database, close every handle, then remove the directory. PostgreSQL CI remains mandatory because SQLite cannot validate PostgreSQL UUID/JSONB/timestamp types, SQLSTATE metadata, migration output or concurrency.

## Size and risk

**Size: medium-large, reduced from large.**

Work removed since the first assessment:

- no exporter design/implementation;
- no PostgreSQL CI design;
- no read-retry algorithm;
- no browser backend, session, selector, conflict UI or HTTP protocol work;
- likely no raw HTTP work if Hono lands first.

Work that remains substantial:

- second target contract, artifacts, migration history and runtime;
- a repository matching roughly 490 lines of PostgreSQL policy/transactions and an 888-line behavioral integration surface;
- target selection and operational lifecycle;
- cross-target behavioral test extraction;
- SQLite-specific error, locking and durability tests.

**Risk: medium-high until bigint is resolved; medium afterward.** Browser/UI risk is low. The architecture isolates the target well, but the pinned driver currently violates an explicit revision invariant and SQLite's one-writer model differs materially from PostgreSQL. A happy-path CRUD port is not parity.

## Conclusion

The codebase is more ready for SQLite than it was two days earlier. Database-neutral startup, CLI policy, import parsing, canonical export, HTTP resources and browser persistence are now delivered; PostgreSQL CI supplies a repeatable target gate; and one-statement aggregate loading removes a previously significant consistency design problem. SQLite is therefore no longer a five-increment application feature.

It is still not a configuration toggle. The new target needs its own schema/artifacts/migrations/runtime/repository and operational policy. More importantly, Prisma Next 0.16.0's published SQLite driver does not enable Node's bigint reads, so Hyper's full revision contract cannot pass unchanged. Resolve that first. If it is resolved, proceed with an opt-in local, single-process SQLite target in roughly three implementation increments, keeping PostgreSQL as the default and canonical directory export/import as the portability boundary.
