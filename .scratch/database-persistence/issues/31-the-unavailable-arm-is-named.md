# 31 — The unavailable arm is named, and start-up stops retrying what no retry cures

**What to build:** One shared classifier names broken stored state, database unavailability and unclassified failures for the eight reader sites enumerated in Part A. Separately, Part B decides how `retryMetaSpaceEstablishment` stops or reports persistent unclassified failures without silently abandoning a transient outage.

**Blocked by:** Nothing now. Ticket 24 (one SQL repository commits, and the two adapters go) is resolved, so Part A's premise holds: one `SqlSpaceRepository` implementation raises `AggregateInvariantError` for both databases from `commit` as well as from a read, rather than two adapters that had to agree independently. Part A is unblocked and ready to pick up; Part B was never blocked.

**Status:** needs-info

**Tags:** Defect, release/v1

**Audited:** 2026-09-20 against `b1ac983d`. Part A has a settled design and is implementable; Part B still asks for a cap versus reported-state decision, so the whole ticket is not yet ready for unattended completion. Resolve that choice before closing this release prerequisite. Ticket 36 can be implemented alongside it; neither hard-blocks the other. Ticket 26 owns runtime composition, not this failure policy.

**Why:** `AggregateInvariantError` was given its own type so unrelated failures reaching a reader could be distinguished (`packages/persistence/src/repository.ts`). Unavailability is still inferred from `!isAggregateInvariant(error)`. Six sites classify this way: the aggregate re-read and response in `src/http/space-host.ts`, the commit response and aggregate re-read/response in `packages/http/src/index.ts`, and the retry decision in `src/startup/database-startup.ts`. Part A also covers two GET catches that currently classify nothing, bringing its scope to eight sites.

That the arm is unnamed affects behaviour. Ticket 18 resolved with SQLite BUSY/LOCKED — immediate or exhausted, both `SqlConnectionError{transient:true}` — answering `persistence-unavailable` (503). Production does not inspect that driver signal: the reads of `sql_connection` and `transient` live in `test/support/sqlite-second-process.ts`. Contention reaches 503 through the default, so flipping that default without naming unavailability would misclassify it.

