# Prisma Next findings for database-backed Hyper persistence

Research date: 2026-07-27; PostgreSQL capability pass updated 2026-07-28
Prisma Next revision inspected: [`e0e739ca`](https://github.com/prisma/prisma-next/tree/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b)

## Conclusion

Prisma Next is relevant as the typed database layer in a more traditional Hyper architecture, but it is not itself a local-first or file-synchronisation system.

The coherent model would be:

```text
authored files --explicit import--> Docker PostgreSQL database
                                      |
                                      +-- app reads and edits here
                                      |
authored files <--explicit export-----+
```

In that model the database, not the open files, is the live editable authority. Prisma Next supplies schema contracts, typed queries, transactions, schema drift checks, and migrations for the middle. Hyper must implement and own both arrows: importing files into rows and exporting rows into files.

This would remove the particular provenance-map problem in `card-files/04` only if exports are canonical regeneration. If Hyper still promises byte-preserving round trips for comments, YAML quoting, key order, and filenames, the importer must store raw source/provenance in the database and the same concern returns in a different form.

### Prisma Next 0.16.0 pnpm packaging caveat

The published `0.16.0` emitter writes `contract.d.ts` imports for `@prisma-next/adapter-postgres`, `@prisma-next/target-postgres`, `@prisma-next/sql-contract`, and `@prisma-next/contract` directly. The tagged initializer installs only the target facade, CLI, dotenv, and Node types, so those imports do not resolve from a project-owned generated file under pnpm's strict dependency layout. Hyper carries those four packages as exact `0.16.0` **devDependencies solely for generated type resolution**. Authored code continues to import only the `@prisma-next/postgres` facade, and no hoisting or generated-artifact patch is used. Recheck and remove this workaround on the next Prisma Next upgrade.

## What Prisma Next actually is

Prisma Next describes itself as a TypeScript rewrite of Prisma ORM. Its architecture is **contract-first**: an authored schema emits deterministic contract JSON and TypeScript types; application queries are compiled and executed against a configured database. The contract hash ties generated artifacts and runtime plans to a schema version. The contract is schema metadata, not application content and not a file/row synchronisation format. ([Architecture](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/ARCHITECTURE.md))

It is also presently an early-access system that requires Node 24 or newer. PostgreSQL is its primary target; SQLite is explicitly called a proof of concept. Hyper declared Node 20 or newer before this adoption, so the foundation increment raises Hyper's runtime floor to Node 24. ([README](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/README.md))

Nothing in the documented architecture supplies offline replication, peer sync, change logs for content, conflict resolution, or browser storage. "Local" here can mean a local SQLite file; it should not be confused with a local-first sync architecture.

## Database runtime options

SQLite was the first option investigated. Its driver uses Node's built-in `node:sqlite` `DatabaseSync` API, accepts either `:memory:` or a filesystem path, keeps one persistent connection for normal queries, opens scoped connections for transactions, and enables foreign keys plus a five-second busy timeout on every connection. Hyper subsequently chose Docker PostgreSQL because it is Prisma Next's primary supported target and fits the requested server-backed workflow. ([SQLite driver README](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/packages/3-targets/7-drivers/sqlite/README.md), [driver source](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/packages/3-targets/7-drivers/sqlite/src/sqlite-driver.ts))

The official SQLite example configures a database path from `SQLITE_PATH`, defaulting to `./demo.db`, and constructs a typed runtime from emitted `contract.json`. ([example config](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/examples/prisma-next-demo-sqlite/prisma-next.config.ts), [runtime setup](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/examples/prisma-next-demo-sqlite/src/prisma/db.ts))

For Hyper this means the database belongs in the Node/server persistence adapter, not in browser code. It could replace the current Vite plugin's in-memory/file bookkeeping while keeping the browser unable to name arbitrary filesystem paths.

SQLite maturity is uneven. The project's feature scorecard marks SQLite migration application as integration-tested, but several SQLite CLI surfaces (`contract emit`, `db init`, `db update`, `db verify`, `db schema`, and `migration plan`) as reachable but without qualifying integration evidence. ([CLI scorecard](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/scorecard/17-cli-commands.md))

## Schema and migrations

The authored contract emits deterministic contract JSON and TypeScript types. Runtime verification uses hashes/markers to detect when code and the database schema disagree. ([Architecture](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/ARCHITECTURE.md))

Prisma Next offers two schema-change paths:

- `db update` compares the emitted contract with the live database and applies the change directly. It writes no migration directory and is explicitly intended only for an unshared local development database.
- `migration plan` writes a reviewed migration package containing canonical operations, a content hash, TypeScript authoring source, and content-addressed contract snapshots. `migrate` applies the resulting history. This is the path for shared or production databases.

([Migration skill: key concepts](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/skills/prisma-next-migrations/SKILL.md#key-concepts))

These migrations evolve database schema and may carry explicit data transforms. They are not Hyper content exports and do not replace `space.json` or card Markdown.

For a per-user disposable local database, Hyper could initialize/update the DB from its shipped contract. If the DB becomes durable user state, versioned migration packages are the safer choice even though the database is physically local: deleting and reseeding it would otherwise discard edits not yet exported.

## Seeding and importing files

Prisma Next has no first-class seeding command. Its own migration guidance says there is no `prisma db seed` equivalent and recommends a TypeScript script that imports the runtime and issues setup queries. The SQLite demo follows that pattern after contract emission and database initialization. ([Migration skill: missing features](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/skills/prisma-next-migrations/SKILL.md#what-prisma-next-doesnt-do-yet), [SQLite demo setup](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/examples/prisma-next-demo-sqlite/README.md), [seed script](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/examples/prisma-next-demo-sqlite/scripts/seed.ts))

Therefore "seed local database from files on load" is a Hyper importer built with Prisma Next queries and transactions, not a Prisma Next feature. Before implementing it, Hyper must choose its repeated-load semantics:

- **Bootstrap once:** import files only when creating/opening a fresh local database. Later page loads reuse the DB. This matches the ordinary meaning of seeding and cleanly establishes DB authority.
- **Reconcile every load:** compare files to rows whenever the app opens. This is synchronization and requires ownership, conflict, deletion, identity, and timestamp/version rules. It reintroduces much of the complexity the database move is meant to avoid.
- **Explicit import:** opening/importing a space is a user action distinct from reopening the current database. This makes replacement/merge policy visible and is the clearest fit with explicit export.

Import should be a transaction so the database never contains a partially imported space. Missing source files must not silently imply row deletion unless the import operation explicitly has replacement semantics.

## Export and synchronization

No content data export, dump, or synchronization facility appears in Prisma Next's documented CLI surface. `db schema` inspects a live **schema**, while `contract infer` derives an authored **schema contract** from an existing database; neither imports or exports application rows. The CLI scorecard lists no row-data export or sync command. ([CLI scorecard](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/scorecard/17-cli-commands.md), [migration inspection workflow](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/skills/prisma-next-migrations/SKILL.md#workflow--inspect-the-live-schema))

Hyper's export would therefore:

1. Read all space, card, route, and layout rows from one consistent database snapshot/transaction.
2. Validate the exportable domain state.
3. Serialize a canonical `space.json` and card Markdown representation.
4. Write to a server-owned, user-selected destination through a filesystem adapter.
5. Make replacement/deletion behavior explicit and use a staging directory plus rename where practical, so a failed export does not leave half a space.

Calling this operation **Export** rather than **Save** is accurate: normal edits are already durable in the local DB, and files are a projection taken at a chosen moment. An export should record or expose the database revision it represents so Hyper can distinguish "DB is durable" from "files reflect the current DB revision."

## PostgreSQL capability check for Hyper

The following classifications use Prisma Next's own scorecard meanings: **supported** means the repository has integration evidence against a database; **missing** means its public feature matrix explicitly excludes the capability; **uncertain** means an API or lower-level mechanism exists but the exact Hyper-relevant behavior lacks direct integration evidence at this revision.

| Capability | Status at `e0e739ca` | Hyper-relevant qualification |
| --- | --- | --- |
| JSON/JSONB storage and round trip | Supported | Native `Json`/`Jsonb` columns, typed insert, select, defaults, and round-trip are exercised. |
| Whole-value JSONB update | Supported | PostgreSQL-backed compatibility tests replace a JSONB object through the ORM and read it back. |
| JSONB path/operator updates | Missing from the typed builder | The builder status explicitly lists JSON/JSONB operators as not implemented; raw SQL remains an escape hatch. |
| JSON-path filters and SQL-NULL/JSON-null distinction | Missing | ORM JSON-path filters and Prisma-style `DbNull`/`JsonNull`/`AnyNull` sentinels are not ported. |
| Native UUID columns | Supported | `Uuid` maps to PostgreSQL `uuid`; migration, introspection, and value round-trip are exercised. |
| `@default(uuid())` / `uuid(7)` | Supported | These are application execution-time UUID generators, not database column defaults. |
| Database-generated UUID default | Supported at the DDL/raw mechanism level | Use `@default(dbgenerated("gen_random_uuid()"))`; the repository proves DDL lowering and native UUID compatibility, but its main UUID scorecard entry is stronger for application-generated defaults. |
| Interactive transactions | Supported | Atomic commit/rollback and read-your-own-write through `db.transaction(fn)` are integration-tested. |
| Transaction tuning/savepoints | Missing | Isolation level, timeout, max wait, client defaults, and nested/savepoint transactions are explicitly absent. |
| Batch-array transactions | Missing | There is no Prisma-compatible `$transaction([op1, op2])`; operations run inside the callback transaction. |
| ORM upsert | Supported | Primary-key and explicit unique conflict criteria are integration-tested, including conditional create via empty update. |
| Typed SQL-builder `onConflict` | Uncertain/not exposed as a documented public builder terminal | The ORM lowers upsert to an insert conflict action, but the SQL-builder scorecard does not list an `onConflict` surface. Use ORM `upsert` or raw SQL rather than assuming a builder API. |
| Multi-row insert | Supported | SQL builder `insert([...])` and ORM `createAll([...])` produce one batch insert and return rows. |
| Set-based update/delete | Supported | ORM `updateAll`, `updateAndCount`, `deleteAll`, and `deleteAndCount` are integration-tested on PostgreSQL. |
| Prisma-compatible `createMany({ skipDuplicates })` | Missing | Explicitly absent; plain `createAll` exists, and conflict behavior requires upsert/raw SQL. |
| Limited `updateMany` and nested bulk mutation helpers | Missing | `updateMany({ limit })`, nested `updateMany`, nested `deleteMany`, nested upsert, and SQL ORM atomic increment/decrement helpers are explicitly absent. |
| Docker-backed PostgreSQL development | Supported by repository examples | The repository includes plain PostgreSQL, Cloudflare/Hyperdrive, PostGIS, and extension-oriented Compose setups; these are examples/infrastructure, not a Prisma-managed embedded database. |

### JSONB

PostgreSQL has first-class `json` and `jsonb` codecs and schema types. In the pinned 0.16.0 release, PSL `Json` maps to native `jsonb`; Hyper's emitted contract records `nativeType: "jsonb"` and codec `pg/jsonb@1`. The inspected post-0.16 revision distinguishes `Json` (native `json`) from `Jsonb` (native `jsonb`), so an upgrade must keep Hyper's document fields on JSONB explicitly. ([0.16-to-0.17 upgrade guidance](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/skills/upgrade/prisma-next-upgrade/upgrades/0.16-to-0.17/instructions.md#postgres-json-rebound-to-native-json), [fixture contract](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/e2e/framework/test/fixtures/contract.ts))

The project's scorecard marks JSON scalar round-trip and JSON-column migrations as proven on PostgreSQL. Its end-to-end DML test inserts structured JavaScript values into both JSONB and JSON columns and selects them back as structured values; separate DDL coverage includes JSONB literal defaults. A PostgreSQL-backed compatibility test additionally proves equality/inequality predicates and replacing an entire `Jsonb` value through `.update({ requiredJson: {} })`. ([types scorecard](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/scorecard/02-types-and-values.md), [migration scorecard](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/scorecard/15-migrations.md), [DML integration test](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/e2e/framework/test/dml.test.ts), [JSONB update test](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/integration/test/ports/prisma/functional/legacy-json/legacy-json.test.ts), [JSONB fixture](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/integration/test/ports/prisma/functional/legacy-json/_fixture/contract.prisma), [DDL integration test](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/e2e/framework/test/ddl.test.ts))

JSONB is a semantic document value, not a byte-preserving container. Prisma Next's JSON ADR explicitly notes that PostgreSQL JSONB normalizes representation: whitespace and key order are not preserved, and only the final duplicate key survives. This is suitable for routes/layout snapshots but not for preserving authored source representation. ([JSON/JSONB ADR](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/docs/architecture%20docs/adrs/ADR%20168%20-%20Postgres%20JSON%20and%20JSONB%20typed%20columns.md))

Typed JSONB document operators and partial updates are not present in the builder. Its own status file lists `->`, `->>`, `#>`, `@>`, `?`, and related JSON/JSONB operators among missing features. The Prisma compatibility inventory also records JSON-path filters, cross-column JSON field references, JSON-list `push`, and distinct `DbNull`/`JsonNull`/`AnyNull` semantics as not ported. Hyper can store a route/layout aggregate as JSONB and replace the whole value, but querying or patching inside it would need raw SQL or a future extension; normalized rows avoid that dependency. ([SQL-builder status](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/packages/2-sql/4-lanes/sql-builder/STATUS.md), [JSON field-reference inventory](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/integration/test/ports/prisma/non-ported/functional/field-reference-json/field-reference-json.md), [JSON-list push inventory](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/integration/test/ports/prisma/non-ported/functional/json-list-push/json-list-push.md), [JSON-null inventory](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/integration/test/ports/prisma/non-ported/functional/json-null-types/json-null-types.md))

Lossless codec-aware JSON projection for arbitrary-precision values is still an active project at this revision. Hyper's expected strings, booleans, ordinary numbers, arrays, and objects are demonstrated, but this evidence should not be generalized to nested 64-bit integers or decimals produced by database JSON aggregation. ([codec JSON projection specification](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/projects/codec-json-projections/spec.md))

### UUID columns and defaults

Native PostgreSQL UUID storage is supported. A PSL `Uuid` field emits `nativeType: "uuid"` with codec `pg/uuid@1`; integration coverage creates the native column, round-trips canonical UUID strings, and verifies introspection against the contract. The official PostgreSQL demo uses `Uuid @id @default(uuid())` for its principal models. ([UUID integration test](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/packages/3-targets/6-adapters/postgres/test/migrations/planner.uuid.integration.test.ts), [demo contract](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/examples/prisma-next-demo/src/prisma/contract.prisma))

The important semantic distinction is where the default runs:

- `@default(uuid())`, `@default(uuid(4))`, and `@default(uuid(7))` lower to Prisma Next **execution generators** (`uuidv4` or `uuidv7`). The application supplies the ID in its insert; the database column itself has no UUID default. This is directly visible in the demo's emitted contract. ([default lowering source](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/packages/3-targets/6-adapters/postgres/src/core/control-mutation-defaults.ts), [emitted demo contract](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/examples/prisma-next-demo/src/prisma/contract.json))
- A database-side default uses `@default(dbgenerated("gen_random_uuid()"))`. Prisma Next preserves and renders `gen_random_uuid()` as a database function default, and PostgreSQL integration coverage proves a native UUID column accepts the function's result. ([default lowering tests](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/packages/3-targets/6-adapters/postgres/test/control-mutation-defaults.test.ts), [UUID integration test](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/packages/3-targets/6-adapters/postgres/test/migrations/planner.uuid.integration.test.ts))

Hyper chose UUIDs as the single domain identity, not merely as surrogate row keys. Existing fixtures with short string ids must therefore migrate. Explicit import ids are UUIDs used for upsert; missing row ids use PostgreSQL defaults, and missing nested route/layout ids are allocated through PostgreSQL within the import transaction.

### Transactions

PostgreSQL `db.transaction(async (tx) => ...)` is integration-tested for commit, rollback, and ORM read-your-own-write behavior. This is sufficient for atomic space import and compound graph edits. ([transaction scorecard](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/scorecard/14-transactions.md), [runtime transaction tests](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/e2e/framework/test/transaction.test.ts), [ORM transaction tests](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/e2e/framework/test/transaction-orm.test.ts))

The transaction API is intentionally narrower than current Prisma ORM: the scorecard explicitly marks isolation-level selection, timeouts, max-wait settings, client-level defaults, nested transactions/savepoints, and standardized write-conflict errors as absent. There is also no Prisma-compatible array form such as `$transaction([op1, op2])`; callers run operations sequentially inside the callback transaction. Hyper should design import/edit transactions as short, single-level units and not depend on retry/isolation controls supplied by the ORM. ([transaction scorecard](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/scorecard/14-transactions.md), [query skill: missing features](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/skills/prisma-next-queries/SKILL.md#what-prisma-next-doesnt-do-yet))

### Upsert and conflicts

The PostgreSQL ORM `upsert` is supported with primary-key conflict fallback, explicit unique-field criteria through `conflictOn`, compound IDs, and compound uniques. Integration tests prove create/update branches and show that an empty update lowers to `ON CONFLICT ... DO NOTHING` followed by retrieval of the existing row. Execution defaults are applied on the create branch. ([upsert integration tests](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/integration/test/sql-orm-client/upsert.test.ts), [native atomic upsert compatibility tests](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/integration/test/ports/prisma/functional/methods-upsert-native-atomic/methods-upsert-native-atomic.test.ts), [ORM scorecard](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/scorecard/06-sql-orm-client.md))

The lower-level insert AST carries an `onConflict` action, but the public SQL-builder feature matrix does not name or prove a typed `.onConflict(...)` terminal. For Hyper, use the proven ORM `upsert` for row reconciliation or explicit raw SQL for specialized conflict clauses; do not assume parity with libraries that expose every PostgreSQL `ON CONFLICT` form in their query builder. ([upsert integration tests](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/integration/test/sql-orm-client/upsert.test.ts), [SQL-builder scorecard](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/scorecard/05-sql-query-builder.md))

### Bulk writes

Bulk insertion is supported in two forms. SQL-builder `insert([...])` emits one multi-row insert, while ORM `createAll([...])` is proven to execute one batch AST and return every inserted row. ORM `updateAll`/`updateAndCount` and `deleteAll`/`deleteAndCount` perform set-based filtered mutations. ([SQL mutation integration tests](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/integration/test/sql-builder/mutation.test.ts), [ORM create tests](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/integration/test/sql-orm-client/create.test.ts), [ORM update tests](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/integration/test/sql-orm-client/update.test.ts), [ORM delete tests](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/test/integration/test/sql-orm-client/delete.test.ts))

There are important gaps. Prisma-compatible `createMany({ skipDuplicates })` and limited `updateMany({ limit })` are explicitly missing. Nested update-many, delete-many, upsert, and SQL ORM atomic numeric/list operations are also missing. `createAll` is therefore suitable for a clean transactional import, but deduplicating reconciliation should use the proven per-row ORM upsert, staging tables/raw SQL, or a replace import rather than expecting a conflict-skipping batch API. ([ORM scorecard](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/scorecard/06-sql-orm-client.md), [nested-write scorecard](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/scorecard/12-nested-writes-and-atomic-ops.md))

### Docker and PostgreSQL examples

Prisma Next has credible PostgreSQL deployment examples, though none turn PostgreSQL into an embedded local database:

- The repository's root Compose file runs ephemeral PostgreSQL 17 on host port 5433 for integration work. ([root Compose file](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/docker-compose.yaml))
- The main Node demo uses the long-lived `postgres<Contract>({ contractJson, url })` client and documents contract emission, `db init`, application seeding, typed queries, ORM operations, transactions, and upsert. It expects an externally supplied PostgreSQL connection and pgvector, rather than shipping its own Compose file. ([Node demo README](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/examples/prisma-next-demo/README.md))
- The Cloudflare Worker example ships a PostgreSQL 16 Compose service, health check, ephemeral storage, schema initialization, seeding, and a serverless/Hyperdrive runtime. ([Worker README](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/examples/prisma-next-cloudflare-worker/README.md), [Worker Compose file](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/examples/prisma-next-cloudflare-worker/docker-compose.yml))
- The PostGIS example ships PostgreSQL 16 + PostGIS in Compose and demonstrates extension-aware schema initialization, seeding, a Next.js server application, and live end-to-end tests. ([PostGIS README](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/examples/prisma-next-postgis-demo/README.md), [PostGIS Compose file](https://github.com/prisma/prisma-next/blob/e0e739ca6a0e076c97733ef30ec3bf7b1f43a27b/examples/prisma-next-postgis-demo/docker-compose.yml))

Hyper deliberately chose Docker PostgreSQL and accepts the daemon/container, credentials, lifecycle, port, backup, and upgrade concerns. The stronger PostgreSQL support in Prisma Next, transactional import, and a conventional server persistence model outweigh SQLite's zero-setup advantage for this project.

## What transfers well to Hyper

- **Database as the live authority.** UI state is persisted as domain rows; files become interchange and version-control artifacts.
- **One typed contract.** A database schema for spaces, cards, routes, route edges, layouts, and positions can express identity, relations, uniqueness, and referential integrity directly.
- **Transactions at persistence boundaries.** Import a complete space atomically; persist compound graph edits atomically; export from a consistent snapshot.
- **Schema hash and migration discipline.** A local database still needs safe upgrades as the app evolves.
- **Explicit generated artifacts.** Prisma Next's separation of authored contract, emitted runtime artifacts, and database state is a useful analogue for authored DB state versus exported Markdown/JSON.

## What does not transfer automatically

- File parsing, validation, filename rules, and import reconciliation.
- Canonical Markdown/frontmatter serialization.
- Exact source-byte preservation.
- Atomic multi-file export and deletion policy.
- File watching or bidirectional synchronization.
- Browser-local/offline storage or multi-device sync.
- A first-class seed or content-export command.

## Recommended interpretation for Hyper

The approved move changes Hyper's promise from **file-first persistence** to **database-first editing with file import/export**.

The smallest coherent version is:

1. Docker PostgreSQL is the only live write model.
2. Import is explicit and transactional: explicit UUIDs upsert, absent ids insert after PostgreSQL allocation, absence never deletes, and `--dangerous-truncate` replaces all content atomically.
3. Every edit persists to PostgreSQL through the server adapter; the existing Save concept disappears.
4. Export regenerates canonical files from a consistent snapshot, with deterministic naming and formatting.
5. The UI separately shows whether the DB revision has been exported.
6. Exact preservation of hand-authored bytes is deliberately dropped. If that promise must remain, store source/provenance explicitly and accept that `card-files/04` is not truly eliminated.

Prisma Next can support this design, but adopting it raises Hyper's Node floor to 24 and couples delivery to an early-access API. The architecture remains independent of the ORM through the `SpaceRepository` seam, allowing Prisma Next to be upgraded or replaced without coupling Hyper's domain to it.
