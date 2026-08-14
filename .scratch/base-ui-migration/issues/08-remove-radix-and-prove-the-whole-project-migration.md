# 08 — Remove Radix and prove the whole-project migration

**What to build:** Contract the temporary dual-primitive state into the single Base UI and Lucide foundation ADR 0050 chose, with no authored Radix wrapper left and with the complete authoring experience proven against the pre-migration baseline.

**Blocked by:** 02 — Adopt Lucide without changing icon meanings; 04 — Move the View, Layout, and Graph selectors onto Base UI Select; 05 — Move Popover and Card endpoint editing onto Base UI; 06 — Move the Add Card menu onto Base UI; 07 — Rebuild the Card Editor on Base UI Dialog.

**Status:** done

- [x] Sweep all authored UI and app code for Radix imports, stale Radix composition props, state attributes, CSS variables and registry placeholders, resolving every real leftover.
- [x] Remove direct Radix dependencies only after the last authored consumer has moved, regenerate the pnpm lockfile and distinguish any cmdk-owned transitive Radix package from a Hyper wrapper.
- [x] Leave cmdk Command intentionally untouched and record it among the non-Radix wrappers left alone.
- [x] Complete every per-component migration report and the whole-project report, including dependency changes, consumer sweep, behavior deltas, baseline comparison and manual QA still required.
- [x] Update current-state documentation to mark ADR 0050 built and retire instructions that still direct new work toward Radix, without rewriting accepted ADR history beyond relationship/status metadata.
- [x] Make shadcn project information report the intended Base configuration for both workspaces and derive zero remaining authored Radix wrappers from the shared UI source.
- [x] Pass both TypeScript programs, lint, formatting, full unit/property coverage, the production build and the complete database-free Playwright suite.

## What the review-fix pass closed, and what it did not

Closed by the CodeRabbit review-fix pass: the Radix sweep (no authored module imports `@radix-ui/*`), the dependency removal with the lockfile regenerated, cmdk recorded as the deliberate exception in AGENTS.md, the current-state documentation, and the whole verification bar — `pnpm verify` exit 0 (1190 passed, 10 skipped), `pnpm build` exit 0, `pnpm e2e` exit 0 (93 passed).

## What the closing pass added

- The **whole-project migration report** is written: `.scratch/base-ui-migration/08-whole-project-migration-report.md`. It states the dependency delta, the consumer sweep with its commands and output, the six behaviour deltas that must not be tidied away, the verification record, and the residue below — as one document, beside the per-component reports 02–07 rather than in place of them.
- **`shadcn info` has been run** against both workspaces, and both report the intended Base configuration: `style base-nova`, `base base`, `baseColor neutral`, `iconLibrary lucide`, Tailwind v4. Zero authored Radix wrappers derive from the shared UI source (`git grep "@radix-ui"` over `packages/*/src`, `packages/*/test`, `src` and `test` is empty; the 80 remaining lockfile lines are cmdk@1.1.1's four direct Radix dependencies and their transitives).

**Human-owned, and not claimable by any run in this repo:** the manual QA against the pre-migration baseline. The report carries it as a concrete per-surface checklist — focus return, Escape, dismissal, and the `nokey` delete-key containment on portalled surfaces, which is the one most likely to regress silently. The ticket is closed on the work it specified; that checklist is the standing hand-off, not an unfinished item.

**Known residue, recorded and deliberately not fixed here:** `packages/ui/package.json` declares `#components/*` → `./src/components/*.tsx` and `#hooks/*` → `./src/hooks/*`, and **neither directory exists** — every component lives at `packages/ui/src/*.tsx` behind the curated `src/index.ts`, which is why `shadcn info` reports no installed components. A generated component therefore lands somewhere the barrel does not cover and must be added to `index.ts` by hand. Fixing it properly means moving the components or repointing the `imports`/`exports` patterns, which is a package-layout decision rather than a migration leftover.
