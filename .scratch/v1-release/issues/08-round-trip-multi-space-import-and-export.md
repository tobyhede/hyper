# 08 — Round-trip the complete Space aggregate

Status: ready-for-agent
Tags: release/v1
Blocked by: 01; `space-cards/03`

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
      Meta identity. There is no public merge mode. Raw directory batches remain
      internal to seeds and fixtures.
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
      normal intake, including converging Space Cards and all selected Space Views
      and Graphs.
