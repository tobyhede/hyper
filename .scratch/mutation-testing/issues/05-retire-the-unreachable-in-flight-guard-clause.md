# 05 — Retire the unreachable `inFlight` clause in the session's conflict and retry guards

**What to build:** Decide, and then act on, whether `SpaceSession`'s `retry` and `resolveConflict` guards should keep their `|| inFlight` disjunct now that it is known to be unreachable — either delete both clauses, or keep them and record in the source why a clause no test can distinguish is worth carrying.

Ticket 03 established the reachability answer while closing the oracle gaps and deliberately left the production code alone; the evidence is in `.scratch/mutation-testing/oracle-space-session.md` under "The `|| inFlight` reachability question". In short: `inFlight` is written in exactly two places, and `startCommit` publishes `{ kind: 'pending' }` in the same straight-line step that sets it `true`, so `inFlight === true` implies the installed persistence kind is `pending`. The first disjunct of each guard (`kind !== 'failed'`, `kind !== 'conflicted'`) is therefore already true whenever `inFlight` is, and `|| inFlight` never decides. Dropping either clause leaves the full 1651-test suite green.

This is a design question, not an oracle question: no test can distinguish the two programs, so no test should be written to justify either answer. The decision is whether the redundancy is defensive documentation of an invariant or dead weight that misleads a reader into thinking the pair is reachable.

**Blocked by:** 03 — Close the valuable SpaceSession oracle gaps.

**Status:** needs-triage

- [ ] The reachability argument is re-checked against the current `session.ts` rather than taken on trust from ticket 03, including the claim that every `startCommit` call site is guarded by `!inFlight` or runs after `inFlight = false`.
- [ ] Both occurrences are treated together — `retry` (`session.ts:160`) and `resolveConflict` (`session.ts:177`) carry the identical clause for the identical reason.
- [ ] Whichever way it goes, the invariant "`inFlight` implies `pending`" is written down where a reader of the guard will find it, since it is the whole reason the clause is redundant.
- [ ] If the clauses are removed, `pnpm mutate:session` is rerun and the finding recorded: mutants `#99` and `#100` leave the corpus rather than being killed, and the campaign's mutant count and score change accordingly.
- [ ] The repository's required verification command passes.
