# 08 — Round-trip the complete Space aggregate

Status: ready-for-agent
Tags: release/v1
Blocked by: `layout-only-v1/04`

**What to build:** Make the public CLI import and export exactly one complete
Meta-rooted aggregate.

Complete import replacement is not the Default Content hard reset: this ticket
owns round-tripping a supplied aggregate, while ticket 16 owns regenerating the
canonical initial aggregate without an import source.

- [ ] The canonical directory contains a versioned `hyper.json` with
      `metaSpaceId`, plus one immediate `<space-uuid>/` child per Space. Each
      child keeps the existing `space.json` and `cards/<card-uuid>.md` shape.
- [ ] Every Space Id is explicit. Canonical export writes every Card, Layout and
      Graph Id; import may still mint a missing nested Id only when nothing can
      reference it. Card Ids are unique across the aggregate; Layout and Graph
      Ids may repeat in different Spaces. Optimistic repository revisions are
      never exported.
- [ ] Public import requires `hyper.json`, preserves authored identities and
      references exactly, and validates the complete aggregate before writing.
      It never manufactures direct Meta Space Cards for imported Spaces.
- [ ] Import initialises an empty repository or, only with
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
- [ ] Administrative bootstrap/import stays outside the browser's authored
      `commit({ changes })` interface while reusing complete aggregate intake and
      transactional persistence internals.
- [ ] Export reads one consistent `loadAggregate()` result and stages the complete
      directory before replacement. After replacement it independently calls
      `markExported` for each captured Space revision; interruption may only leave
      conservative changed-since-export state, never partial authored files.
- [ ] Re-export to the same destination preserves reader-ignored root files and
      undiscovered contents inside retained Space directories, but removes every
      obsolete Space directory. A round trip after deleting Space B proves B is
      absent.
- [ ] The public commands are `hyper export <destination>`,
      `hyper <aggregate-path>` and
      `hyper <aggregate-path> --dangerous-truncate`. Retire Space-scoped public
      export and `hyper entry`. **Half done, so the box stays open**: `hyper
      entry` was retired in commit `9a64880e` and no longer appears anywhere in
      the tree, while Space-scoped export survives — `exportSpace` still takes
      one Space Id (`src/export/export-space.ts:234`) and the usage string still
      advertises `hyper export <space-uuid> <destination-directory>`
      (`src/cli/run.ts:24`).
- [ ] Export followed by import produces the same V1 authored aggregate through
      normal intake, including converging Space Cards, a formerly layoutless
      Space and all selected Layouts and Graphs.
- [ ] Canonical export writes every initialized Space's `defaultLayout`, its
      Layouts and Layout-owned Graphs, and every Space Card's selected Layout and
      Graph. A Space still layoutless before its first working load has no
      `defaultLayout` to write and round-trips in that state unchanged; neither
      export nor import initializes it. Canonical import validates the identities
      and references that are present across the complete aggregate and preserves
      them exactly.
- [ ] A layoutless imported Space stays layoutless in its source and stored
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
