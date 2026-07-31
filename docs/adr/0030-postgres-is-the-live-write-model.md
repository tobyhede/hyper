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
explicit id must be a UUID and must not collide within the scope that resolves
it — set out below — while every missing space, card, route and layout id is
minted during the import transaction. An id-less entity is therefore always new
until export writes its generated UUID.

**Uniqueness is scoped to how an id is resolved.** Space and card ids are unique
across the database, being primary keys; import additionally rejects a batch that
repeats either, so a collision surfaces before any write rather than as a late
constraint violation. Route and layout ids are unique only within the space
document that carries them, per kind, which normal domain intake already checks.
They may be reused in another space — stored or elsewhere in the same batch — and
entities of different kinds may share a UUID.

Nothing resolves a route or layout id outside its own space: there is no routes
table and no layouts table, and every query is by space id or card id. So a
reused nested id makes no lookup ambiguous, and rejecting one would mean reading
every stored document on every import to defend an invariant no code depends on.
Don't add that check, and don't widen the batch check to route or layout ids —
doing so makes acceptance depend on how a batch was split, since importing two
such spaces separately would still succeed.

Minting is not allocation, and the database is not a source of identity. A
space's id comes from the `spaces.id` column default, because that is what a
primary key already does; every other id is generated in process. Routes and
layouts are not rows — they are nested in the space document — so no column
default can reach them, and the application mints layout ids the same way when
editing converts an Algorithmic View (ADR 0025).

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

The first increment is built: version 2 public schemas require UUIDs, import
schemas allow persistence-owned ids to be omitted, and `SpaceBackend`,
`SpaceSession` and the memory adapter drive automatic whole-snapshot commits.
The Vite file integration is now a read-only import source; there is no browser
Save action or file write-back endpoint.

The Prisma Next/PostgreSQL adapter and insert-only transactional importer are
built, as is database-driven startup: server-side policy resolves the zero, one
and many-space cases, the CLI applies it after an import or with no path, and the
application opens an exact backend workspace or renders the UUID-only selector.

The HTTP backend composition that carries those startup results into the browser,
the CLI-only canonical exporter and PostgreSQL CI integration remain to be built.
