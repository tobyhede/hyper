# The server-side repository owns Meta lifecycle

Status: accepted
Refines: 0069
Related: 0030, 0056, 0074, 0077

The existing server-side repository is the deep module that owns Meta
establishment, validated complete reads, integrity-affecting commits and
administrative aggregate replacement. Hyper does not add a separate Meta
lifecycle interface for callers to coordinate with the repository, and the
browser-facing repository seam does not expose establishment or administrative
replacement.

This concentrates the invariant without serialising unrelated work. A
topology-preserving single-Space Edit keeps its unlocked repository fast path;
only complete reads and integrity-affecting commits require validated Meta
identity and repository-state serialisation. Existing commit, conflict,
aggregate-refusal and atomic-replacement behaviour remains authoritative while
initialization and complete administrative replacement gain the domain-shaped
operations the V1 lifecycle requires.

Repository adapters share domain intake, outcome types and one behavioral
contract, not a storage-mechanics port or one lifecycle implementation. Each
adapter supplies its own atomicity and concurrency implementation behind that
interface: PostgreSQL uses database transactions and locks, memory uses
candidate-state replacement, and a future SQLite adapter may use its own native
mechanisms without changing callers. An adapter that produces a different
observable outcome for the same contract scenario is defective, not an
accepted storage-specific variation.

The server-side repository interface is the sole adapter seam. It exposes
separately named initialization and administrative replacement operations so a
destructive choice is never hidden in a mode parameter, and both take a complete
aggregate carrying its explicit `metaSpaceId`; no adapter infers Meta from
ordering, cardinality, Entry state or topology. PostgreSQL, memory and future
adapters implement that same interface and must pass the same lifecycle
behavioral contract. Callers neither detect an adapter kind nor negotiate
storage-specific capabilities.

An uninitialized repository has no Spaces and no Meta identity. Spaces without
Meta, Meta naming a missing Space, and a stored aggregate that fails complete
intake are broken invariants: initialization neither infers nor repairs them.
Invalid proposed aggregates instead return structured intake refusals because
they are anticipated caller input. Concurrent identical initialization is
idempotent—one caller establishes the deterministic aggregate and the other
continues from it—while a different proposal receives an explicit
already-initialized outcome and cannot overwrite state.

`loadAggregate` returns an explicit `uninitialized` outcome for that legitimate
empty state and a validated `loaded` outcome otherwise. `replaceAggregate`
returns `uninitialized` rather than establishing first state, so callers must
use `initializeAggregate` and the two operations do not overlap. Contradictory
stored state remains an invariant failure rather than either outcome.

The order-sensitive `importSpaces(input, 'insert' | 'truncate')` interface is
retired rather than kept as a second lifecycle door. First run uses explicit
initialization, complete administrative import and hard reset use explicit
replacement, and ordinary Space creation remains an authored Space Card Edit.
Test helpers seed through those same operations.

The operations are `initializeAggregate` and `replaceAggregate`.
Initialization returns `initialized` to the caller that establishes state,
`existing` with the established aggregate to an identical concurrent caller,
and `already-initialized` to a different proposal. `loadAggregate` completes
aggregate intake before returning, so its successful result is always valid.
Administrative replacement requires the expected current Meta identity and
returns a conflict when that identity is stale.

Concurrent initialization compares canonical authored meaning after intake,
not raw serialization order. Inventories identified by durable Id ignore order
where the domain assigns none, while authored fields and ordered collections
remain significant; incidental Space or Card array order therefore cannot turn
the same Default Content into an already-initialized refusal.

Interactive confirmation and `--force` belong to the CLI, which turns a human
choice into authority to call `replaceAggregate`; they do not enter the
repository interface. The repository enforces validity, atomicity and
concurrency after that authority has already been established.

Replacement coordinates with every affected Space as well as repository state.
An incompatible authored commit and replacement cannot both report success:
the operation that loses the relevant row race observes stale or missing state
and conflicts. Initialization and replacement inputs contain no optimistic
repository revisions; the receiving repository assigns fresh revisions and
returns the complete loaded aggregate it actually established.

Two explicitly authorized replacements carrying the same expected Meta identity
may serialize and both succeed; the later complete replacement wins. Hyper does
not add an aggregate revision solely to arbitrate competing administrators, but
neither replacement may interleave into partial state.
