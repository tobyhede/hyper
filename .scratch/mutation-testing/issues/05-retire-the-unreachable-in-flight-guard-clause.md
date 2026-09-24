# 05 — Retire the unreachable `inFlight` clause in the session's conflict and retry guards

**What to build:** Decide, and then act on, whether `SpaceSession`'s `retry` and `resolveConflict` guards should keep their `|| inFlight` disjunct now that it is known to be unreachable — either delete both clauses, or keep them and record in the source why a clause no test can distinguish is worth carrying.

Ticket 03 established the reachability answer while closing the oracle gaps and deliberately left the production code alone; the evidence is in `.scratch/mutation-testing/oracle-space-session.md` under "The `|| inFlight` reachability question". In short: `inFlight` is written in exactly two places, and `startCommit` publishes `{ kind: 'pending' }` in the same straight-line step that sets it `true`, so `inFlight === true` implies the installed persistence kind is `pending`. The first disjunct of each guard (`kind !== 'failed'`, `kind !== 'conflicted'`) is therefore already true whenever `inFlight` is, and `|| inFlight` never decides. Dropping either clause leaves the full 1651-test suite green.

This is a design question, not an oracle question: no test can distinguish the two programs, so no test should be written to justify either answer. The decision is whether the redundancy is defensive documentation of an invariant or dead weight that misleads a reader into thinking the pair is reachable.

**Blocked by:** 03 — Close the valuable SpaceSession oracle gaps.

**Status:** resolved — both `|| inFlight` disjuncts deleted from `packages/persistence/src/session.ts`, and the invariant the guards rely on is written on the `inFlight` declaration with a pointer at each guard. `pnpm mutate:session` goes from 375 / 249 / 69 / 57 / 66.40% to 371 / 245 / 69 / 57 / 66.04%: four killed mutants leave the corpus and nothing else changes. See *Answer*, which also records one test the deletion required and a narrowing of the invariant's wording.

- [x] The reachability argument is re-checked against the current `session.ts` rather than taken on trust from ticket 03, including the claim that every `startCommit` call site is guarded by `!inFlight` or runs after `inFlight = false`.
- [x] Both occurrences are treated together — `retry` (`session.ts:160`, `356` before this change) and `resolveConflict` (`session.ts:177`, `392` before this change) carry the identical clause for the identical reason.
- [x] Whichever way it goes, the invariant "`inFlight` implies `pending`" is written down where a reader of the guard will find it, since it is the whole reason the clause is redundant. *Written in the narrower form the guards need, "`inFlight` implies neither `failed` nor `conflicted`" — see Answer for why the strict form was not asserted.*
- [x] If the clauses are removed, `pnpm mutate:session` is rerun and the finding recorded: mutants `#99` and `#100` leave the corpus rather than being killed, and the campaign's mutant count and score change accordingly. *The corpus has grown since ticket 03; their current counterparts are `#212`/`#213` and `#258`/`#259`.*
- [ ] The repository's required verification command passes. *Not run locally by instruction; `pnpm verify` is left to CI. Run locally: `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm lint`, `pnpm lint:anti-slop`, `pnpm format:check` and the graph and persistence package tests — see Answer.*

## Answer

