# PostgreSQL is the live write model; files are imported and exported

Status: accepted
Supersedes: 0019, 0029
Refines: 0010, 0020
Refined by: 0040, 0041, 0058

Hyper persists every edit transactionally to PostgreSQL and regenerates the
existing `space.json` plus card Markdown structure through explicit CLI export.
Files remain hand-authorable, reviewable and commit-friendly, but they are no
longer the live working copy. This separates editing durability from repository
publication and removes the need to preserve file paths and source bytes through
the application.

In the built version 2 implementation, Spaces and Cards are UUID-keyed rows
with JSONB documents, while Routes and Layouts remain nested in the Space
document. An id is optional only in import input: an explicit id must be a UUID
and must not collide within the scope that resolves it — set out below — while
every missing Space, Card, Route and Layout id is minted during the import
transaction. An id-less entity is therefore always new until export writes its
generated UUID. ADRs 0040 and 0041 replace these version 2 Route rules with
Layout-owned Graphs in the first-public document.

**For the built version 2 implementation, uniqueness is scoped to how an id is
resolved.** Space and Card ids are unique across the database, being primary
keys; import additionally rejects a batch that repeats either, so a collision
surfaces before any write rather than as a late constraint violation. Route and
Layout ids are unique only within the Space document that carries them, per
kind, which normal domain intake already checks. They may be reused in another
Space — stored or elsewhere in the same batch — and entities of different kinds
may share a UUID.

In that version 2 implementation, nothing resolves a Route or Layout id outside
its own Space: there is no Routes table and no Layouts table, and every query is
by Space id or Card id. So a reused nested id makes no lookup ambiguous, and
rejecting one would mean reading every stored document on every import to defend
an invariant no code depends on. Don't add that check, and don't widen the
batch check to Route or Layout ids — doing so makes acceptance depend on how a
batch was split, since importing two such Spaces separately would still
succeed.

Minting is not allocation, and the database is not a source of identity. In the
version 2 implementation, a Space's id comes from the `spaces.id` column
default, because that is what a primary key already does; every other id is
generated in process. Routes and Layouts are not rows — they are nested in the
Space document — so no column default can reach them, and the application mints
Layout ids the same way when editing converts an Algorithmic View (ADR 0025).

Import, seed data and test fixtures share one transactional import mechanism.
Ordinary import inserts complete new Spaces and rejects the whole batch on any
existing identity; it never updates, merges or deletes existing content. Each
imported Space is a self-contained aggregate: stored state cannot supply an
omitted card, route, layout or reference target. The CLI's
`--dangerous-truncate` mode deletes all Hyper content and inserts the complete
batch in one transaction. Export is CLI-only, canonical rather than
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

## Implementation status

The version 2 shape described by this implementation status is the built
pre-0040/0041 implementation, including Space-scoped Route identity. ADRs 0040
and 0041 supersede it as the accepted first-public document contract: version 1,
with Layout-owned Graphs nested under Layouts. Version 2 is not a compatibility
format or a second public document shape.

The first increment is built: version 2 implementation schemas require UUIDs, import
schemas allow persistence-owned ids to be omitted, and `SpaceBackend`,
`SpaceSession` and the memory adapter drive automatic whole-snapshot commits.
There is no browser Save action or file write-back endpoint. The Vite file
integration is gone entirely — file discovery and parsing are server-side CLI
and import concerns, and the browser reaches persistence only over HTTP.

The Prisma Next/PostgreSQL adapter and insert-only transactional importer are
built, as is database-driven startup: server-side policy resolves the zero, one
and many-space cases, the CLI applies it after an import or with no path, and the
application opens an exact backend workspace or renders the UUID-only selector.

The HTTP composition is built: the normal browser runtime uses the typed
`HttpSpaceBackend` against the Fetch-native Hono application over
`PostgresSpaceRepository`. The current Vite host adapts that application to
Node, while database-free browser tests exercise the same interface over
isolated memory repositories. Ordered rapid edits, explicit retry, stale
conflicts, navigation protection and durability across both reload and a fresh
PostgreSQL-backed Vite host are covered.

The CLI-only canonical exporter is built: it writes deterministic, fully
identified version 2 implementation files through a validated staging directory,
atomically
replaces the destination's managed projection while preserving files outside
discovery scope, and records the exact exported revision after replacement.

PostgreSQL CI integration is built: a dedicated peer job starts the pinned
Compose service with generated masked credentials, applies the committed
migration history, runs the complete integration suite and verifies the live
database contract.
