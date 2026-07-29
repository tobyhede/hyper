# Branded UUID Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every validated Hyper id a statically branded UUID while keeping import, JSON, PostgreSQL, and Prisma representations as strings.

**Architecture:** `@project/core` owns the single UUID proof by branding the existing Zod UUID schema. Untrusted file, generated, and persistence values become domain ids only by parsing through that schema or a larger schema containing it; downstream modules consume the branded output without assertions.

**Tech Stack:** TypeScript 6 strict mode, Zod 3, Vitest, pnpm monorepo.

## Global Constraints

- Keep one shared durable UUID identity; do not introduce entity-specific id brands.
- Keep ids optional only in `ImportSpace`; every loaded `Space` and `SpaceSnapshot` is identified.
- Preserve the version 2 wire format and PostgreSQL/Prisma string representation.
- Use extensionless relative imports and `import type` for type-only imports.
- Run `pnpm verify` and, because graph/app call sites change, `pnpm e2e` before completion.

---

### Task 1: Specify branded UUID output

**Files:**
- Create: `packages/core/test/uuid-type.test.ts`
- Modify: `packages/core/src/schema.ts`

**Interfaces:**
- Consumes: public `uuidSchema` and `UUID` exports from `@project/core`.
- Produces: `uuidSchema` with unbranded `string` input and branded `UUID` output.

- [x] **Step 1: Write the failing compile-time contract test**

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import { uuidSchema, type UUID } from '../src/index';

describe('UUID identity type', () => {
  it('is minted by validation rather than assignment from a plain string', () => {
    const parsed = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
    expectTypeOf(parsed).toEqualTypeOf<UUID>();
    expect(parsed).toBe('00000000-0000-4000-8000-000000000001');

    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const unchecked: UUID = '00000000-0000-4000-8000-000000000001';
    expect(unchecked).toBeTruthy();
  });
});
```

- [x] **Step 2: Run `pnpm typecheck` and verify RED**

Expected: `TS2578: Unused '@ts-expect-error' directive`, proving plain strings still satisfy `UUID`.

- [x] **Step 3: Brand the existing schema**

```ts
export const uuidSchema = z.string().uuid().brand<'UUID'>();
```

- [x] **Step 4: Run `pnpm typecheck` and use its remaining errors as the migration list**

Expected: the new contract test passes, while direct domain constructors and generated ids fail until they cross the UUID seam.

### Task 2: Migrate UUID creation and direct domain constructors

**Files:**
- Modify: `packages/graph/src/new-space.ts`
- Modify: `packages/app/src/App.tsx`
- Modify: affected `packages/*/test/*.ts` fixture helpers identified by `pnpm typecheck`

**Interfaces:**
- Consumes: branded `uuidSchema` output from Task 1.
- Produces: generated ids and direct test domain values that are branded only through schema parsing.

- [x] **Step 1: Parse `crypto.randomUUID()` at each domain construction seam**
- [x] **Step 2: Replace direct typed test identities with values returned by `uuidSchema.parse` or existing parsed `Space` fixtures**
- [x] **Step 3: Run `pnpm typecheck` until the root program is green**
- [x] **Step 4: Run `pnpm typecheck:packages` to verify every narrowed package program is green**

### Task 3: Verify behavior and capture issue closure

**Files:**
- Modify: `.scratch/database-persistence/issues/01-version-2-uuid-migration.md`
- Verify unchanged: `docs/adr/0030-postgres-is-the-live-write-model.md`

**Interfaces:**
- Consumes: the completed branded UUID contract.
- Produces: accurate local issue status and restoration of accepted ADR immutability.

- [x] **Step 1: Run focused core, graph, persistence, and app tests**
- [x] **Step 2: Run `pnpm verify`**
- [x] **Step 3: Run `pnpm e2e`**
- [x] **Step 4: Mark issue 01 resolved with an `## Answer` describing runtime validation plus static branding**
- [x] **Step 5: Verify accepted ADR 0030 is immutable, restore its `HEAD` body if needed, and leave it unchanged; current implementation status remains in AGENTS.md and the tracker**
- [x] **Step 6: Inspect `git diff --check` and the final diff for unrelated changes**
