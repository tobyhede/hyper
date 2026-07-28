# PostgreSQL document persistence

Date: 2026-07-28
Status: approved

## Outcome

Hyper uses PostgreSQL as its live write model. Every edit is persisted
automatically and transactionally. The existing `space.json` plus card Markdown
directory remains the repository-friendly interchange format, but files are
imported into the database and exported from it rather than edited in place.

Prisma Next provides the contract, typed PostgreSQL runtime, transactions,
queries, upserts, and migrations. Hyper owns file discovery, parsing, import
policy, domain validation, canonical export, and the CLI lifecycle.

## Decided language

- **Import** is the one mechanism that turns file-shaped or programmatic input
  into database state. Seeding and test fixtures are caller intentions, not
  separate mechanisms.
- **Export** is a canonical projection of database state into the existing file
  structure. It is not Save: database state is already durable.
- **Id** is the entity's single durable UUID. It may be absent in import input,
  but every loaded or stored entity has one.
- **SpaceSnapshot** is the serializable, fully identified aggregate exchanged at
  the persistence seams. `Space` remains the validated, indexed domain value.

## Authority and durability

PostgreSQL is authoritative while Hyper is running and across restarts. Files
are inputs and outputs suitable for hand authoring, review, version control, and
sharing.

There is no explicit Save action and no unsaved database state. An edit updates
the UI optimistically, enters an ordered persistence queue, and becomes durable
when its transaction commits. A failure remains visible and retryable.

The UI may report that a space has changed since its last export. This compares
database revisions; it says nothing about database durability.

## File format

The physical structure does not change:

```text
talk/
  space.json
  intro.md
  cards/
    details.md
```

Discovery remains non-recursive within a space: Markdown files beside
`space.json` and immediately under `cards/` are cards.

The format advances to version 2 because identity compatibility changes:

- an id present in a file must be a UUID;
- an absent id is allocated during import;
- exported files always contain every generated id;
- existing repository fixtures and examples migrate to UUIDs.

Importing an id-less entity always inserts a new entity. Only an explicit UUID
can address an existing entity for update. Re-importing the same id-less input
before exporting it therefore creates another entity.

## Domain shape

The persistence-facing aggregate is:

```ts
interface SpaceSnapshot {
  id: UUID;
  document: SpaceDocument;
  cards: readonly {
    id: UUID;
    document: CardDocument;
  }[];
}
```

Every space, card, route, and layout in a snapshot has a UUID. Optional ids
exist only in `ImportSpace`, before the repository has resolved them.

Repository reads pair the snapshot with persistence metadata:

```ts
interface StoredSpace {
  snapshot: SpaceSnapshot;
  revision: bigint;
  exportedRevision: bigint | null;
}
```

`loadSpaceSnapshot` validates a snapshot's shapes and references, rejects route
cycles and invalid aliases, and builds the indexed `Space` consumed by graph
logic. The domain does not learn PostgreSQL, Prisma Next, file paths, or JSONB.

## PostgreSQL model

PostgreSQL carries a small relational spine and JSONB domain documents:

```text
spaces
  id                uuid primary key
  document          jsonb not null
  revision          bigint not null
  exported_revision bigint null
  created_at        timestamptz not null
  updated_at        timestamptz not null

cards
  id                uuid primary key
  space_id          uuid not null references spaces(id)
  document          jsonb not null
  created_at        timestamptz not null
  updated_at        timestamptz not null
```

The UUID and `space_id` columns are not duplicated inside their JSONB
documents. A space document contains its version, title, routes, layouts, and
default view. A card document contains its title, description, kind, and either
body or alias target. Route and layout ids, edge endpoints, layout position
keys, and alias targets are UUID strings within the validated documents.

No JSONB path indexes or partial-update interface are introduced initially.
Hyper replaces complete validated documents. Listing a small local catalog may
read the documents and derive summaries rather than duplicating title columns.

Any card update increments its owning space's aggregate revision in the same
transaction. `exported_revision` is updated only after a successful filesystem
export of that revision.

Import never advances `exported_revision`. That column records projections made
from database state, not files that happened to contribute to it; a merged
import may leave database cards that were absent from the imported directory.

## Module architecture

```text
Browser
  App
   -> SpaceSession
      -> SpaceBackend
         -> MemorySpaceBackend
         -> HttpSpaceBackend
              -> HTTP handlers
                 -> SpaceRepository
                    -> PostgresSpaceRepository

CLI
  file discovery -> parser -> importSpaces -> SpaceRepository

Export
  SpaceRepository -> canonical serializer -> filesystem adapter
```

### Browser seam

```ts
interface LoadedSpace {
  snapshot: SpaceSnapshot;
  revision: bigint;
  exportedRevision: bigint | null;
}

interface SpaceBackend {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<LoadedSpace | undefined>;
  commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<CommitResult>;
}
```

The load result includes the acknowledged database revision because the first
commit cannot supply an honest `expectedRevision` without it.

