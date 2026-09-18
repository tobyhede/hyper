# 20 — One commit decision for every implementation

**What to build:** A change set is judged against stored state in one place. `decideCommit(request, metaSpaceId, stored) → CommitDecision` lives in `@project/persistence` (`packages/persistence/src/commit-decision.ts`), and the PostgreSQL adapter, the SQLite adapter, `MemorySpaceRepository` (`test/support/memory-space-repository.ts`) and `MemorySpaceBackend` (`packages/persistence/src/memory.ts`) all call it. The hand-drawn copies of the conflict, incomplete-deletion and baseline-unreferenced rules in both memory implementations are deleted.

**Blocked by:** None — can start immediately.

**Status:** resolved

**Why:** ADR 0095. The rules are written four times today: once in `src/persistence/commit-decision.ts`, which `memory.ts` cannot import, and by hand in both memory implementations, which `aggregate-commit-differential.test.ts` exists to prove still agree. The fast-path decision also answers a single update whose snapshot fails intake with `invalid-space-snapshot` at `snapshotIndex: 0`, while the complete-aggregate path and both memory implementations answer that Space's index among the stored Spaces — an observable difference ADR 0078 calls a defect, which neither the contract nor the differential test asserts.

- [x] `@project/persistence` exports three commit rules and nothing else of the module: `commitIdentityRefusal` (a Space named twice, a change whose snapshot names another Space), `committedRevision`, and `decideCommit`, which runs `commitIdentityRefusal` itself and then the complete-aggregate decision. A memory implementation needs only `decideCommit`.
- [x] **The identity refusal still runs before the fast path.** Each SQL adapter's `commit` calls `commitIdentityRefusal` before its transaction, as it does today. The fast path loads the stored Space by `change.spaceId` but `writeSpaceDocumentUnderLock` writes to `snapshot.id`, so without that refusal a single update whose snapshot names a different Space at a matching revision overwrites that Space. The HTTP decoder refuses such a request, but the repository must not rely on it.
- [x] `repository-contract.ts` gains a case the fast path could reach: a single update whose snapshot names a different stored Space, at revisions that match, is `rejected` / `invalid-commit` and writes nothing, on every implementation.
- [x] The fast path's pure parts — `topologyPreservingCandidate`, `preservesSnapshotBoundary` and `decideTopologyPreservingUpdate` — move from `src/persistence/commit-decision.ts` to `src/persistence/topology-preserving-update.ts`, which both SQL adapters import. There is one copy until ticket 24 absorbs the module into the one repository; no adapter gains its own.
- [x] On that path a snapshot failing intake goes to the complete-aggregate decision instead of answering. Its remaining outcomes are a revision conflict or a write.
- [x] `repository-contract.ts` gains a case: a single update whose snapshot fails intake answers exactly the refusal the complete-aggregate path gives, `snapshotIndex` included, on every implementation.
- [x] `MemorySpaceBackend.commit` calls `decideCommit` after its test controls (`record`, `waitForCommit`, injected results and errors), maps `rejected` to `permanent-failure`, and loses its separate identity pre-check. No `packages/app` test depends on the old order.
- [x] Both memory implementations lose their empty-commit guard: `SpaceCommit`'s non-empty tuple and the HTTP protocol's `commit changes must be non-empty` already make it unreachable.
- [x] `src/persistence/commit-decision.ts` is gone; the adapters import from `@project/persistence`.
- [x] `aggregate-commit-differential.test.ts` still passes. Its header states that it now proves storage agreement, since both sides run the same decision.

Out of scope: the one SQL repository (tickets 22–24).

## Answer

Built in `15c6957e` ("Decide every commit through one decideCommit"), with review findings addressed in `8f50929d`: `MemorySpaceBackend` hands `decideCommit` its Spaces in ascending id order, so an `invalid-space-snapshot` refusal names the same position the databases do.
