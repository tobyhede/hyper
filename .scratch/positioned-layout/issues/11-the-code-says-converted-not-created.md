# The code says "converted", not "created"

Status: resolved
Type: task

ADR 0017's word for a Layout the app made is **created**, because 0017 made one when a space opened. ADR 0025's word is **converted**, because what makes one now is an edit. The old word is still throughout: `CREATED_LAYOUT_ID` and `CREATED_LAYOUT_TITLE` in `packages/app/src/persist.ts` with a doc block citing 0017, three comment sites in `App.tsx`, the store's own doc in `editor.ts`, and `packages/graph/src/new-space.ts` ("The Layout arrives when the space opens (ADR 0017), not here" — which under 0025 is wrong about *when*, not just about which ADR).

Test and spec names carry it too: `packages/app/test/editor.test.ts`, `packages/app/e2e/editing.spec.ts`, `packages/app/e2e/new-space.spec.ts`.

Separable and lower value: a cluster of citation-only sites — `core/src/schema.ts`, `core/src/types.ts`, `graph/src/space.ts`, `lookup.ts`, `validate.ts`, `positioned.ts`, `graph/test/validate.test.ts`. Every claim at those survives 0025 intact; only the ADR number is stale. **Done** — eleven citations, ten renumbered and one rewritten: `new-space.ts` said the Layout arrives when the space *opens*, which is wrong about the moment and not just about the number, and now says it arrives when the space is edited and that a space only read keeps none.

This is a rename, so `workflow.md`'s rule applies: it runs alone, in its own commit, never riding along with a structural change. It is also cosmetic — nothing behaves differently — so it should not block `12` or `13`.

One thing that is not cosmetic and belongs here: `docs/adr/0018-a-new-space-is-a-single-centered-card.md` says a new space "gets a Layout the moment it opens (ADR 0017)". That is an accepted ADR carrying a superseded claim with nothing pointing at the supersession. ADR 0021 has the same problem and needs no fix — 0025's *What this changes in 0021* answers it by name — but 0018 has no equivalent, so it wants a status-line link.

## Answer

The persistence refactor had already removed `CREATED_LAYOUT_ID`,
`CREATED_LAYOUT_TITLE`, and `persist.ts`. The remaining app comments and test
names now describe the first resolved arrangement as the source staged for
conversion, and describe the first edit as what converts it under ADR 0025.
No runtime behavior changed.

ADR 0018 and ADR 0025 now carry the refinement relationship in both directions:
0018 is `Refined by: 0025`, and 0025 `Refines: 0018`.

Verification: `pnpm verify` passed 33 test files and 299 tests; `pnpm e2e`
passed all 32 Playwright tests.
