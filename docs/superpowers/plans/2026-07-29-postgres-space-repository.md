# PostgreSQL Space Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Store, load, list, import, and revision-check completely identified space aggregates through a server-side PostgreSQL repository.

**Architecture:** A server-only SpaceRepository contract owns storage outcomes while PostgresSpaceRepository translates complete SpaceSnapshot aggregates into the existing relational UUID columns and JSONB documents. Every mutating operation uses Prisma Next's callback transaction; runtime commits replace the complete aggregate, while identified upsert imports remain additive.

**Tech Stack:** TypeScript 6 strict mode, Zod domain intake, Prisma Next 0.16.0, PostgreSQL 17.5, Vitest integration tests.

## Global Constraints

- Test only the confirmed public SpaceRepository seam.
- Run integration tests against real PostgreSQL; do not mock Prisma or inspect tables as assertions.
- Write one failing behavioral test before each minimal production change.
- Keep UUIDs in relational columns and omit them from JSONB documents.
- Keep transport and browser failure concepts outside repository results.
- Defer file discovery, CLI parsing, and missing-id allocation to issue 05.

---

### Task 1: Repository contract and identified upsert import

**Files:**
- Create: src/persistence/space-repository.ts
- Create: src/persistence/postgres-space-repository.ts
- Create: test/integration/postgres-space-repository.test.ts

**Interfaces:**
- Produces: SpaceRepository, StoredSpace, RepositoryCommitResult, and PostgresSpaceRepository.
- Produces: importSpaces(snapshots: readonly SpaceSnapshot[]): Promise<readonly StoredSpace[]> for additive, completely identified imports.

- [ ] **Step 1: Write the failing import/load/list test**

~~~ts
const imported = await repository.importSpaces([snapshot]);
expect(imported).toEqual([{ snapshot, revision: 0n, exportedRevision: null }]);
await expect(repository.loadSpace(snapshot.id)).resolves.toEqual(imported[0]);
await expect(repository.listSpaces()).resolves.toEqual([
  { id: snapshot.id, title: snapshot.document.title },
]);
~~~

- [ ] **Step 2: Run it to verify red**

Run: pnpm test:integration:postgres -- postgres-space-repository
Expected: FAIL because the repository modules do not exist.

- [ ] **Step 3: Implement the minimal additive import, load, and list behavior**

Use db.transaction(async ({ orm }) => ...), upsert the identified space and cards, reconstruct snapshots with spaceDocumentSchema and cardDocumentSchema, and validate reconstructed aggregates with loadSpaceSnapshot.

- [ ] **Step 4: Run it to verify green**

Run: pnpm test:integration:postgres -- postgres-space-repository
Expected: PASS.

### Task 2: Valid authoritative runtime commit

**Files:**
- Modify: src/persistence/postgres-space-repository.ts
- Modify: test/integration/postgres-space-repository.test.ts

**Interfaces:**
- Produces: commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<RepositoryCommitResult>.

- [ ] **Step 1: Write a failing test that changes the space document, changes one card, omits another card, and commits at revision zero**

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

- [ ] **Step 2: Run it to verify red**

Run: pnpm test:integration:postgres -- postgres-space-repository
Expected: FAIL because runtime commit is not implemented.

- [ ] **Step 3: Implement the minimal callback-transaction commit**

Validate before writing, conditionally update the owning space by id and expected revision, upsert every submitted card without changing ownership, delete omitted cards owned by the space, and return the incremented revision.

- [ ] **Step 4: Run it to verify green**

Run: pnpm test:integration:postgres -- postgres-space-repository
Expected: PASS.

### Task 3: Stale revisions and missing spaces

**Files:**
- Modify: src/persistence/postgres-space-repository.ts
- Modify: test/integration/postgres-space-repository.test.ts

- [ ] **Step 1: Write a failing stale-revision test**

Commit once, retry from revision zero, assert a typed conflict containing the current stored aggregate, then load through the repository to prove no stale data changed.

- [ ] **Step 2: Run red, implement the conditional-update outcome, then run green**

Run: pnpm test:integration:postgres -- postgres-space-repository.

- [ ] **Step 3: Write a failing unknown-space test**

Commit a valid snapshot for an absent UUID and expect a rejected/not-found result.

- [ ] **Step 4: Run red, distinguish absent rows from stale revisions, then run green**

Run: pnpm test:integration:postgres -- postgres-space-repository.

### Task 4: Permanent validation rejection

**Files:**
- Modify: src/persistence/postgres-space-repository.ts
- Modify: test/integration/postgres-space-repository.test.ts

- [ ] **Step 1: Write a failing dangling-reference test**

Pass the invalid value through the repository validation boundary, expect invalid-snapshot, and load the original aggregate to prove it was unchanged.

- [ ] **Step 2: Run red, add schema and normal domain intake before the transaction, then run green**

Run: pnpm test:integration:postgres -- postgres-space-repository.

### Task 5: Card ownership conflict and rollback

**Files:**
- Modify: src/persistence/postgres-space-repository.ts
- Modify: test/integration/postgres-space-repository.test.ts

- [ ] **Step 1: Write a failing cross-space ownership test**

Import two spaces, submit one space with the other's card UUID, expect rejection, then load both spaces through the repository to prove neither aggregate changed.

- [ ] **Step 2: Run red, reject ownership changes inside the transaction by throwing a private rollback signal, then run green**

Run: pnpm test:integration:postgres -- postgres-space-repository.

### Task 6: Additive import and operational rollback

**Files:**
- Modify: src/persistence/postgres-space-repository.ts
- Modify: test/integration/postgres-space-repository.test.ts

- [ ] **Step 1: Write a failing additive re-import test**

Import a two-card space, re-import the same space with one card, and assert through loadSpace that both stored cards remain while supplied documents update.

- [ ] **Step 2: Run red, share the aggregate writer with an explicit additive/authoritative policy, then run green**

Run: pnpm test:integration:postgres -- postgres-space-repository.

- [ ] **Step 3: Write and satisfy a rollback test**

Use a batch whose later aggregate has a cross-space ownership conflict; assert the typed rejection and that earlier aggregates remain unchanged through repository loads.

### Task 7: Verification and issue closure

**Files:**
- Modify: .scratch/database-persistence/issues/04-postgres-space-repository.md

- [ ] **Step 1: Run PostgreSQL integration verification**

Run: pnpm test:integration:postgres.

- [ ] **Step 2: Run repository-wide verification**

Run: pnpm verify.

- [ ] **Step 3: Check formatting and the final diff**

Run: git diff --check and git status --short.

- [ ] **Step 4: Mark issue 04 resolved only after every acceptance criterion has evidence**

