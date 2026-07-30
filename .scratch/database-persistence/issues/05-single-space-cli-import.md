# 05 — Single-space CLI import

**What to build:** Let `hyper` import one existing space file or space directory into PostgreSQL, resolving every missing identity through the database and reporting the imported stored space and id. Issue 07 owns choosing and opening the database workspace.

**Blocked by:** 01 — Version 2 UUID migration; 04 — PostgreSQL space repository.

**Status:** resolved

- [x] `hyper <space.json>` imports the containing space, and `hyper <space-directory>` imports the space in that directory.
- [x] Card discovery remains non-recursive and limited to Markdown files beside `space.json` and immediately under `cards/`.
- [x] The complete input is discovered and parsed before a write transaction begins.
- [x] PostgreSQL allocates UUIDs for every missing space, card, route, and layout id.
- [x] An explicit UUID inserts that entity only when the identity is unused; an entity without an id receives a new identity and inserts.
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
through normal graph intake, and inserts it in one callback transaction.
Existing identities, ownership conflicts and duplicate identities roll back the
batch, and the CLI reports the stored space identity and lossless revision.
Unit coverage exercises parsing, composition, and CLI classification; the
opt-in PostgreSQL suite covers allocation, insertion, conflicts, ownership,
validation, and rollback.

Final verification on Node 24 passed: the five focused files ran 42 tests, the
complete PostgreSQL integration suite ran 21 tests across three files, and
`pnpm verify` passed both typechecks, lint with zero warnings, formatting, and
360 coverage tests across 48 files. The PostgreSQL container was stopped after
the integration run.

## Comments

**Superseded on 2026-07-30, after closure.** Two accepted criteria above no
longer describe the code. They are left ticked because they were met when this
issue closed; the changes came later.

- "PostgreSQL allocates UUIDs for every missing space, card, route, and layout
  id" and the closing note's "asks PostgreSQL to allocate" are both retired. A
  space's id still comes from the `spaces.id` column default, but every card,
  route and layout id is now minted in process through `newUuid`
  (`@project/core`). The `SELECT gen_random_uuid() FROM spaces LIMIT 1` allocator
  is gone — it depended on the `spaces` table being non-empty and cost one
  round-trip per missing id inside the transaction. See issue `11` and ADR 0030.
- The closing note's "covers allocation, insertion, **conflicts**, ownership" no
  longer applies to import. `RepositoryImportResult` has no conflict variant:
  insert-only import compares no revisions, so a taken identity is a
  `duplicate-identity` rejection whether it was stored long ago or a moment
  earlier by a rival transaction. See issue `13`.