The consequence is that an error neither arm actually describes — a code defect, a driver failure nobody anticipated — is silently filed as transient. Ticket 27 (PR #239 review, CR1) took the same shape from the other side: SQLite's per-row catch stays unconditional precisely because a narrowed one would let a fourth error class escape into this arm.

**Part B's exposure, measured rather than assumed.** `retryMetaSpaceEstablishment` (`src/startup/database-startup.ts:132`) is `for (;;)`, and only the invariant arm counts toward giving up — `CONFIRMING_INVARIANT_FAILURES` is 2, while the `!isAggregateInvariant` branch resets the counter and continues. A probe against a repository that always rejects with a connection error reached 10,001 attempts in about two seconds, but it passed an immediately-resolving `wait`, so that number measures the loop and not a deployment. Production injects a real timer and `delay` backs off from `META_SPACE_RETRY_INITIAL_DELAY_MS` (5s) to `META_SPACE_RETRY_MAX_DELAY_MS` (60s). The real exposure is therefore one full aggregate read a minute, forever, against a deployment whose defect no retry cures, with no final failure reported for that class. Quiet, not hot — worth fixing, and not an incident.

## Part A — name the arm

Settled by a design session on 2026-09-20; the decisions below replace the open questions this section used to carry. See the Comments for what was weighed.

**The module.** A new `packages/persistence/src/persistence-failure.ts` holds `AggregateInvariantError`, the cause-chain walk, `classifyPersistenceFailure(error)` and the arm-to-problem-code table. `repository.ts` keeps the repository contracts and stops being where error identity lives. The module is named after the concept because "the rule lives nowhere" is the defect: the only written statement of it today is a doc comment restated in four more.

**The arms.** Three, exhaustive: `broken-stored-state`, `unavailable` carrying the driver's own `transient` flag as a field, and `unclassified`. Transience is a field rather than a fourth arm because every HTTP reader answers `unavailable` the same way regardless — only Part B's retry loop reads it, and adding a field later is a one-site change where splitting an arm is an eight-site one.

**Raised, not inspected.** The repository raises; the shared classifier never reads driver internals. `@project/persistence` has no driver dependency and ships to the browser, so duck-typing `SqlConnectionError` there would put rules about errors the browser can never meet into its bundle. Each database recognises its own through a new `SqlStore` member, `connectionFailure(error) => { transient: boolean } | undefined`, beside `isDuplicateKey` — the existing precedent for exactly this job, and the reason ADR 0095's "a member added needs a reason" is satisfied rather than dodged. One member rather than two predicates, so nothing can ask "is it transient" of an error that is not a connection failure.

**The unclassified answer is 500.** Not 503. The argument is cheap: `commitFailureForProblem` (`packages/http/src/backend.ts:179-189`) already maps 500 and 503 to the identical `{kind:'retryable-failure', code:'unavailable'}`, so the browser behaves the same either way, and the status code and the operator's log line are the only consumers of the difference. For a failure nobody anticipated, "this deployment has a problem" is true where "try again later" is a promise nothing can keep.

- [ ] `classifyPersistenceFailure` answers the three arms exhaustively, so a fourth is a compile error at every reader rather than a silently-missing case. `isAggregateInvariant` becomes internal — the cause-chain walk and its cycle bound are real leverage and stay, but the classifier is the one entry point. `AggregateInvariantError` stays exported; the repository still raises it.
- [ ] `SqlStore` gains `connectionFailure`, implemented per database over each driver's `SqlConnectionError`. Read the cause chain, as the runtime wraps a failed COMMIT around the original, and do not tell the two BUSY shapes apart by message (ticket 18, correction (b)).
- [ ] **Eight readers, not four.** The six that classify today — `space-host.ts:85`, `space-host.ts:151`, `packages/http/src/index.ts`'s commit catch (`:441`), its aggregate re-read (`:462`) and classify (`:473`), and `database-startup.ts:140` — plus two that classify nothing and answer wrongly for it: `GET /api/spaces` (`index.ts:359`) answers 503 for a stored document that fails intake, and `GET /api/spaces/:id` (`index.ts:489`) reaches `repository.commit` through `loadWorkingSpace` and answers 503 for the exact failure `POST /api/spaces` answers 500 for.
- [ ] The arm-to-problem-code-and-detail mapping is one table beside the arms, not prose repeated at three byte-identical sites. Each reader still calls its own `problem(...)` — one takes a Hono context, the other an `accept` header and answers a `ProductResponse` — but the decision stops being duplicated. `@project/persistence` already owns the problem catalogue (`http-protocol.ts:40`), so this is not new transport knowledge entering the package.
- [ ] Red first, now expressible: `aggregate-invariant.test.ts` becomes the classifier's own test, keeping its cause-chain and cycle cases. Then one case per reader seam, driven by a stub repository rejecting with a bare `Error` — every route and `retryMetaSpaceEstablishment` already takes a repository, so no new seam is needed to inject it.
- [ ] Preserve existing classification at readers that already distinguish the two named arms. `unavailable` stays 503; `unclassified` moves 503 to 500. The collection and single-Space GET catches also change from blanket 503 to 500 for broken stored state; their correction is an additional observable change, not behaviour preservation. `database-startup.ts` keeps resetting and continuing on both non-invariant arms in Part A — Part B owns the final retry policy.
- [ ] Ticket 18's contention matrix (`test/integration/sqlite-contention.test.ts`) is green unchanged. Every row in it is BUSY/LOCKED, which becomes `unavailable{transient:true}` and still answers 503. If a row moves, the naming is wrong, not the row.
- [ ] `test/e2e/` is checked: both restart proofs drive the application surface and `verify` cannot observe them (AGENTS.md).
- [ ] A short ADR refining ADR 0095 records the new `SqlStore` member's reason and the 500. Nothing goes into `CONTEXT.md` — its own opening puts storage out of scope, so the note belongs in `docs/agents/editing-and-persistence.md`.

**Observable change:** the unclassified arm and broken stored state reaching either previously unclassified GET catch move from 503 to 500. Repository lifecycle and commit outcomes remain unchanged; their `spaceRepositoryContract` cases must stay green.

## Part B — bound the retry, or report it

- [ ] Red first, at `retryMetaSpaceEstablishment`'s own interface with an injected counting `wait`: a repository that always fails with an unclassifiable error stops, or reports a persistent-failure state, rather than continuing indefinitely.
- [ ] Either an attempt cap on the non-invariant arm or a reported stuck state — pick one and say why. A cap that silently gives up on a genuinely transient outage is the failure mode to avoid; reporting may be the better half.
- [ ] `wait` and `report` stay the caller's (ADR 0016, ADR 0081). Nothing is thrown: nothing awaits this call, and a rejection nothing listens for ends the process.
- [ ] `test/integration/sqlite-http-runtime.test.ts`'s existing `RETRY_WAIT_BOUND` was added by PR #239's review to stop a classification regression spinning inside the suite. If production gains a bound, reconcile the two rather than leaving the test asserting a limit the code now owns.

## Provenance

Architecture review candidate 3 (2026-09-18) — the candidate ticket 27 reserved this number for. Candidates 1 and 2 became tickets 28 and 30; two further findings landed as acceptance bullets inside tickets 22 and 26 rather than as their own tickets.

Part B and the third-case framing come from PR #239's review round (CR1 and CR4), recorded in ticket 27's Decided section.

## Comments

**2026-09-20 (design session, after the architecture review of the one-SQL-repository branch).** Part A's open questions were worked through and settled; the section above is the result rather than the original framing. What the review added to this ticket's own account: the count is **six** classifying sites rather than four readers (`index.ts`'s commit catch and its aggregate handler are separate sites of the same shape, and `space-host.ts:85`/`index.ts:462` are a second duplicated pair), **nine further sites read a persistence failure and classify nothing**, and the driver's transience signal is read in exactly one file in the repository — `test/support/sqlite-second-process.ts:106-108`, which is test support. Nothing in `src/` or `packages/` reads `sql_connection` or `transient`, which is what "the arm is reached by falling through the default" means concretely.

Three alternatives were rejected. A second predicate beside `isAggregateInvariant` leaves the same else-branch one layer up — `!isAggregateInvariant && !isUnavailable` is still an unnamed third case. An error-class hierarchy tested with `instanceof` puts the matching back at eight sites and cannot express `unclassified` at all, since an unclassified failure is by definition not an instance of anything anyone thought to name. Keeping the arm-to-code mapping at each reader was weighed on the grounds that a status code is a transport concern; it lost because `@project/persistence` already declares the problem catalogue.

**Correction (same session).** The review first recorded `ResourceOwnershipError` escaping `replaceAggregate` as a live defect: `#replaceAllSpaces` can raise it through `#importThings`, `initializeAggregate` handles it (`sql-space-repository.ts:733`) and `commit` converts it (`:385`), while `replaceAggregate`'s catch narrows to `StaleSpaceRevisionError` (`:785`) and lets it escape into the 503 arm. The code path is real but **unreachable**: `#replaceUnserialised` runs `loadSpaceAggregate` intake before opening its transaction, and that intake already refuses aggregate-wide duplicate Thing ids (`packages/graph/src/space-aggregate.ts:105-115`), so the only input that could collide never reaches the insert. The asymmetry with `initializeAggregate` is correct too — initialize races on first insert with nothing to lock, replace takes the Meta lock and re-locks every row first.

What survives is smaller and real: the two callers of one private method hold different, unwritten beliefs about what it raises, and replace's belief rests on a check in another package with no test binding them. That is **ticket 36**, to be taken as part of this ticket's refactoring rather than before it.

**Staleness found alongside.** `packages/persistence/src/revision-codec.ts:26-29` still says `#loadEverySpace` "admits this alongside its own `SnapshotValidationError` rather than widening its catch to every error". That catch was widened to unconditional in `5de390f3` (ticket 27's 2026-09-20 comment). The codec's own doc comment now states the opposite of the code it describes.
