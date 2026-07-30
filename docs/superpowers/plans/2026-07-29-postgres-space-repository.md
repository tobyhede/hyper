# PostgreSQL Space Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Store, load, list, import, and revision-check completely identified space aggregates through a server-side PostgreSQL repository.

**Architecture:** A server-only SpaceRepository contract owns storage outcomes while PostgresSpaceRepository translates complete SpaceSnapshot aggregates into the existing relational UUID columns and JSONB documents. Every mutating operation uses Prisma Next's callback transaction; runtime commits replace the complete aggregate, while import inserts complete new Spaces and rejects existing identities.

**Tech Stack:** TypeScript 6 strict mode, Zod domain intake, Prisma Next 0.16.0, PostgreSQL 17.5, Vitest integration tests.

**Execution status:** Tasks 1–8 are implemented and verified. Task 8 records the post-implementation concurrency review's red-green regression cycle.

## Global Constraints

- Test only the confirmed public SpaceRepository seam.
- Run integration tests against real PostgreSQL; do not mock Prisma or inspect tables as assertions.
- Write one failing behavioral test before each minimal production change.
- Keep UUIDs in relational columns and omit them from JSONB documents.
- Keep transport and browser failure concepts outside repository results.
- Defer file discovery, CLI parsing, and missing-id allocation to issue 05.

---

### Task 1: Repository contract and identified insert import

**Files:**
- Create: src/persistence/space-repository.ts
- Create: src/persistence/postgres-space-repository.ts
- Create: test/integration/postgres-space-repository.test.ts

**Interfaces:**
- Produces: SpaceRepository, StoredSpace, RepositoryCommitResult, RepositoryImportResult, and PostgresSpaceRepository.
- Produces: importSpaces(snapshots: readonly SpaceSnapshot[]): Promise<RepositoryImportResult> for insert-only, completely identified imports, with typed imported, rejected, and conflict outcomes.

- [x] **Step 1: Add import/load/list coverage**

~~~ts
const imported = await repository.importSpaces([snapshot]);
expect(imported).toEqual({
  kind: 'imported',
  spaces: [{ snapshot, revision: 0n, exportedRevision: null }],
});
if (imported.kind !== 'imported') {
  throw new Error(imported.kind === 'rejected' ? imported.message : 'Import conflicted');
}
await expect(repository.loadSpace(snapshot.id)).resolves.toEqual(imported.spaces[0]);
await expect(repository.listSpaces()).resolves.toEqual([
  { id: snapshot.id, title: snapshot.document.title },
]);
~~~

- [x] **Step 2: Implement the minimal insert-only import, load, and list behavior**

Use db.transaction(async ({ orm }) => ...), insert the identified space and cards, reject existing identities, reconstruct snapshots with spaceDocumentSchema and cardDocumentSchema, and validate reconstructed aggregates with loadSpaceSnapshot.

### Task 2: Valid authoritative runtime commit

**Files:**
- Modify: src/persistence/postgres-space-repository.ts
- Modify: test/integration/postgres-space-repository.test.ts

**Interfaces:**
- Produces: commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<RepositoryCommitResult>.

- [x] **Step 1: Add a test that changes the space document, changes one card, omits another card, and commits at revision zero**

~~~ts
expect(await repository.commitSpace(changed, 0n)).toEqual({
  kind: 'committed',
  revision: 1n,
});
expect(await repository.loadSpace(changed.id)).toEqual({
  snapshot: changed,
  revision: 1n,
  exportedRevision: null,
});
~~~

- [x] **Step 2: Implement the minimal callback-transaction commit**

Validate before writing, conditionally update the owning space by id and expected revision, upsert every submitted card without changing ownership, delete omitted cards owned by the space, and return the incremented revision.

### Task 3: Stale revisions and missing spaces

**Files:**
- Modify: src/persistence/postgres-space-repository.ts
- Modify: test/integration/postgres-space-repository.test.ts

- [x] **Step 1: Add stale-revision coverage**

Commit once, retry from revision zero, assert a typed conflict containing the current stored aggregate, then load through the repository to prove no stale data changed.

