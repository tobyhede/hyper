# 10: Apply the comment rule across source

**What to build:** Every source comment across all packages and the root `src` brought within 01's rule in one pass. Lineage prose is removed or cut down to the invariant it was protecting. Citations are kept only where 01 allows. The result is a source tree that says what the code does and why, without its history. Directive comments (`@ts-expect-error`, `eslint-disable`/`eslint-enable`, `v8 ignore`, `@vitest-environment` and their kin) are out of scope, reason text included: an `eslint-enable` removed or moved widens a suppression that no other check reports.

**Blocked by:** 01, 04, 06, 07, 08, 09 (runs after the splits, so moved code is edited only once)

**Status:** resolved — implementation comments delivered in PR #297, test, e2e, Ladle and story comments in PR #300 (both merged 2026-09-25).

- [x] Lineage phrasing ("replaces", "retired", "no longer", "used to", "was once") no longer appears in source comments, except where a comment states a live constraint. #297 covers `packages/*/src`, `src/` and `scripts/`, leaving `scripts/persistence-cost/**` to ticket 17. #300 covers `test/**`, `packages/*/test`, `packages/app/e2e`, `packages/app/ladle-e2e` and `packages/app/stories` (181 files; comment-stripped emit identical to `main` for each, directive grep unchanged, `pnpm verify` green). Two strings outside the comment scope still carry lineage and are left for a follow-up: the `applicationEvidence` string in `packages/app/stories/parity-claims.ts` and the "(ticket 02, item N)" `describe` titles in `packages/app/test/authoring-placement-copy.test.ts`
- [x] No comment on a public export loses its statement of contract or invariant
- [x] The change touches comments only: the compiled JavaScript is unchanged and the CSS differs by one unused rule, checked by running `pnpm build` (the Vite app bundle and the HTTP server build) before and after and diffing its output. `tsc` runs with `noEmit`, so it has no output to compare. Result: every JS chunk is identical apart from content hashes; the CSS bundle loses one unused utility, `shadow-[0_12px_40px_rgba(0,0,0,0.5)]`, which Tailwind generated only because a removed comment quoted the class name. Each changed `.ts`/`.tsx` file's comment-stripped AST is identical to its previous version
- [x] Directive comments are unchanged: `git grep -E '@ts-(expect-error|ignore|nocheck)|(eslint|oxlint)-(disable|enable)|(v8|c8|istanbul) ignore|@vitest-environment|prettier-ignore' -- packages src test scripts '*.config.ts'` prints the same output before and after
- [x] Vocabulary-test masks and exemptions still pass, or are updated in the same change as 01 recorded
- [x] `pnpm verify` green (254 test files, 3452 tests passed, on the finished branch)