`SpaceSession` is the module the UX uses. It owns the loaded snapshot, the
acknowledged revision, one in-flight commit, the latest snapshot waiting behind
it, and the `settled`/`pending`/`failed`/`conflicted` persistence state. A domain
edit hands the session a complete valid snapshot; it does not add a new method
to the interface for each editing gesture. Pending edits may coalesce to the
latest snapshot, but commits never run concurrently for one space. A transient
failure is retryable. A revision conflict is visible and never retried as a
blind overwrite; recovery reloads current database state, with any destructive
choice made explicitly by the UX.

`MemorySpaceBackend` lands first and remains a supported development and test
adapter after PostgreSQL arrives. It returns promises like the eventual network
adapter and allows UX development without the old Save flow, Docker, or a
working database. Test-only construction options may inject latency and
failures without enlarging the production `SpaceBackend` interface.
`HttpSpaceBackend` later satisfies the same interface against the server.

The browser-safe modules live in `@project/persistence`: the backend interface,
session coordinator, memory adapter, and shared behavioral tests. The fully
identified `SpaceSnapshot` shape lives in `@project/core`, so `@project/graph`
can validate and index it without depending upward on persistence. PostgreSQL,
HTTP-server, CLI, and filesystem implementations remain outside the
browser-safe package.

### Server seam

```ts
interface SpaceRepository {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<StoredSpace | undefined>;
  commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<CommitResult>;
  importSpaces(input: readonly ImportSpace[], mode: ImportMode): Promise<ImportResult>;
  markExported(id: UUID, revision: bigint): Promise<void>;
}
```

The repository interface owns atomicity and identity allocation. The HTTP layer
only translates transport values into calls; it does not reimplement domain
validation or transaction rules.

`ImportMode` is `upsert` or `truncate`. The latter name is internal; the only
public way to select it is the deliberately alarming
`--dangerous-truncate` flag.

## Import flow

CLI discovery accepts:

```sh
hyper path/to/space.json
hyper path/to/space-directory
hyper path/to/collection-of-spaces
```

A file imports its containing space. A directory containing `space.json`
imports that one space. Otherwise the directory's immediate child directories
containing `space.json` are imported. Discovery does not recurse further.

Import proceeds in two phases.

First, Hyper discovers and parses the complete input batch. Syntax, frontmatter,
shape, file duplication, and explicit UUID errors are reported without opening
a write transaction.

Second, one repository transaction:

1. truncates all Hyper content first when dangerous truncation was requested;
2. asks PostgreSQL for UUIDs for every missing space, card, route, and layout id;
3. constructs fully identified snapshots;
4. validates all domain references and invariants;
5. upserts every explicitly identified space and card row;
6. inserts space and card rows whose ids were absent in the input, while
   persisting generated route and layout ids inside their parent document;
7. commits the whole batch.

Without dangerous truncation, absence never deletes database content. An
explicit card UUID already owned by another space is a conflict rather than an
implicit move. Duplicate explicit UUIDs within the batch are errors.

The same `importSpaces` module accepts programmatic `ImportSpace` inputs for
seeds and test fixtures. Only the file adapter performs filesystem discovery and
frontmatter parsing.

## Startup behavior

```sh
hyper
```

With no import path, Hyper inspects the existing database. Zero spaces creates
and opens a new space, one opens it, and several open space selection.

With an import path, one imported space opens directly and several imported
spaces open selection. Existing unrelated database spaces remain present unless
dangerous truncation was requested.

## Runtime editing

The browser loads a snapshot and derives the indexed `Space`. Each completed
domain edit:

1. updates the in-memory view immediately;
2. hands the fully identified snapshot to `SpaceSession`;
3. becomes the latest waiting snapshot behind any in-flight commit;
4. commits through `SpaceBackend`;
5. installs the returned revision.

The session supplies the latest acknowledged revision when each queued commit
actually begins. The repository rejects stale expected revisions, so a late
request cannot overwrite a newer state. A transient failure stays visible with
retry; a conflict stays visible and requires explicit recovery rather than a
blind retry. Neither is reported as durable. Navigation protection is needed
only while persistence is pending, failed, or conflicted, not after a successful
commit.

Activating a route remains a reading choice rather than an edit. It writes
nothing by itself.

## Export flow

Export is CLI-only:

```sh
hyper export <space-uuid> <destination-directory>
```

The browser never sends a filesystem path. Export reads one consistent stored
revision and produces canonical version 2 files:

- `space.json`;
- `cards/<card-uuid>.md` for every card;
- every generated entity id written explicitly;
- deterministic JSON, YAML, ordering, line endings, and filenames.

Comments, original filenames, quoting, key ordering, and other source-byte
provenance are deliberately not retained. The database is authoritative and
export is regeneration.

The exporter writes a staging directory, loads the staged output through the
normal version 2 importer, and only then replaces the destination's managed
space files. Database cards absent from the snapshot disappear from the
exported projection. Files outside the defined discovery scope remain
untouched.

After filesystem replacement succeeds, `markExported` records the exact
revision. If a newer edit committed during export, the space correctly remains
changed-since-export.

