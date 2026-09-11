# 08 — Round-trip the complete Space aggregate

Status: ready-for-human
Tags: release/v1
Blocked by: none

**What to build:** Make the public CLI import and export exactly one complete
Meta-rooted aggregate.

Complete import replacement is not the Default Content hard reset: this ticket
owns round-tripping a supplied aggregate, while ticket 16 owns regenerating the
canonical initial aggregate without an import source.

- [x] The canonical directory contains a versioned `hyper.json` with
      `metaSpaceId`, plus one immediate `<space-uuid>/` child per Space. Each
      child keeps the existing `space.json` and `cards/<card-uuid>.md` shape.
- [x] Every Space Id is explicit. Canonical export writes every Card, Layout and
      Graph Id; import may still mint a missing nested Id only when nothing can
      reference it. Card Ids are unique across the aggregate; Layout and Graph
      Ids may repeat in different Spaces. Optimistic repository revisions are
      never exported.
- [x] Public import requires `hyper.json`, preserves authored identities and
      references exactly, and validates the complete aggregate before writing.
      It never manufactures direct Meta Space Cards for imported Spaces.
- [x] Import initialises an empty repository or, only with
      `--dangerous-truncate`, atomically replaces the complete aggregate and its
      Meta identity through `initializeAggregate` and `replaceAggregate`, using
      the expected current Meta identity returned by `loadAggregate`. It then
      deletes `ImportMode` and the compatibility `importSpaces` facade. There is
      no public merge mode. Raw directory batches remain internal to seeds and
      fixtures. **This also rewrites `test/e2e/postgres-persistence.spec.ts`**,
      which builds its fixture through `importSpaces`
      (`test/e2e/postgres-persistence.spec.ts:63`). That spec is not optional
      any more: CI runs `pnpm e2e:postgres` as the last test step of the
      `postgres` job (`.github/workflows/ci.yml`), so deleting the facade
      without rewriting it turns a required check red.
- [x] Administrative bootstrap/import stays outside the browser's authored
      `commit({ changes })` interface while reusing complete aggregate intake and
      transactional persistence internals.
- [x] Export reads one consistent `loadAggregate()` result and stages the complete
      directory before replacement. After replacement it independently calls
      `markExported` for each captured Space revision; interruption may only leave
      conservative changed-since-export state, never partial authored files.
- [x] Re-export to the same destination preserves reader-ignored root files and
      undiscovered contents inside retained Space directories, but removes every
      obsolete Space directory. A round trip after deleting Space B proves B is
      absent.
- [x] The public commands are `hyper export <destination>`,
      `hyper <aggregate-path>` and
      `hyper <aggregate-path> --dangerous-truncate`. Retire Space-scoped public
      export and `hyper entry`. **Both halves are now done**: `hyper entry` went
      in commit `9a64880e`, and Space-scoped export went with
      `src/export/export-space.ts` — `exportAggregate` takes a destination and
      no Space Id, and the usage string advertises the two commands above.
- [x] Export followed by import produces the same V1 authored aggregate through
      normal intake, including converging Space Cards, a formerly layoutless
      Space and all selected Layouts and Graphs.
- [x] Canonical export writes every initialized Space's `defaultLayout`, its
      Layouts and Layout-owned Graphs, and every Space Card's selected Layout and
      Graph. A Space still layoutless before its first working load has no
      `defaultLayout` to write and round-trips in that state unchanged; neither
      export nor import initializes it. Canonical import validates the identities
      and references that are present across the complete aggregate and preserves
      them exactly.
- [x] A layoutless imported Space stays layoutless in its source and stored
      aggregate until its first complete working-state request initializes it;
      import itself never rewrites the source Markdown, so an export taken before
      that request round-trips the layoutless state unchanged. Explicit Export after
      initialization writes the new Layout and Graph.
- [x] Removed Computed View Ids, Space View selections and `defaultRenderer` are
      absent from canonical fixtures and rejected by the current schema rather
      than migrated or invented as compatibility fields. `spaceFileSchema` is
      `z.strictObject` (`packages/core/src/schema.ts:283`) and declares
      `defaultLayout` as the only opening selection (`:303`), so a document
      carrying a retired key is *declined* rather than migrated — the schema
      names no retired key at all, which is ADR 0056's rule. `defaultRenderer` is
      absent from `packages/**` and `src/**` (`git grep defaultRenderer --
      packages src` returns nothing).
- [ ] PostgreSQL integration proves the initialized aggregate survives a fresh
      application host and exports at the committed revision.

This ticket absorbs the aggregate criteria formerly proposed as
`layout-only-v1/05`, so it remains the one canonical aggregate-format and
destructive-replacement owner. ADR 0079 is the contract those criteria encode.


## Comments

### Confirmed current state, 9 September 2026

Recorded so the next agent does not re-derive it. Each line was checked against
the tree at `d77b8475`.

