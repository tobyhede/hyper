# Bodyless Alias Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the meaningless `body: ''` sentinel from alias domain values while continuing to reject alias files containing prose.

**Architecture:** `core` describes the honest discriminated union; `parseCardFile` owns the physical file invariant and returns a complete `Card`; `loadSpace` consumes that value without reconstruction. Serialization branches by kind, and content resolution returns the non-alias portion of the union so callers may read kind-specific content safely.

**Tech Stack:** TypeScript strict mode, Zod 3, Vitest, fast-check, pnpm.

**Status:** Completed on 2026-07-27. The checkboxes below preserve the test-first execution recipe; actual results are recorded in alias-cards issue 04.

## Global Constraints

- An alias domain value is `{ id, title, description?, kind: 'alias', target }` with no `body` field.
- A Markdown card retains `body: string`, including the legitimate empty string.
- An alias file with any post-frontmatter body must still fail intake; Zod's unknown-key stripping must not discard it silently.
- Resolution remains lazy, non-destructive, and single-hop in `@project/graph` (ADR 0009).
- `CardNodeData.body` is projection data and remains unchanged.
- Do not add the future `space` card kind.

---

### Task 1: Make the Card union honest

**Files:**
- Modify: `packages/core/src/schema.ts`
- Modify: `packages/core/test/schema.test.ts`
- Modify: `packages/graph/test/card-files.ts`
- Modify: `packages/graph/test/validate.test.ts` only if direct alias literals require updating

**Interfaces:**
- Consumes: `aliasCardFrontmatterSchema`
- Produces: `aliasCardSchema` with no `body`, and `Card` whose alias member has no `body`

- [ ] **Step 1: Write the failing schema test**

Add a test parsing an alias through `cardSchema` and asserting that `'body' in alias` is false. Remove `body: ''` from typed alias test helpers so TypeScript also exposes the old union shape as invalid.

- [ ] **Step 2: Run the focused checks and verify red**

Run: `pnpm exec vitest run packages/core/test/schema.test.ts packages/graph/test/validate.test.ts && pnpm typecheck`

Expected: the runtime assertion and/or typecheck fails because the alias member still requires `body: ''`.

- [ ] **Step 3: Implement the bodyless alias schema**

Change:

```ts
export const aliasCardSchema = aliasCardFrontmatterSchema;
```

Update schema comments so only Markdown cards are described as carrying a body.

- [ ] **Step 4: Run the focused checks and verify green**

Run: `pnpm exec vitest run packages/core/test/schema.test.ts packages/graph/test/validate.test.ts && pnpm typecheck`

Expected: schema tests and typecheck pass after remaining typed alias literals in this slice omit `body`.

### Task 2: Deepen card-file intake and serialize by kind

**Files:**
- Modify: `packages/graph/src/card-file.ts`
- Modify: `packages/graph/src/space.ts`
- Modify: `packages/graph/test/card-file.test.ts`
- Modify: `packages/graph/test/card-file.property.test.ts`
- Modify: `packages/graph/test/card-file-round-trip.property.test.ts`
- Modify: `packages/graph/test/serialize-card-file.test.ts`
- Modify: `packages/graph/test/space.test.ts`
- Modify: `packages/app/test/space-files.test.ts`

**Interfaces:**
- Consumes: bodyless `Card`
- Produces: `ParseCardFileResult = { ok: true; card: Card } | { ok: false; errors: CardFileError[] }`
- Produces: `serializeCardFile(card: Card): string` that emits bodies only for Markdown cards

- [ ] **Step 1: Change the parser tests to the intended public result**

Replace successful `result.frontmatter`/`result.body` assertions with `result.card`. Preserve the existing `loadSpace` regression test that rejects a non-empty alias body. Update the round-trip property to assert `parsed.card` equals the generated card, and generate aliases without a body field.

- [ ] **Step 2: Run focused graph tests and verify red**

Run: `pnpm exec vitest run packages/graph/test/card-file.test.ts packages/graph/test/card-file.property.test.ts packages/graph/test/card-file-round-trip.property.test.ts packages/graph/test/serialize-card-file.test.ts packages/graph/test/space.test.ts`

Expected: failures because `parseCardFile` still returns split fields and `serializeCardFile` still destructures `body` from every card.

- [ ] **Step 3: Implement explicit intake validation and complete-card output**

In `parseCardFile`, after validated frontmatter:

```ts
if (parsed.data.kind === 'alias' && split.body !== '') {
  return fail('invalid-frontmatter', 'body: alias cards may not have a body');
}

const candidate =
  parsed.data.kind === 'markdown' ? { ...parsed.data, body: split.body } : parsed.data;
const card = cardSchema.safeParse(candidate);
```

Return `{ ok: true, card: card.data }`. In `loadSpace`, use `parsed.card.id` for duplicate detection and push `parsed.card` directly.

- [ ] **Step 4: Implement kind-aware serialization**

For an alias, stringify the card itself as frontmatter and emit an empty post-fence region. For Markdown, destructure `body` and emit it exactly as today.

- [ ] **Step 5: Run focused graph tests and verify green**

Run: `pnpm exec vitest run packages/graph/test/card-file.test.ts packages/graph/test/card-file.property.test.ts packages/graph/test/card-file-round-trip.property.test.ts packages/graph/test/serialize-card-file.test.ts packages/graph/test/space.test.ts packages/app/test/space-files.test.ts`

Expected: all focused tests pass, including non-empty alias-body rejection and parser/serializer round trips.

### Task 3: State the resolver guarantee and finish integration

**Files:**
- Modify: `packages/graph/src/lookup.ts`
- Modify: `packages/graph/test/lookup.test.ts`
- Modify: any remaining typed alias literals reported by `pnpm typecheck`
- Modify: `.scratch/alias-cards/issues/04-an-alias-has-no-body-field-at-all.md`

**Interfaces:**
- Produces: `ResolvedContentCard = Exclude<Card, { kind: 'alias' }>`
- Produces: `resolveContentCard(space, cardId): ResolvedContentCard | undefined`

- [ ] **Step 1: Strengthen lookup coverage**

Assert that resolving an alias returns its Markdown target including its body, while missing cards remain `undefined`. The existing target and self-resolution examples remain the public seam tests.

- [ ] **Step 2: Run lookup tests and typecheck to verify red**

Run: `pnpm exec vitest run packages/graph/test/lookup.test.ts && pnpm typecheck`

Expected: typecheck reports `.body` assumptions or remaining alias literals once the bodyless union flows through consumers.

- [ ] **Step 3: Narrow the resolver implementation**

Export `ResolvedContentCard` from `lookup.ts`. Return a non-alias card directly; for an alias, look up its target and defensively return `undefined` if that target is missing or is itself an alias.

- [ ] **Step 4: Resolve integration fallout without widening the model**

Remove `body: ''` from remaining alias literals and update assertions to check that aliases lack `body`. Do not add casts or optional `body` fields. Confirm the app and adapter content reads compile through `resolveContentCard`.

- [ ] **Step 5: Mark the issue resolved with evidence placeholders filled after verification**

Change issue status to `resolved` and add an Answer summarizing the final schema, explicit intake check, parser interface, serializer, resolver type, and actual verification counts.

- [ ] **Step 6: Run repository verification**

Run: `pnpm verify`

Expected: both typechecks, lint, format check, and all coverage tests pass.

- [ ] **Step 7: Run browser verification**

Run: `pnpm e2e`

Expected: all Playwright projects pass without touching the human server on ports 5173/5174.

- [ ] **Step 8: Review final diff**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors; changes are limited to issue 04, the plan, core/graph implementation, and directly affected tests.
