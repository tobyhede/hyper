# 28 — Rename `expanded` to `open` below the domain

**What to build:** Carry the Open vocabulary through the render layer and the refusal codes, where "expanded" still survives.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Priority:** P3

**Why:** `CONTEXT.md` lists "Expanded and expansion" as words to avoid for the Open state. The domain says `open` (`Map.open`, `at.open` in `snapshot-edits.ts`). The render layer and refusal codes still say otherwise.

- `ResourceNodeData.expanded` (`packages/react-flow-adapter/src/projection.ts`), and its `data.expanded` readers in `ResourceNode.tsx`, `canvas-resource-decoration.ts`, `canvas-resource-authoring.ts`, `embedded-map.ts` and `embedded-open-space-resource.ts`.
- The DOM attribute `data-expanded` (`ResourceNode.tsx`, `CanvasResource.tsx`), and every CSS rule, e2e and ladle-e2e selector that reads it.
- The refusal code `resource-not-expanded` (`packages/graph/src/snapshot-edits.ts`, `packages/app/src/space-authoring.ts`, `packages/app/src/authoring-refusal.ts`).
- "Expanded Resource" in comments in `projection.ts`, `ResourceNode.tsx`, `SpaceCanvas.tsx`, `MarkdownResourceBody.tsx` and `ResourceContent.tsx`, and in tests and stories.

Leave `aria-expanded` and React Flow's `expandParent` alone. Those are the platform's and React Flow's words.

- [ ] `grep -rniE 'expanded|expansion' packages src test` finds only `aria-expanded`, `expandParent` and quotations of the avoid-list.
- [ ] Consider adding an arm to `test/unit/current-domain-vocabulary.test.ts` so the word cannot drift back.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass. Grep `test/e2e/` for `data-expanded` too, because the database proofs are not in `e2e`.
