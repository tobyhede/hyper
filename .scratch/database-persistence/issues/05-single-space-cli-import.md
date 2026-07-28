# 05 — Single-space CLI import

**What to build:** Let `hyper` import one existing space file or space directory into PostgreSQL, resolving every missing identity through the database and then opening the imported space.

**Blocked by:** 03 — PostgreSQL space repository; 04 — Version 2 UUID migration.

**Status:** ready-for-agent

- [ ] `hyper <space.json>` imports the containing space, and `hyper <space-directory>` imports the space in that directory.
- [ ] Card discovery remains non-recursive and limited to Markdown files beside `space.json` and immediately under `cards/`.
- [ ] The complete input is discovered and parsed before a write transaction begins.
- [ ] PostgreSQL allocates UUIDs for every missing space, card, route, and layout id.
- [ ] An entity with an explicit UUID upserts that entity; an entity without an id always inserts a new entity.
- [ ] Generated ids are installed consistently into edges, aliases, layout positions, route filters, active routes, and the default view before domain validation.
- [ ] Duplicate explicit UUIDs and cross-space card ownership conflicts fail the import without partial writes.
- [ ] The file adapter and programmatic seeds/test fixtures share the same core import mechanism.
- [ ] Successful import opens the imported space; any failure exits non-zero with paths and entity ids where relevant.
- [ ] Tests cover explicit-id updates, id-less insertion, complete UUID allocation, reference remapping, validation errors, and transaction rollback.