- **`hyper.json` does not exist.** No file and no reference to that name appears
  under `src/`, `scripts/` or `packages/`. The whole of criterion 1 is unstarted.
- **Export is still Space-scoped.** `exportSpace(repository, id,
  destinationPath)` takes one Space Id (`src/export/export-space.ts:234`), and
  the CLI usage string still advertises `hyper export <space-uuid>
  <destination-directory>` (`src/cli/run.ts:24`).
- **The compatibility facade survives.** `ImportMode`
  (`src/persistence/space-repository.ts:40`) and
  `importSpaces(input, mode)` (`:59`) are both still on `SpaceRepository`, the
  latter carrying its own doc comment naming this ticket as its remover.
- **`hyper entry` is gone**, retired in `9a64880e`, so the second half of the
  public-commands criterion is done and the first half is not.
- **The schema criterion is closed** — see its ticked box above.

Blockers: `layout-only-v1/03` was removed from the `Blocked by:` line because it
is `Status: done`. `layout-only-v1/04` remains.

### Built, 11 September 2026

ADR 0078 had already decided this — "The order-sensitive `importSpaces(input,
'insert' | 'truncate')` interface is retired rather than kept as a second
lifecycle door... Test helpers seed through those same operations" — so this
ticket implements an accepted decision rather than taking a new one, and earns
no ADR of its own.

**The format.** `hyper.json` is `{ "version": 1, "metaSpaceId": "<uuid>" }`,
declared by `aggregateFileSchema` in `@project/core` beside `spaceFileSchema`
and strict for the same reason. It carries the one thing a directory cannot say
for itself — which Space is Meta — because no adapter may infer that from
ordering or cardinality, and a directory is exactly where the first-child
inference would be tempting. There is no Space inventory beside it: a Space is
in the aggregate because its directory is, the way a Thing exists because its
file does. Each `<space-uuid>/` child keeps the existing `space.json` +
`things/<thing-uuid>.md` shape. *The ticket said `cards/<card-uuid>.md`; that
spelling predates the Card→Thing rename and the tree has always written
`things/`.*

**Where identity is written.** The directory name is the Space Id, and a
`space.json` `id` that disagrees is refused rather than preferred — silently
taking one over the other lets a renamed directory pass as a fresh Space on the
next round trip. Nested ids may still be omitted, and minting them is safe
precisely because nothing already in the document can name a UUID the importer
has just invented; a reference to an id nobody declared dangles and is refused
by aggregate intake.

**One id-minting pass, not two.** `resolveImport` in `PostgresSpaceRepository`
and `identifyImport` in the memory double were the same rule written twice, with
a shared contract test standing over them to check they agreed. Both are gone.
`src/import/identify-space.ts` mints once at the import boundary and takes
`newId` from the composition root (ADR 0016), so the adapters take fully
identified snapshots and have no minting to disagree about. `describeSchemaFailure`
moved with it, keeping the CLI/wire message parity `import-decoding.test.ts`
guards.

**Export.** One `loadAggregate()` is the whole of what is written, so every
Space comes from one consistent view. The destination is staged from a copy of
itself, so root files the format ignores and undiscovered contents inside a
retained Space directory survive; obsolete `<space-uuid>/` directories go, and
so do the files of Things their Space no longer holds. The staged directory is
re-read through the ordinary import reader and ordinary aggregate intake before
anything is replaced — what must be known is that import will accept these
bytes, and the only honest way to know it is to ask import. `markExported` runs
per Space *after* replacement and attempts every Space even when one fails: an
unmarked Space reads as changed since its last export, which invites an export
already done rather than hiding one that never happened.

**Deliberately not done.** No equality check between the exported bytes and the
stored snapshot. Canonical export is canonical rather than byte-preserving (ADR
0030) — it normalizes Markdown line endings among other things — so a stored
Space and its exported form may legitimately differ, and the round trip is
asserted through intake instead.

**A constraint worth knowing before writing a fixture.** A layoutless *ordinary*
Space cannot appear in a valid aggregate at all: a Space Thing's `diagram` and
`graph` must resolve in its target, so a diagramless Space cannot be referenced,
and an unreferenced ordinary Space is `ordinary-space-unreferenced`. The
layoutless round trip is therefore asserted against a layoutless **Meta** Space,
which needs no referrer.

**The one box still open, and why.** `pnpm test:integration:postgres` and
`pnpm e2e:postgres` were not run: there is no `.env` in this tree, so there is
no `DATABASE_URL` and no password to bring a database up with — that is the
human's to supply. Both suites are *written* and typecheck clean, and the e2e
spec now exports after the drag and asserts `hyper.json`, the Space directory
and `exportedRevision === 1n`. The criterion stays unticked because nothing has
observed them run, which is exactly the distinction the verification bar draws.

To close it:

```sh
pnpm postgres:up && pnpm test:integration:postgres && pnpm e2e:postgres; pnpm postgres:down
```
