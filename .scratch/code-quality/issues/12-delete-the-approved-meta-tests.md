# 12 — Implement approved test replacements and removals

**What to build:** Implement the approved classifications from ticket 11, preserving meaningful architectural checks and replacing brittle source assertions with tests of observable behavior. Remove redundant tests and support code that nothing else uses.

**Blocked by:** 11 — Classify repository and source-inspecting tests, plus approval of the individual classifications to implement.

**Status:** resolved — every approved row implemented; rows 7 and 23 after re-confirmation (see Answer).

- [x] Implement only individually approved replacements and removals from ticket 11; leave pending or rejected proposals unchanged.
- [x] Each replacement exercises the stated behavior and can detect the failure the approved classification identifies before its source-based predecessor is removed.
- [x] Retained package-boundary, public-export and architectural checks continue to pass.
- [x] Remove support code used only by deleted tests and update references that would otherwise become misleading.
- [x] Full project verification passes.
- [x] Deliver separately from the classification PR. Keep one implementation PR if the approved scope fits a fresh context window; otherwise propose bounded follow-up slices before expanding it.

## Answer

Ticket 11 approved 13 non-keep rows (all recommendations accepted, 2026-09-25). Eleven are implemented in one PR; two are held because their stated precondition or premise did not hold when checked.

| Row | Test | Approved | Done | How the replacement was shown to detect the failure |
| --- | ---- | -------- | ---- | ---------------------------------------------------- |
| 5 | `point-type-identity.test.ts` | delete | deleted; `docs/agents/rendering.md` citation removed | — (removal) |
| 7 | `ui-component-type-imports.test.ts` | delete, **after confirming the lint reports it** | deleted, after making the lint report it | The lint first missed it: typescript-eslint's default `jsxPragma` counts JSX as a value use of `React`, which the `react-jsx` transform never makes. With `jsxPragma: null` in `eslint.config.js`, turning `alert.tsx`'s `import type * as React` back into a value import fails `consistent-type-imports` on exactly that file, and `pnpm lint` stays green across the repository. Re-confirmed by the user 2026-09-25. |
| 8 | `fetch-native-http-architecture.test.ts` | delete | deleted | — |
| 19 | `coordinated-context-create.test.ts` › does not import continuation targets | fold into ESLint | `no-restricted-imports` zone on `coordinated-context-create.ts` (`./continuation`) | Injected `import type … from './continuation'`: lint error. |
| 20 | `coordinated-context-delete.test.ts` › Dock delete wiring | delete | deleted (regexes over `dock-chrome.ts`) | — |
| 21 | `embedded-open-space-resource.test.ts` › edit portal state lives in the pipeline | delete the regex; fold the import ban into ESLint | `useState` regex deleted; `no-restricted-imports` zone on `use-embedded-open-space-resources.ts` (`^\./components/`) | Injected `import { SpaceCanvas } from './components/SpaceCanvas'`: lint error. |
| 22 | `map-authoring-commands.test.ts` › the Map authoring module | fold into ESLint | `no-restricted-imports` (`./continuation`, `react`, `react-dom`, their subpaths) and `no-restricted-globals` (`document`, `window`) on `map-authoring-commands.ts` | Injected a `react` import, a `react-dom/client` import, a `./continuation` import and `window`/`document` reads: five lint errors. |
| 23 | `sqlite-path-policy.test.ts` › states the absolute-path rule with node:path | delete | deleted, re-confirmed | No `path.win32.isAbsolute` test exists, so this spelling test was the only guard on the Windows half of the rule. Development and CI run only on POSIX, where both spellings behave alike; the user re-confirmed deletion 2026-09-25 knowing no Windows guard remains. Its orphaned comment went with it; the POSIX behaviour cases stay. |
| 24 | `prisma-sqlite-foundation.test.ts` › Vite-config substrings | delete | deleted, with its three file reads | — |
| 33 | `e2e-projects.test.ts` › Playwright retry policy | fold into `playwright-flake-policy.test.ts` | describe deleted; the project-selection half kept | Already asserted there: setting `failOnFlakyTests: false` in `playwright.config.ts` fails `playwright-flake-policy` › agrees on CI. |
| 36 | `current-domain-vocabulary.test.ts` | keep source arms; delete document arms | `scannableFiles` leaves out prose `.md` (Space Resource files under `packages/app/{example,fixture}/` stay scanned as data); document-only arms, exemptions, masks, quotations and canaries removed | A planted retired word in `packages/app/src/titles.ts` still fails the guard; the same word in `docs/agents/ui.md` no longer does. |
| 38 | `context-reference-opening.test.ts` | delete | deleted | — |
| 40 | `scratch-ticket-numbers.test.ts` | fold into `scripts/roadmap.ts` (and `roadmap.test.ts`) | `buildRoadmap` reports `duplicateNumbers` per effort; both renderings list them; `roadmap.test.ts` proves it on a planted temp tree and holds the tracked tracker to none | A planted duplicate `12-…md` in `.scratch/code-quality/issues/` fails the tracked-tracker case. |

**Judgment calls.**

- Row 36 reads "tracked Markdown documents" as prose, not Space data: the fixture and example Resource files are Markdown but are product input, read like `space.json`, so they stay scanned. Every self-test fixture that existed only to model document prose went with its arm (`RETIRED_LOOSE_COMPOUND`, the `renderers.selected` field entry, the AGENTS.md sentence fixture).
- Row 40 keeps one real-tracker assertion inside `roadmap.test.ts`, so the rule the deleted test enforced still holds under `verify`; the fold moves its home, not its reach.
- The ESLint zones restate the `app` zone's bans for their file, because a later flat-config block replaces an earlier one for the same rule. No unit test pins the new zones; they were proved by injection only (above).
- References updated: `docs/agents/rendering.md` (row 5), the two source comments naming the folded tests (rows 19, 22), AGENTS.md's two vocabulary-guard bullets and `.coderabbit.yaml` (row 36). Historical `.scratch/` records that cite the deleted tests are left as history.

**Follow-up.** None. Rows 7 and 23 were held for re-confirmation because their approvals' conditions did not hold; the user re-confirmed both, row 7 once the lint was made to report it.

**Verification (2026-09-25).** `pnpm verify` exit 0: 250 test files, 3428 passed and 13 skipped. `pnpm e2e` and `pnpm e2e:ladle` were not run: no product behaviour, component or story changed — the only `src/` edits are two comments.
