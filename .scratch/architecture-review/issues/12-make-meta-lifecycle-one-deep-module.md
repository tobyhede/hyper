# Deepen the server-side repository around Meta lifecycle

Status: resolved
Tags: release/v1, Improvement
Blocked by: none — PR 134 delivered the aggregate foundation

Surfaced by: the 31 August 2026 Space Cards architecture review, candidate
“Make Meta lifecycle one deep module”. Revalidated against the aggregate
foundation merged by PR 134 and decided by ADR 0078.

## The problem

The permanent Meta invariant is distributed across mechanisms that cannot
enforce it together:

- `20260831T0159_add_repository_state/migration.ts` creates and conditionally
  seeds the singleton row from the legacy Entry Space;
- `lockRepositoryState` assumes that row exists when complete reads and commits
  need it;
- `establishMetaSpace` lets bootstrap and administrative import create it;
- truncation deletes it separately from the aggregate it identifies;
- startup, normal commit and the future complete import each carry a different
  part of the invariant.

The result is a shallow lock helper with a large implicit interface: callers
must know whether Meta state has been established, whether the operation may
replace it, which transaction owns the lock, and what an empty repository
means. A missing row becomes a runtime failure far from the operation that
failed to establish it.

This is the persistence half of `v1-release/01`; it must not create a second
meaning of Meta beside that ticket.

## Decision

The existing server-side repository is the deep module. Do not add a separate
`MetaLifecycle` interface, a storage-mechanics port or an adapter-kind switch.
PostgreSQL, memory and future adapters such as SQLite implement the same
domain-shaped repository interface and pass one behavioral contract; each keeps
its transactions, locks and atomic replacement mechanics private.

The server-side interface gains two distinct lifecycle operations:

- `initializeAggregate` establishes an explicit complete aggregate only when
  the repository is legitimately uninitialized;
- `replaceAggregate` atomically replaces an initialized repository under
  administrative authority and an expected current Meta identity.

Both inputs carry an explicit `metaSpaceId` and complete Space snapshots without
repository revisions. Neither operation infers Meta from array order,
cardinality, Entry state or topology. The receiving repository assigns fresh
revisions and returns the complete loaded aggregate it established.

`loadAggregate` returns either `uninitialized` for the one legitimate empty
state or `loaded` with an aggregate that has passed complete intake. Spaces
without Meta, Meta naming a missing Space and an invalid stored aggregate are
broken invariants, not alternate empty states and not values initialization may
repair.

The module owns these rules:

- an authored commit may neither change nor delete the configured Meta Space;
- invalid proposed aggregates return structured intake refusals while invalid
  stored state throws or reports an invariant failure;
- concurrent identical initialization compares canonical authored meaning and
  returns `existing` to the loser; a different proposal returns
  `already-initialized` and cannot overwrite state;
- `replaceAggregate` returns `uninitialized` instead of establishing first
  state, and a stale expected Meta identity conflicts;
- complete aggregate reads and integrity-affecting commits read the same
  validated identity;
- replacement coordinates with every affected Space so an incompatible
  authored commit and replacement cannot both report success;
- two authorized replacements with the same expected Meta identity may
  serialize and both succeed, with the later complete replacement winning;
- topology-preserving single-Space commits retain their unlocked fast path;
- confirmation and `--force` stay with the CLI and do not enter the repository
  interface.

Repository adapters share aggregate intake, result types and behavioral tests,
not transaction implementation. An adapter producing a different observable
outcome for the same contract scenario is defective rather than a supported
storage-specific variation.

Do not layer a new helper over `lockRepositoryState` and
`establishMetaSpace`. The deletion test applies: the old helpers and their
caller-owned ordering rules should disappear into the deeper module.

## Delivery sequence

This change is the expand step of an expand-contract migration. Add the final
lifecycle operations and move Meta policy behind them while keeping the tree
green. Existing `importSpaces(input, 'insert' | 'truncate')` may survive only as
a marked compatibility facade for its current callers; it must delegate Meta
establishment and replacement rather than remain a second policy owner, and no
new caller may use it.

`v1-release/01` migrates initialization and startup to
`initializeAggregate`. `v1-release/08` migrates complete administrative import
to `replaceAggregate` and performs the contract step: delete `ImportMode`, the
order-sensitive `importSpaces` facade and every inference of Meta from the first
Space. Ordinary Space creation remains an authored Space Card Edit.

## Release relationship

This blocks the persistence work in `v1-release/01` and is reused by
`v1-release/08`. Neither release ticket may add its own Meta ordering or
adapter-specific branch.

## V1 disposition

This is the binding Meta lifecycle implementation prerequisite. It deepens the
existing server-side repository seam and its shared adapter contract.
`v1-release/01` consumes it for initialization and startup; `v1-release/08`
consumes it for complete administrative replacement and removes the temporary
import facade. Neither release ticket may recreate its policy.

## Implementation acceptance

- [x] Add `initializeAggregate` and `replaceAggregate` only to the server-side
      repository interface; browser-facing repository consumers gain no
      lifecycle administration operation.
- [x] Make both operations accept an explicit Meta-rooted aggregate without
      repository revisions, assign fresh revisions and return the authoritative
      loaded aggregate.
- [x] Make `loadAggregate` distinguish `uninitialized` from a validated `loaded`
      aggregate and fail explicitly for every contradictory stored state.
- [x] Preserve the topology-preserving single-Space commit fast path without the
      singleton Meta lock.
- [x] Coordinate replacement with repository state and every affected Space so
      it is atomic against authored commits; preserve authorized
      last-replacement-wins behavior without adding an aggregate revision.
- [x] Run one shared behavioral contract against PostgreSQL and memory covering
      empty initialization, canonical identical concurrency, different
      concurrent proposals, invalid input, corrupt stored state, immutable Meta,
      validated reads, stale replacement, authored-commit races, two authorized
      replacements, rollback and returned revisions.
- [x] Keep SQL locks, singleton rows, foreign keys and memory candidate-state
      replacement private to their adapters; shared callers and tests never
      inspect or branch on adapter mechanics.
- [x] Replace `lockRepositoryState` and `establishMetaSpace` with the deeper
      repository implementation rather than layering new lifecycle helpers over
      them.
- [x] Turn `importSpaces` into a temporary compatibility facade with no Meta
      policy of its own, mark it for deletion by `v1-release/08`, and admit no
      new callers.
- [x] Update `v1-release/01` and `v1-release/08` to consume this interface and to
      own the remaining expand-contract migration steps rather than restating
      persistence ordering.

## Answer

Delivered by PR 142 (`614c9c14`). The server-side repository now owns Meta lifecycle through
`initializeAggregate`, `replaceAggregate` and the explicit `uninitialized | loaded` aggregate read.
Memory and PostgreSQL pass the same lifecycle contract, including canonical concurrent
initialization, replacement authorization and races with authored commits, while each adapter keeps
its candidate state, locks and transactions private. The unlocked topology-preserving commit path
remains intact.

The old caller-owned Meta establishment policy has been absorbed into the repository. The existing
`importSpaces` surface remains only as a marked compatibility facade that delegates to the lifecycle
operations. `v1-release/01` now owns startup initialization through `initializeAggregate`, and
`v1-release/08` owns administrative replacement plus removal of `ImportMode` and the facade.
