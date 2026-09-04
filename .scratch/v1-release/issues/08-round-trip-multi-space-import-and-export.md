# 08 — Round-trip the complete Space aggregate

Status: ready-for-agent
Tags: release/v1
Blocked by: 01; `layout-only-v1/03`; `layout-only-v1/04`

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
      fixtures.
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
      export and `hyper entry`.
- [ ] Export followed by import produces the same V1 authored aggregate through
      normal intake, including converging Space Cards, a formerly layoutless
      Space and all selected Layouts and Graphs.
- [ ] Canonical export writes each initialized Space's `defaultLayout` — a Space
      still awaiting initialization has none and none is invented — together with
      its Layouts and Layout-owned Graphs, and every Space Card's selected Layout
      and Graph.
      Canonical import validates those identities and references across the
      complete aggregate and preserves them exactly.
- [ ] A layoutless imported Space stays layoutless in its source and stored
      aggregate until its first complete working-state request initializes it;
      import itself never rewrites the source Markdown, so an export taken before
      that request round-trips the layoutless state unchanged. Explicit Export after
      initialization writes the new Layout and Graph.
- [ ] Removed Computed View Ids, Space View selections and `defaultRenderer` are
      absent from canonical fixtures and rejected by the current schema rather
      than migrated or invented as compatibility fields.
- [ ] PostgreSQL integration proves the initialized aggregate survives a fresh
      application host and exports at the committed revision.

This ticket absorbs the aggregate criteria formerly proposed as
`layout-only-v1/05`, so it remains the one canonical aggregate-format and
destructive-replacement owner. ADR 0079 is the contract those criteria encode.
