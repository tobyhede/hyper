# 39 — `#replaceAllSpaces` has no stated error interface

Status: resolved
Tags: Cleanup, release/v1
Blocked by: None. (Ticket 31, which this was once to accompany, is resolved.)

Surfaced by: the design session of 2026-09-20, while checking whether `ThingOwnershipError` (now `ResourceOwnershipError`, `src/persistence/sql-space-repository.ts:36`) escaping `replaceAggregate` was a live defect. It is not — the reason it is not is the finding.

Audited: 2026-09-20 against `b1ac983d`. The missing replacement contract case remains absent. This is a coverage and error-interface gap; no reachable duplicate-Resource replacement failure was demonstrated. It joins the final release proof independently of ticket 31.

## The defect

`#replaceAllSpaces` (`src/persistence/sql-space-repository.ts`) is one private method with two callers, and each encodes a different belief about what it can throw. Neither is written down; neither is checked.

`#initializeUnserialised` (`:886`) handles `ResourceOwnershipError` and duplicate keys on `spaces`/`repository_state` by re-reading and classifying. `#replaceUnserialised` (`:925`) handles `StaleSpaceRevisionError` and propagates other failures. These filters identify recoverable cases; neither says all other errors are impossible. In particular, the stale-revision error is raised by replacement's relock loop before `#replaceAllSpaces`, not by the shared method itself.

Both beliefs are correct today. The second is correct for reasons outside this module: `loadSpaceAggregate`'s aggregate-wide `duplicate-resource-id` check (`packages/graph/src/space-aggregate.ts:109-118`, a different package) runs before the transaction opens and refuses the only input that could collide once `#truncateHyperContent` has emptied the store; and the Meta lock plus per-row `relock` loop (`:751`, `:951-960`) make a concurrent replacement lose before any Resource is written. Nothing ties either fact to that catch.

## The asymmetry is correct; its silence is not

The two doors detect a lost race differently because they must. `replaceAggregate` detects it proactively — lock, re-lock, compare revisions, raise `StaleSpaceRevisionError` at a point it chooses. `initializeAggregate` cannot: initializing means there is no Meta row and no Space row to lock, so the first writer to an empty store discovers contention only by colliding with a unique constraint. ADR 0078 makes first state its own door for the same reason.

So this is not a proposal to make the two catches identical. It is a proposal to state, where both callers read it, what the method they share can raise.

## Why it is not a defect, and why that matters

Duplicate proposed Resource identities are refused by aggregate intake before replacement writes anything. That is a deliberate guarantee in another package, and `docs/agents/workflow.md` asks for executable evidence binding such guarantees to their consumers. The missing replacement case should fail if that protection is removed. `replaceAggregate` itself has no HTTP status; the earlier claim that it would answer 503 confused a repository failure with transport classification.

The missing coverage is concrete: `test/support/repository-contract.ts:835` ("refuses an aggregate that repeats a Resource identity, storing none of it") exercises `initializeAggregate` only. There is no `replaceAggregate` equivalent on any of the contract's three targets (PostgreSQL, SQLite and the memory repository).

## Acceptance

- [x] A case in `spaceRepositoryContract` (`test/support/repository-contract.ts`) asserting that, over a seeded aggregate, `replaceAggregate` refuses an aggregate repeating a Resource identity with `kind: 'aggregate-refused'` and an error containing `{ kind: 'duplicate-resource-id', resourceId }`, storing none of it and leaving the existing aggregate intact (`listSpaces` and `loadSpace` answer what was seeded). Worth landing alone even if the rest defers: it binds the narrow catch to the cross-package guarantee holding it up.
- [x] State the shared method's known failure modes and the callers' recovery preconditions where both callers can find them, including propagation of unexpected database failures. Do not claim a closed thrown-error set. A typed result is an option to evaluate, not a requirement to introduce a new lifecycle decision seam contrary to ADR 0096.
- [x] The reason the two handlings differ is recorded at the method, not inferred from two catches that disagree.
- [x] No behavioural change: every existing lifecycle case in `spaceRepositoryContract` stays green, the new case is the only addition.

## Relationship to ticket 31

The same defect one level down. Ticket 31 (now resolved) gave failure classification a module at the HTTP seam, where readers had re-derived an arm from a negation. This is error modes being caller-side conventions about a private method at the repository's own seam. Settling it here answers "what this can fail with, and what each failure means" at the second seam in the same idiom as the first.

## Comments

### Triage, 2026-10-09

> *This was generated by AI during triage.*

**Category:** enhancement. **State:** ready-for-agent.

Still valid. The duplicate-Resource contract case covers only `initializeAggregate` (`test/support/repository-contract.ts:835`), with no `replaceAggregate` equivalent. The two catches in `src/persistence/sql-space-repository.ts:912-918` and `:964` are still unexplained at `#replaceAllSpaces` (`:856`). The body now uses Resource names where it said Thing (`ResourceOwnershipError`, `duplicate-resource-id` at `packages/graph/src/space-aggregate.ts:118`), its line refs are refreshed, the first acceptance criterion names the expected refusal, and the blocker on resolved ticket 31 is dropped. The work is one contract case plus a doc comment with no behaviour change, so it is ready for an agent.

## Resolution (2026-10-09)

- Aggregate intake refuses a repeated Space identity (`duplicate-space-id`) as well as a repeated Resource one, and replacement relies on both, so the one addition is a table-driven contract case run for each: `refuses a replacement that repeats a {Space,Resource} identity, keeping the stored aggregate` (`test/support/repository-contract.ts`). Each seeds an aggregate, offers `replaceAggregate` a proposal repeating the identity, and asserts `aggregate-refused` with the matching error. "Leaving the existing aggregate intact" is asserted as `loadAggregate` answering exactly the seeded aggregate, which subsumes what `listSpaces` and `loadSpace` would answer. The case runs on the memory repository and both SQL databases through `spaceRepositoryContract`.
- Binding checked by hand, on the memory repository and SQLite (not PostgreSQL): with only `space-aggregate.ts`'s two duplicate checks disabled, all four runs of the new cases fail; restored, they pass.
- `#replaceAllSpaces` (`src/persistence/sql-space-repository.ts`) now carries a doc comment naming what it can raise — `ResourceOwnershipError` and duplicate keys on `spaces`/`repository_state`, `AggregateInvariantError` from the read-back, any other database failure — which caller recovers from which, and why. It does not claim a closed set, and no typed result was introduced (ADR 0096).
- The ticket's account of the asymmetry ("an empty store has no row to lock") no longer holds: both callers take the aggregate lock (`lockAggregate`) before reading, so two Hyper initializations do not collide. On PostgreSQL that lock is an advisory lock independent of any Meta row, and the two serialize. On SQLite `lockAggregate` takes nothing itself (`src/sqlite/sql-store.ts`): the same-handle queue serializes work on one handle, and a writer on another handle is refused by the file locks as BUSY/LOCKED, which the repository classifies unavailable rather than as a duplicate key. What initialization's catch actually defends against is a writer outside the aggregate lock, as `postgres-space-repository.test.ts`'s "classifies initialization when a concurrent winner takes a shared Resource identity" arranges. The comment states that, and the existing comment at that catch, which described a race between first proposals, was corrected to match.
- No behavioural change.
