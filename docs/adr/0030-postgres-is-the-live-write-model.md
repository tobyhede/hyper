# PostgreSQL is the live write model; files are imported and exported

Status: accepted
Supersedes: 0019, 0029
Refines: 0010, 0020

Hyper persists every edit transactionally to PostgreSQL and regenerates the
existing `space.json` plus card Markdown structure through explicit CLI export.
Files remain hand-authorable, reviewable and commit-friendly, but they are no
longer the live working copy. This separates editing durability from repository
publication and removes the need to preserve file paths and source bytes through
the application.

Spaces and cards are UUID-keyed rows with JSONB documents. Routes and layouts
remain nested in the space document. An id is optional only in import input: an
explicit id must be a UUID and is used for upsert, while PostgreSQL allocates
every missing space, card, route and layout id. An id-less entity is therefore
always new until export writes its generated UUID.

Import, seed data and test fixtures share one transactional import mechanism.
Without deletion mode it inserts and upserts but never deletes by absence. The
CLI's `--dangerous-truncate` mode deletes all Hyper content and imports the
complete batch in one transaction. Export is CLI-only, canonical rather than
byte-preserving, and records the database revision it projected.

Prisma Next supplies the contract-first PostgreSQL runtime and migration model
behind a repository seam. A memory adapter lands first so user-experience work
can continue while PostgreSQL integration is built. The chosen Prisma Next
release and its project-local agent skill cluster are version-pinned together.

The trade-off is deliberate: editing now depends on a running database and
hand-edited files do not affect an open application until imported. In return,
normal edits are durable without an explicit Save, multi-entity changes are
atomic, and file provenance no longer leaks across the domain and persistence
interfaces.
