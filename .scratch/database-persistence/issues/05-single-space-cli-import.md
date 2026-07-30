# 05 — Single-space CLI import

**What to build:** Let `hyper` import one existing space file or space directory into PostgreSQL, resolving every missing identity through the database and reporting the imported stored space and id. Issue 07 owns choosing and opening the database workspace.

**Blocked by:** 01 — Version 2 UUID migration; 04 — PostgreSQL space repository.

**Status:** resolved

- [x] `hyper <space.json>` imports the containing space, and `hyper <space-directory>` imports the space in that directory.
- [x] Card discovery remains non-recursive and limited to Markdown files beside `space.json` and immediately under `cards/`.
- [x] The complete input is discovered and parsed before a write transaction begins.
- [x] PostgreSQL allocates UUIDs for every missing space, card, route, and layout id.
- [x] An entity with an explicit UUID upserts that entity; an entity without an id always inserts a new entity.
- [x] Import introduces no temporary identity or filename-based reference: every UUID reference must resolve to an explicitly identified entity, and an id-less entity cannot be referenced until export writes its generated UUID.
- [x] Duplicate explicit UUIDs and cross-space card ownership conflicts fail the import without partial writes.
- [x] The file adapter and programmatic seeds/test fixtures share the same core import mechanism.
- [x] Successful import returns and reports the imported `StoredSpace` and id; any failure exits non-zero with paths and entity ids where relevant. Choosing or opening a database workspace remains issue 07's responsibility.
- [x] Tests cover explicit-id updates, id-less insertion, complete UUID allocation, rejection of UUID references to id-less entities, validation errors, and transaction rollback.

## Answer

Implemented the single-space `hyper` import path for either `space.json` or its
containing directory. The file adapter discovers the two non-recursive Markdown
card locations, aggregates deterministic path-bearing diagnostics, and hands an
id-optional `ImportSpace` to the shared repository seam before any write begins.

`PostgresSpaceRepository` reserves the owning row, asks PostgreSQL to allocate
every missing durable identity, validates the resulting complete snapshot
through normal graph intake, and applies the additive import in one callback
transaction. Explicit identities upsert, id-less entities insert, ownership and
duplicate-identity failures roll back the batch, and the CLI reports the stored
space identity and lossless revision. Unit coverage exercises parsing,
composition, and CLI classification; the opt-in PostgreSQL suite covers
allocation, additive import, conflicts, ownership, validation, and rollback.

Final verification on Node 24 passed: the five focused files ran 42 tests, the
complete PostgreSQL integration suite ran 21 tests across three files, and
`pnpm verify` passed both typechecks, lint with zero warnings, formatting, and
360 coverage tests across 48 files. The PostgreSQL container was stopped after
the integration run.
