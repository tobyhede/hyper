# A multi-Space Edit is judged against what it commits

Status: ready-for-agent
Tags: Improvement
Blocked by: None — can start immediately.

Surfaced by: the 17 September 2026 architecture review of the database-persistence branch, candidate 3, then settled by a grilling loop and recorded as ADR 0095 (refining ADR 0076). Candidate 1 of the same review was rejected as ADR 0094.

## The defect

`runSpaceThingCoordination` (`packages/persistence/src/session-registry.ts`) derives and pre-checks a coordinated Space Thing lifecycle Edit against a candidate that overlays **every** open Space's working Space on the stored aggregate (`:468-473`; again at `:944-947` in `deleteContext` and `:1161-1166` in `delete`), and checks it with `loadSpaceAggregate` directly (`:487`). The commit carries only the participants (`:630-655`), and the repository judges it with `decideCommit` against storage. The barrier waits for in-flight commits only: `waitForIdle` is `!inFlight && !coordinating` (`session.ts:416`), and queued work (`waiting`) is untouched.

Reachable in one tab over HTTP:

- **Link to local-only content.** Space T's newest Graph is still queued local work (behind the barrier's pause) or T is `failed`. Linking M→T reads T's working Space for the selection (`workingTargetSelection`, `:811-816`), picks that Graph, passes the pre-check, answers `completed`, and the repository refuses it as `space-thing-graph-missing`; M becomes `rejected`.
- **Delete after a transient failure.** X is referenced from M and N. Deleting M's Space Thing fails transiently, leaving M `failed` with a working Space that no longer references X. Deleting N's Space Thing counts X's inbound references over working Spaces, cascades through X, passes the pre-check, and the repository answers `conflict` because stored M still references X.

Latent (memory backend only): the pre-check lacks `decideCommit`'s `baselineUnreferenced` forgiveness. A real repository refuses to load such a baseline, so the browser answers `persistence-read-failed` first.

`delete` and `deleteContext` also read `backend.loadAggregate()` inside `derive` (`:934`, `:1145`) and the coordination reads it again (`:459`) — two aggregate reads per turn with a gap between them.

## Decided

- The barrier waits for every open Space's queued local work to commit before `derive` runs, not only for in-flight commits.
- One `backend.loadAggregate()` per turn. `derive` and the pre-check use the same view: stored Spaces, with participants read as their working Spaces. Spaces the Edit does not change are read as stored, including the link target's selection and every reference count a deletion cascade takes.
- The pre-check is `decideCommit` over that view.
- A link whose target is `failed` or `conflicted` refuses as `persistence-recovery-required` for the target, like the containing Space. A failed Space the Edit only counts references in does not refuse it.
- Unchanged from ADR 0076: `rejected` Spaces may participate, the persistence outcome is shared by all participants, and the operation answers `completed` once installed.

Rejected, and recorded in ADR 0095: committing every divergent open Space as a participant; refusing whenever any open Space needs recovery; waiting only for the Spaces the Edit touches.

## Acceptance

- [ ] `space-thing-lifecycle.test.ts:288` ("validates against the latest working snapshot of every open Space") is rewritten to assert the new rule: a non-participant's `rejected` local work does not refuse a link that changes only Meta.
- [ ] Regression test: with T's newest Graph queued as local work, linking M→T selects that Graph and the repository accepts the commit.
- [ ] Regression test: with T `failed` or `conflicted`, linking M→T refuses as `persistence-recovery-required` naming T and installs nothing.
- [ ] Regression test: the delete-after-transient-failure scenario above does not cascade through X, and commits.
- [ ] Regression test: an Edit the repository would refuse is refused by the pre-check with the refusal `decideCommit` gives, before anything is installed.
- [ ] The registry reads the aggregate once per coordination turn; `delete` and `deleteContext` no longer read it inside `derive`.
- [ ] The registry calls `decideCommit` and no longer calls `loadSpaceAggregate` for the pre-check.
- [ ] All tests go through the registry's interface on `MemorySpaceBackend`; `packages/app` tests that exercise Space Thing lifecycle still pass.

Out of scope: when the operation answers (ADR 0076's early `completed` stays); how `derive` returns refusals and completions (candidate 7 of the same review).