## CLI surface

```sh
hyper [path] [--dangerous-truncate]
hyper export <space-uuid> <destination-directory>
```

`--dangerous-truncate` deletes every Hyper space and card, imports the supplied
batch, and commits only if the entire import succeeds. It is invalid without an
import path.

The CLI distinguishes discovery, parsing, identity, domain-validation,
database, revision-conflict, and export failures. Errors name relevant paths and
entity ids. A failure exits non-zero and never leaves a partially imported
batch.

## Prisma Next practices

Adoption follows the project-shipped skills and is pinned as a coherent unit:

1. raise Hyper's Node requirement from 20 to the 24-or-newer requirement of the
   selected Prisma Next release;
2. select and pin one Prisma Next release;
3. install the matching project-local Prisma Next skill cluster for Codex using
   the exact Git tag selected in the preceding step;
4. install and import through the `@prisma-next/postgres` facade rather than
   lower-level packages;
5. author one contract with emitted `contract.json` and `contract.d.ts` beside
   it;
6. expose one adjacent `db.ts` runtime entry;
7. keep `DATABASE_URL` in the environment;
8. use ORM whole-value JSONB CRUD and upsert operations;
9. use callback transactions for imports and compound writes;
10. use PostgreSQL `gen_random_uuid()` defaults for row ids and PostgreSQL UUID
   allocation for nested ids;
11. use versioned `migration plan`/`migrate` history for the durable database;
12. run contract emission explicitly in development and builds initially.

Hyper currently uses Vite 6, while Prisma Next's contract-emission plugin
supports Vite 7 and 8. The initial integration does not install an unsupported
plugin. A later Vite upgrade may adopt it; until then explicit emission is the
documented fallback.

The design relies only on Prisma Next capabilities verified at revision
`e0e739ca`: PostgreSQL JSONB whole-value operations, native UUIDs, callback
transactions, and ORM upserts. It does not rely on typed JSON-path mutation,
batch-array transactions, `skipDuplicates`, or typed SQL-builder
`ON CONFLICT`, which were not established by the inspected release.

## Docker Compose

Development uses Docker Compose with a pinned PostgreSQL image, a health check,
a named data volume, and a loopback-published port. Hyper connects through
`DATABASE_URL`.

Compose owns infrastructure only. Contract initialization and migrations remain
Prisma Next commands, so starting a container cannot silently change the schema.

## Verification

- A shared behavioral suite runs against `MemorySpaceBackend` and
  `HttpSpaceBackend`.
- Session tests cover one in-flight commit, coalescing to the latest waiting
  snapshot, revision hand-off, transient retry, and non-overwriting conflicts.
- Repository integration tests run against Docker PostgreSQL.
- Import tests cover explicit-id upsert, id-less insertion, UUID allocation,
  cross-space ownership conflicts, duplicate ids, complete rollback, and
  dangerous truncation.
- Runtime tests cover ordered commits, stale-revision rejection, failure
  visibility, and retry.
- Canonical round-trip properties assert files -> import -> export -> import
  yields equivalent domain spaces, not byte-identical files.
- Migration tests initialize an empty database and upgrade the preceding
  contract.
- CI emits the contract, verifies database drift where a database is available,
  and runs the PostgreSQL integration suite.
- Existing UI E2E runs first against the memory backend. A smaller
  Postgres-backed E2E project proves durability across a server restart.

## Delivery sequence

1. Land the repository-wide version 2 UUID migration before parallel feature
   branches begin; its blast radius otherwise conflicts with every stream.
2. Add `SpaceSnapshot`, `SpaceBackend`, `SpaceSession`, and
   `MemorySpaceBackend`; move app boot behind the session and remove Save while
   retaining session-only UX.
3. Pin Prisma Next, install its matching skill cluster, add Docker Compose, and
   establish the contract/migration/runtime skeleton with one write/read proof.
4. Add `PostgresSpaceRepository` and its integration contract tests.
5. Add the shared import core and CLI startup behavior.
6. Add HTTP handlers and `HttpSpaceBackend`; switch normal runtime persistence
   to PostgreSQL.
7. Add canonical CLI export and changed-since-export status.

Each increment leaves the application runnable. After steps 1 and 2, UX owns
app stores, gestures, views, and components through `SpaceSession`; persistence
work owns Prisma Next, PostgreSQL, HTTP, CLI, and filesystem adapters. Their
only final join is the composition root choosing `HttpSpaceBackend` instead of
`MemorySpaceBackend`.

## Superseded decisions

This design supersedes ADR 0019's deterministic, readable generated ids and ADR
0029's explicit file Save. It refines ADR 0010's intake without weakening
`Space` as the validated indexed domain value, and retains ADR 0020's physical
file structure while changing files from the live write model into an
import/export format.

## Primary research

The Prisma Next capability audit and source links are captured in
`.scratch/database-persistence/prisma-next-findings.md`, pinned to inspected
revision `e0e739ca`.
