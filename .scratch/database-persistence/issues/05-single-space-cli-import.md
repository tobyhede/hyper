# 05 — Single-space CLI import

**What to build:** Let `hyper` import one existing space file or space directory into PostgreSQL, resolving every missing identity through the database and reporting the imported stored space and id. Issue 07 owns choosing and opening the database workspace.

**Blocked by:** 01 — Version 2 UUID migration; 04 — PostgreSQL space repository.

**Status:** ready-for-agent

- [ ] `hyper <space.json>` imports the containing space, and `hyper <space-directory>` imports the space in that directory.
- [ ] Card discovery remains non-recursive and limited to Markdown files beside `space.json` and immediately under `cards/`.
- [ ] The complete input is discovered and parsed before a write transaction begins.
- [ ] PostgreSQL allocates UUIDs for every missing space, card, route, and layout id.
- [ ] An entity with an explicit UUID upserts that entity; an entity without an id always inserts a new entity.
- [ ] Import introduces no temporary identity or filename-based reference: every UUID reference must resolve to an explicitly identified entity, and an id-less entity cannot be referenced until export writes its generated UUID.
- [ ] Duplicate explicit UUIDs and cross-space card ownership conflicts fail the import without partial writes.
- [ ] The file adapter and programmatic seeds/test fixtures share the same core import mechanism.
- [ ] Successful import returns and reports the imported `StoredSpace` and id; any failure exits non-zero with paths and entity ids where relevant. Choosing or opening a database workspace remains issue 07's responsibility.
- [ ] Tests cover explicit-id updates, id-less insertion, complete UUID allocation, rejection of UUID references to id-less entities, validation errors, and transaction rollback.
