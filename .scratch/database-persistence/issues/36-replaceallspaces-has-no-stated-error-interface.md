# 36 — `#replaceAllSpaces` has no stated error interface

Status: needs-triage
Tags: Cleanup, release/v1
Blocked by: None. Wanted as part of ticket 31's Part A refactoring rather than before it.

Surfaced by: the design session of 2026-09-20, while checking whether `ThingOwnershipError` escaping `replaceAggregate` was a live defect. It is not — the reason it is not is the finding.

Audited: 2026-09-20 against `b1ac983d`. The missing replacement contract case remains absent. This is a coverage and error-interface gap; no reachable duplicate-Thing replacement failure was demonstrated. It joins the final release proof independently of ticket 31.

## The defect

`#replaceAllSpaces` (`src/persistence/sql-space-repository.ts`) is one private method with two callers, and each encodes a different belief about what it can throw. Neither is written down; neither is checked.

`#initializeUnserialised` handles `ResourceOwnershipError` and duplicate keys on `spaces`/`repository_state` by re-reading and classifying. `#replaceUnserialised` handles `StaleSpaceRevisionError` and propagates other failures. These filters identify recoverable cases; neither says all other errors are impossible. In particular, the stale-revision error is raised by replacement's relock loop before `#replaceAllSpaces`, not by the shared method itself.

Both beliefs are correct today. The second is correct for reasons outside this module: `loadSpaceAggregate`'s aggregate-wide `duplicate-thing-id` check (`packages/graph/src/space-aggregate.ts:105-115`, a different package) runs before the transaction opens and refuses the only input that could collide once `#truncateHyperContent` has emptied the store; and the Meta lock plus per-row `relock` loop (`:751`, `:775-781`) make a concurrent replacement lose before any Thing is written. Nothing ties either fact to that catch.

## The asymmetry is correct; its silence is not

The two doors detect a lost race differently because they must. `replaceAggregate` detects it proactively — lock, re-lock, compare revisions, raise `StaleSpaceRevisionError` at a point it chooses. `initializeAggregate` cannot: initializing means there is no Meta row and no Space row to lock, so the first writer to an empty store discovers contention only by colliding with a unique constraint. ADR 0078 makes first state its own door for the same reason.

So this is not a proposal to make the two catches identical. It is a proposal to state, where both callers read it, what the method they share can raise.

## Why it is not a defect, and why that matters

Duplicate proposed Thing identities are refused by aggregate intake before replacement writes anything. That is a deliberate guarantee in another package, and `docs/agents/workflow.md` asks for executable evidence binding such guarantees to their consumers. The missing replacement case should fail if that protection is removed. `replaceAggregate` itself has no HTTP status; the earlier claim that it would answer 503 confused a repository failure with transport classification.

The missing coverage is concrete: `test/support/repository-contract.ts:518` ("refuses an aggregate that repeats a Thing identity, storing none of it") exercises `initializeAggregate` only. There is no `replaceAggregate` equivalent on any of the three repositories.

## Acceptance

- [ ] A contract case asserting `replaceAggregate` refuses an aggregate repeating a Thing identity, storing none of it and leaving the existing aggregate intact. Worth landing alone even if the rest defers: it binds the narrow catch to the cross-package guarantee holding it up.
- [ ] State the shared method's known failure modes and the callers' recovery preconditions where both callers can find them, including propagation of unexpected database failures. Do not claim a closed thrown-error set. A typed result is an option to evaluate, not a requirement to introduce a new lifecycle decision seam contrary to ADR 0096.
- [ ] The reason the two handlings differ is recorded at the method, not inferred from two catches that disagree.
- [ ] No behavioural change: every existing lifecycle case in `spaceRepositoryContract` stays green, the new case is the only addition.

## Why it belongs with ticket 31

The same defect one level down. Ticket 31 is failure classification having no module at the HTTP seam, where readers re-derive an arm from a negation. This is error modes being caller-side conventions about a private method at the repository's own seam. Together, "what this can fail with, and what each failure means" gets settled once at both seams rather than twice in two idioms.