- [x] **Step 2: Implement the conditional-update outcome**

- [x] **Step 3: Add unknown-space coverage**

Commit a valid snapshot for an absent UUID and expect a rejected/not-found result.

- [x] **Step 4: Distinguish absent rows from stale revisions**

### Task 4: Permanent validation rejection

**Files:**
- Modify: src/persistence/postgres-space-repository.ts
- Modify: test/integration/postgres-space-repository.test.ts

- [x] **Step 1: Add dangling-reference coverage**

Pass the invalid value through the repository validation boundary, expect invalid-snapshot, and load the original aggregate to prove it was unchanged.

- [x] **Step 2: Add schema and normal domain intake before the transaction**

### Task 5: Card ownership conflict and rollback

**Files:**
- Modify: src/persistence/postgres-space-repository.ts
- Modify: test/integration/postgres-space-repository.test.ts

- [x] **Step 1: Add cross-space ownership coverage**

Import two spaces, submit one space with the other's card UUID, expect rejection, then load both spaces through the repository to prove neither aggregate changed.

- [x] **Step 2: Reject ownership changes inside the transaction with a private rollback signal**

### Task 6: Insert-only import and operational rollback

**Files:**
- Modify: src/persistence/postgres-space-repository.ts
- Modify: test/integration/postgres-space-repository.test.ts

- [x] **Step 1: Add existing-identity rejection coverage**

Import a Space, import the same identity again with changed content, and assert a typed conflict while the stored aggregate remains unchanged.

- [x] **Step 2: Implement the explicit insert-only import policy**

- [x] **Step 3: Add and satisfy an operational rollback test**

Use a batch whose later aggregate has a cross-space ownership conflict; assert the typed rejection and that earlier aggregates remain unchanged through repository loads.

### Task 7: Verification and issue closure

**Files:**
- Modify: .scratch/database-persistence/issues/04-postgres-space-repository.md

- [x] **Step 1: Run PostgreSQL integration verification**

Run: `mise exec node@24.18.0 -- pnpm test:integration:postgres`
Result: PASS — 2 files, 15 tests.

- [x] **Step 2: Run repository-wide verification**

Run: `mise exec node@24.18.0 -- pnpm verify`
Result: PASS — both typecheck layers, lint, formatting, and 308 coverage tests.

- [x] **Step 3: Check formatting and the final diff**

Run: `git diff --check` and `git status --short`.
Result: PASS — no whitespace errors; the status lists only the intended review-fix files.

- [x] **Step 4: Mark issue 04 resolved only after every acceptance criterion has evidence**

### Task 8: Typed concurrent-import conflicts

**Files:**
- Modify: `src/persistence/space-repository.ts`
- Modify: `src/persistence/postgres-space-repository.ts`
- Modify: `test/integration/postgres-space-repository.test.ts`

**Interfaces:**
- Extends: `RepositoryImportResult` with `{ kind: 'conflict'; current: StoredSpace }`.
- Preserves: one transaction for the complete import batch and propagation of unrelated operational database errors.

- [x] **Step 1: Write failing concurrent-create and concurrent-update tests**

Coordinate two real PostgreSQL imports so both transactions observe the same pre-write state. Assert that one import succeeds, the other returns a typed conflict containing the durable winner, and no earlier write from the losing batch commits.

- [x] **Step 2: Run the focused integration tests to verify red**

Run: `pnpm test:integration:postgres -- postgres-space-repository`

Observed: FAIL — the losing update threw the generic concurrency error and the losing create exposed PostgreSQL `23505` on `spaces_pkey`.

- [x] **Step 3: Implement a private rollback signal**

Throw the private signal from inside the callback transaction for a failed optimistic update or the matching concurrent-create uniqueness violation. Catch it outside the transaction, load the current aggregate, and return `{ kind: 'conflict', current }`. Do not return normally from the transaction conflict branch, because that would commit earlier writes in the same batch.

- [x] **Step 4: Run the focused integration tests to verify green**

Run: `pnpm test:integration:postgres -- postgres-space-repository`

Observed: PASS — both race paths are classified and the losing batch is fully rolled back.
