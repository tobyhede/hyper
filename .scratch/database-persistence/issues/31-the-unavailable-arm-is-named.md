# 31 — The unavailable arm is named, and start-up stops retrying what no retry cures

**What to build:** "The database is unreachable" is a thing production names, the way broken stored state already is, so neither arm of the classification is merely the absence of the other. One shared predicate answers it for all three readers that ask today. Separately and independently: `retryMetaSpaceEstablishment` stops retrying forever on a failure it cannot classify, or says so where an operator will see it.

**Blocked by:** Part A is cheapest after 24 — one SQL repository collapses the two raise sites into one, so there is one place to name transience rather than two that must agree. Part B is blocked by nothing and can land first.

**Status:** ready-for-agent

**Tags:** Defect

**Why:** `AggregateInvariantError` was given its own type so two unrelated failures reaching a reader the same way could be told apart (`packages/persistence/src/repository.ts`). Only one of the two got a name. The other is `!isAggregateInvariant(error)` — an else-branch — and three readers each re-derive the same assumption from it: `src/http/space-host.ts:85` re-reads once, `src/http/space-host.ts:151` answers 503, `packages/http/src/index.ts:424` and `:435` do both for `GET /api/aggregate`, and `src/startup/database-startup.ts:140` resets its give-up counter and continues.

That the arm is unnamed is load-bearing rather than untidy. Ticket 18 resolved with SQLite BUSY/LOCKED — immediate or exhausted, both `SqlConnectionError{transient:true}` — answering `persistence-unavailable` (503). It reaches that status *by falling through the default*, because nothing in the tree reads `SqlConnectionError`, reads `transient`, or names unavailability as anything but an HTTP response string. So ticket 18's whole contention matrix rides on the default, and ticket 27 declined to flip the default for exactly this reason: with nothing naming the arm, inverting it answers contention as broken stored state.

The consequence is that an error neither arm actually describes — a code defect, a driver failure nobody anticipated — is silently filed as transient. Ticket 27 (PR #239 review, CR1) took the same shape from the other side: SQLite's per-row catch stays unconditional precisely because a narrowed one would let a fourth error class escape into this arm.

**Part B's exposure, measured rather than assumed.** `retryMetaSpaceEstablishment` (`src/startup/database-startup.ts:132`) is `for (;;)`, and only the invariant arm counts toward giving up — `CONFIRMING_INVARIANT_FAILURES` is 2, while the `!isAggregateInvariant` branch resets the counter and continues. A probe against a repository that always rejects with a connection error reached 10,001 attempts in about two seconds, but it passed an immediately-resolving `wait`, so that number measures the loop and not a deployment. Production injects a real timer and `delay` backs off from `META_SPACE_RETRY_INITIAL_DELAY_MS` (5s) to `META_SPACE_RETRY_MAX_DELAY_MS` (60s). The real exposure is therefore one full aggregate read a minute, forever, against a deployment whose defect no retry cures, with no final failure reported for that class. Quiet, not hot — worth fixing, and not an incident.

## Part A — name the arm

- [ ] Red first: a failure that is neither broken stored state nor a recognised transient one is classified as *neither*, and each of the three readers is asserted at its own seam for that input. The test names the third case; today there is no input that can express it.
- [ ] Transience is named once, beside `AggregateInvariantError` in `packages/persistence/src/repository.ts`, so both consumers of the shared seam can ask. Whether it is a `PersistenceUnavailableError` the repository raises or a predicate over the driver's `SqlConnectionError{transient:true}` is the ticket's to decide — record which and why, and do not tell the two BUSY shapes apart by message (ticket 18, correction (b)).
- [ ] The three readers ask the one predicate rather than re-deriving the arm from `!isAggregateInvariant`. `space-host.ts:85`'s single re-read, `space-host.ts:151`, `packages/http/src/index.ts:424`/`:435` and `database-startup.ts:140` all keep their current behaviour for the two named arms.
- [ ] The unclassified third case gets a decided answer rather than an accidental one. It is not obviously 503 — that is the claim this ticket exists to stop making by default.
- [ ] Ticket 18's contention matrix (`test/integration/sqlite-contention.test.ts`) is green unchanged. It currently passes because of the default; if naming the arm changes any row, the naming is wrong, not the row.
- [ ] `test/e2e/` is checked: both restart proofs drive the application surface and `verify` cannot observe them (AGENTS.md).

## Part B — bound the retry, or report it

- [ ] Red first, at `retryMetaSpaceEstablishment`'s own interface with an injected counting `wait`: a repository that always fails with an unclassifiable error stops, or reports a persistent-failure state, rather than continuing indefinitely.
- [ ] Either an attempt cap on the non-invariant arm or a reported stuck state — pick one and say why. A cap that silently gives up on a genuinely transient outage is the failure mode to avoid; reporting may be the better half.
- [ ] `wait` and `report` stay the caller's (ADR 0016, ADR 0081). Nothing is thrown: nothing awaits this call, and a rejection nothing listens for ends the process.
- [ ] `test/integration/sqlite-http-runtime.test.ts`'s existing `RETRY_WAIT_BOUND` was added by PR #239's review to stop a classification regression spinning inside the suite. If production gains a bound, reconcile the two rather than leaving the test asserting a limit the code now owns.

## Provenance

Architecture review candidate 3 (2026-09-18) — the candidate ticket 27 reserved this number for. Candidates 1 and 2 became tickets 28 and 30; two further findings landed as acceptance bullets inside tickets 22 and 26 rather than as their own tickets.

Part B and the third-case framing come from PR #239's review round (CR1 and CR4), recorded in ticket 27's Decided section.