2026-09-24, on branch `cq-mutation-findings` from `bde05042`. **Decision (the human's): delete both clauses.**

**Reachability, re-checked against the current `session.ts`, not ticket 03's.** The file has grown from 190 lines to 550 since ticket 03: `ManagedSpaceSession` added `coordinating`, `persistencePaused`, a coordinated recovery and seven coordination methods, so the argument had to be redone rather than re-read. It still holds, in a refined form.

1. `inFlight` is set `true` in one place, `startCommit`, which publishes `pending` in the same straight-line step, and set `false` in two: the first statement of the commit's `.then()` and of its `.catch()`, each before anything is published.
2. `startCommit` has six call sites. Four refuse while `inFlight`: `submit`, `retry` and `resolveConflict` (through their `kind` checks, and before this change also through `|| inFlight`), and `resumePersistence`. One runs after `inFlight = false`: the chained commit in the `committed` branch of `.then()`. **The sixth is new and fits neither description as the ticket wrote it**: `acknowledgeCoordinatedCommit` starts a commit after `coordinating = false`. It is still safe, because `prepareCoordinatedCommit` throws while `inFlight` and every other call site refuses while `coordinating`, so `inFlight` and `coordinating` are never both true and `inFlight` is false there.
3. `failed` and `conflicted` are installed only by a commit's answer, after it clears `inFlight`, and by `failCoordinatedCommit` / `conflictCoordinatedCommit`. Those two settle a coordination that `prepareCoordinatedCommit` began, during which, by step 2, no commit can be in flight. In `session-registry.ts` they are called on `begun` (every session that prepared) and on `participants`, which that code reaches only after every participant has prepared.
4. So `failed` and `conflicted` each imply `!inFlight`, and in `kind !== 'failed' || inFlight …` the second disjunct is true only when the first already is. It never decides.

**Why the comment does not say "`inFlight` implies `pending`".** That is stronger than the guards need, and I could not verify it. The registry calls `restoreCoordinatedCommit` and `completeCoordinatedDeletion` from a coordinated recovery's `acceptRemote` (`session-registry.ts`, `recovery.acceptRemote`). Nothing I found stops that recovery from being stale: a participant can leave its `conflicted` state through a *later* coordination, whose `acknowledgeCoordinatedCommit` does not clear `coordinatedRecovery`, and then start an ordinary commit. Another participant's *Accept stored* would then run the old recovery and install `settled` on a session with a commit in flight. Neither method writes `failed` or `conflicted`, so the deletion is unaffected. **This is a reading, not a reproduction**: no test was written for it, and it may be unreachable for reasons in the registry's planning that I did not trace. If it is real, it is also a correctness question, because that session's working snapshot would be overwritten under an in-flight commit. It is recorded here to be triaged, not asserted in source. So the comment on `inFlight` states the narrower invariant, "never `failed` or `conflicted`", with the reason for each writer, and each guard carries a one-line pointer to it.

**What changed.**

- `packages/persistence/src/session.ts`: `|| inFlight` deleted from `retry`'s and `resolveConflict`'s guards; a docblock on `let inFlight` states the invariant and why it holds; a one-line comment at each guard points to it. Behaviour-neutral by steps 1–4.
- `packages/persistence/test/session.test.ts`: *reports a throwing commit as a failure and returns to idle* now opens a managed session and asserts `isIdle()` after the failure. **The deletion required this change, and the campaign found it.** The first rerun after deleting the clauses turned `#144`, the `.catch` handler's `inFlight = false` → `true` at `session.ts:311`, from Killed to **Survived**. The one test that killed it proved "returns to idle" only by calling `retry()`, and the dead clause was the only thing that made a stuck `inFlight` visible to `retry()`. Hand-applied, the whole persistence package (`206 passed`) did not notice it. The test's own comment says the point is that "the session is idle again, so the registry's barrier and an ordinary retry both get past it", and it now asserts that directly: with `#144` hand-applied it fails (`1 failed | 29 passed`), and it is green once the source is restored. In other words, the clause was not only redundant. Under a mutation elsewhere, it was the oracle for that line. That is evidence on the design question this ticket raised, and it does not change the decision, because the right fix is to prove the idle claim directly rather than through an unreachable branch.

**The rerun.** `pnpm mutate:session`, same oracle pairing (`session.test.ts` only), 1m47s:

| | before (`bde05042`) | after |
|---|---|---|
| Mutants | 375 | **371** |
| Killed | 249 | **245** |
| Survived | 69 | 69 |
| No coverage | 57 | 57 |
| Score (total / covered) | 66.40% / 78.30% | **66.04% / 78.03%** |

The corpus is not ticket 03's 98-mutant one: `session.ts` grew, and so did the campaign. Ticket 03's `#99` and `#100` are now **`#212`/`#213`** (in `retry`: the `kind !== 'failed' || inFlight` sub-expression → `false`, and `||` → `&&`) and **`#258`/`#259`** (the same pair in `resolveConflict`). All four were Killed before, and killed through the reachable half of the guard, as ticket 03 described. All four **leave the corpus** rather than being killed. Each guard line goes from ten mutants to eight, all Killed. A key-by-key comparison of the two reports (source line, span, mutator, replacement) finds no other status change. The score falls by 0.36 points only because four killed mutants left the denominator. It is not a number to move.

**Verification.** `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm lint`, `pnpm lint:anti-slop`, `pnpm format:check` and `pnpm exec vitest run packages/graph packages/persistence` pass; `pnpm verify`, the full suites and e2e are left to CI.
