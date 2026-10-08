# 02: Retire "front"

**What to build:** Retire the card prototype's word from the vocabulary and the code, as a rename alone.

**Blocked by:** 01.

**Status:** ready-for-agent

**Spec:** `.scratch/resource-has-no-front/spec.md`, decisions 1–5.

- [ ] ADR "The Resource has no front", refining 0051; 0051's "Refined by" names it.
- [ ] `CONTEXT.md` describes a Resource on a Map as Closed or Open with no "front", and lists front, back, face and card under _Avoid_.
- [ ] A tracked codemod under this directory, with the header the earlier ones carry (mask-then-rewrite-then-unmask, spellings it must not change, files it must not open, what it deliberately does not produce): `CanvasResourceFront` → `KindOperations`, `front` prop → `kindOperations`, `FrontDisplay` → `CanvasResourceDisplay`, locals, story `Front` → `Closed`, the two parity claim ids in `parity-claims.ts`, `packages/app/e2e/` and `packages/app/ladle-e2e/`.
- [ ] A separate commit rewrites prose comments by hand.
- [ ] `test/unit/current-domain-vocabulary.test.ts` has a block reporting the identifier shapes and the `Resource front` / `Closed front` / `Open front` phrases; bare English "front" and `frontmatter` are not reported.
- [ ] E2E and Ladle E2E diffs are limited to the renamed ids and story slug.
