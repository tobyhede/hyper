# Carry owned Graphs through export, import and the CLI

Status: ready-for-agent
Blocked by: 02

## What to build

Every writer and adapter outside the browser reads and writes the version 1
shape: a Graph exists only inside the Layout that owns it.

- **Canonical export** emits version 1 with each Layout's Graphs nested, still
  deterministic — a stable key order within a Layout and a stable Graph order
  across one, so a re-export of unchanged content is byte-identical. It keeps
  its staged, validated replacement and its recorded projected revision.
- **PostgreSQL import decoding** mints every missing Graph id in process. It
  mints them where they now live — under each Layout — rather than from a
  Space-level array. A Layout id and its Graph ids are minted in the same pass,
  before the snapshot is validated and before the first Card is written, so a
  rejection still rolls the whole batch back.
- **The insert path** writes an initial document with no Graph collection at
  all, because a Space has none until a Layout exists.
- **A new Space** mints one Card, no Layout and no Graph. It currently carries
  an empty Space-level Graph array; that key is simply gone.
- **The CLI** reports diagnostics in the same vocabulary, including the new
  duplicate-Graph-id error, which names both owning Layouts.
- **The repository contract, the memory repository and the HTTP snapshot
  boundary** carry the new shape. The snapshot schema derives from the document
  schema, so most of this is fixture and assertion work rather than new logic —
  check that it really is before writing any.

## Green bar

Shared branch, and **this is where the whole-program bar comes back**. It
migrates the last consumers of the old shape, including `test/unit` and
`test/integration`, so `pnpm typecheck`, `pnpm typecheck:packages` and
`pnpm lint` all pass again at the end of it. If they don't, something earlier
was left half-done — find it rather than patching here.

`pnpm test` passes except the tests that load the tracked fixture, which is
still version 2 until `05`. Name those in the commit so `05` knows its list.
E2E stays red until `05`.

PostgreSQL integration needs `pnpm postgres:up` first and `pnpm postgres:down`
after — always stop it.

## Acceptance criteria

- [ ] Export produces version 1 with Layout-owned Graphs, and a re-export of
      unchanged content is byte-identical.
- [ ] Import mints missing Layout and Graph ids together; an existing identity
      rejects and rolls back the complete batch as before.
- [ ] A new Space carries one Card, no Layout and no Graph, and still opens.
- [ ] The CLI surfaces the duplicate-Graph-id error naming both owners.
- [ ] Repository, backend and HTTP contract tests carry the version 1 shape.
- [ ] PostgreSQL integration green against a live database.
