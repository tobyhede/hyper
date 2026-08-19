# The repository is the only source of state

Status: accepted
Refines: 0054

There are two environments: a developer's `git clone` and CI. There is no
production environment, no release, no users, and no data, document or byte that
outlives either. Every database, space directory and generated artifact is
**derived** — the codebase mints it from tracked seeds, fixtures, migrations and
scripts — so a reset regenerates it and nothing is lost.

Two things follow, and the second is the one that gets forgotten. A format change
rolls the schema, the fixtures, the tests and the generators forward in one
change. And generated state that disagrees with the code that generates it is a
**bug at the source**: the repair is to make the codebase self-consistent and
regenerate, never to teach a reader the shape the old generator wrote.

The negative is the durable part: **do not add a compatibility path for state a
previous build wrote.** No transitional read, no aliased key, no version bump,
and no refusal naming the retired shape — a refusal is still the codebase
carrying knowledge of a shape that cannot reach it. This is what a review
re-suggests every time a persisted key is renamed, and it has been suggested
twice already: renaming `defaultView` to `defaultRenderer` (ADR 0055) drew first
a transitional read and then a pre-parse refusal at `documentRefusal`, each
argued from stored documents that a reset regenerates.

This is deliberately surprising, and ADR 0054 says why for documents: the format
carries a version literal, intake has a document-refusal gate, and
`migrations/app/` exists. Those signals normally imply a compatibility
obligation. **State the boundary or this will be over-applied** — they prepare
and define the system rather than describing shipped data. `migrations/app/`,
the Prisma contract and `SPACE_FILE_VERSION` remain how the schema is defined
and applied, and this is not licence to delete them or to skip a migration.
`documentRefusal` keeps the refusals it has: they answer a version this build
cannot read and a shape a *current* generator could still produce, which is
consistency in the codebase rather than compatibility with a past one.

We rejected treating a developer's local database as durable, which is what
every compatibility proposal assumes. The accepted cost is that a format change
destroys a local database and any local space directory, so **bootstrapping and
hard reset have to stay cheap** — a developer who reaches for one should not be
tempted to write a migration to avoid it.

ADR 0054 decided this for document backwards compatibility while Hyper is an
unreleased prototype. This generalises it to all state and to the positive
obligation on the codebase. Both hold until there is a release; that changes the
premise, not the reasoning.
