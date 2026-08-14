# 08 — Remove Radix and prove the whole-project migration

**What to build:** Contract the temporary dual-primitive state into the single Base UI and Lucide foundation ADR 0050 chose, with no authored Radix wrapper left and with the complete authoring experience proven against the pre-migration baseline.

**Blocked by:** 02 — Adopt Lucide without changing icon meanings; 04 — Move the View, Layout, and Graph selectors onto Base UI Select; 05 — Move Popover and Card endpoint editing onto Base UI; 06 — Move the Add Card menu onto Base UI; 07 — Rebuild the Card Editor on Base UI Dialog.

**Status:** ready-for-agent

- [x] Sweep all authored UI and app code for Radix imports, stale Radix composition props, state attributes, CSS variables and registry placeholders, resolving every real leftover.
- [x] Remove direct Radix dependencies only after the last authored consumer has moved, regenerate the pnpm lockfile and distinguish any cmdk-owned transitive Radix package from a Hyper wrapper.
- [x] Leave cmdk Command intentionally untouched and record it among the non-Radix wrappers left alone.
- [ ] Complete every per-component migration report and the whole-project report, including dependency changes, consumer sweep, behavior deltas, baseline comparison and manual QA still required.
- [x] Update current-state documentation to mark ADR 0050 built and retire instructions that still direct new work toward Radix, without rewriting accepted ADR history beyond relationship/status metadata.
- [ ] Make shadcn project information report the intended Base configuration for both workspaces and derive zero remaining authored Radix wrappers from the shared UI source.
- [x] Pass both TypeScript programs, lint, formatting, full unit/property coverage, the production build and the complete database-free Playwright suite.

## What the review-fix pass closed, and what it did not

Closed by the CodeRabbit review-fix pass: the Radix sweep (no authored module imports `@radix-ui/*`), the dependency removal with the lockfile regenerated, cmdk recorded as the deliberate exception in AGENTS.md, the current-state documentation, and the whole verification bar — `pnpm verify` exit 0 (1190 passed, 10 skipped), `pnpm build` exit 0, `pnpm e2e` exit 0 (93 passed).

**Still open, and the ticket stays `ready-for-agent` for them:**

- The **whole-project migration report** is unwritten. Reports 02–07 cover their own components; nothing yet states the dependency delta, the consumer sweep and the behaviour deltas as one document, and nothing records the baseline comparison or the manual QA the ticket asks for. Both are human-facing claims a test run cannot make.
- **`shadcn info` has not been run** against either workspace. `packages/ui/components.json`'s `ui` alias was corrected from `#components/ui` to `#components` so both workspaces name the same directory, but that the CLI *reports* the intended Base configuration is unverified. A related defect is recorded and not fixed: `packages/ui/package.json` declares `#components/*` → `./src/components/*.tsx` and `#hooks/*` → `./src/hooks/*`, and **neither directory exists** — every component lives at `packages/ui/src/*.tsx` behind the curated `src/index.ts`. A generated component therefore lands somewhere the barrel does not cover and must be added to `index.ts` by hand. Fixing it properly means moving the components or repointing the `imports`/`exports` patterns, which is a package-layout decision rather than a migration leftover.
