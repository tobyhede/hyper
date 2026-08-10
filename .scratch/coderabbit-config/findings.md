# CodeRabbit configuration for this repository

Research against the CodeRabbit documentation (2026-08) and the live configuration schema, plus the decisions behind the `.coderabbit.yaml` now sitting at the repository root.

## How the configuration is read

- The file is `.coderabbit.yaml` **in the repository root**, and CodeRabbit reads the copy **on the branch under review** — so a change to it is testable in the pull request that makes it. An untracked file has no effect on anything.
- The JSON schema is live at `https://coderabbit.ai/integrations/schema.v2.json` (redirects to `www.`). The `# yaml-language-server: $schema=` comment on line 1 gives editor completion and validation. The schema is the authority; the docs reference page lags it (`inheritance` is in the schema and absent from the docs).
- YAML settings override the web UI. `@coderabbitai configuration` on any pull request prints the resolved configuration with per-key provenance, which is the way to confirm what actually applied.
- Other useful chat commands: `@coderabbitai full review`, `pause`/`resume`/`ignore`, `emit path instructions` (opens a PR proposing path instructions derived from recent reviews), `generate configuration`.

## What the config does, and why

### Language and tone

`language: en-AU`. The schema's enum has 100 entries including `en-AU` and `en-GB`. The house prose is Australian/British throughout — `colour`, `behaviour`, `sanitised`, `emphasised`, `externalizes` notwithstanding — and `en-US` (the default) makes every one of those a spelling finding.

`tone_instructions` is capped at 250 characters by the schema; ours is 176.

### Profile

`chill`, the default. `assertive` exists to surface more nitpicks, and this repo already gates on `pnpm verify` plus `pnpm e2e` in CI. Raise it if reviews read as thin, not to find more style comments.

### Turned off because the repo has nothing for them to read

`assess_linked_issues`, `related_issues`, `suggested_labels`, `suggested_reviewers`, `pre_merge_checks.issue_assessment` — the issue tracker is markdown under `.scratch/`, not GitHub Issues, and there is one committer. `poem`, `in_progress_fortune` and `chat.art` are noise. Jira and Linear integrations are explicitly `disabled` rather than `auto` so no lookup is attempted.

`enable_prompt_for_ai_agents` stays **on**: the repo's `autofix` skill consumes exactly that block.

### Path filters are a sparse checkout

The schema is explicit: path filters "also apply to `git sparse-checkout`". An exclusion therefore removes the file from the context CodeRabbit can read, not just from the review surface. So `AGENTS.md`, `CONTEXT.md`, `docs/` and `.scratch/` must **not** be filtered — they are the review criteria. Only four exclusions, all emitted artifacts that mirror `.prettierignore` and the ESLint `ignores`:

```
!src/prisma/contract.json
!src/prisma/contract.d.ts
!migrations/**/*.json
!migrations/**/*.d.ts
```

`migrations/**/migration.ts` and `src/prisma/contract.prisma` stay in scope deliberately — they are the readable schema delta, and a path instruction tells CodeRabbit not to propose edits to them.

Lock files, `dist/`, `coverage/`, `node_modules/` and media are excluded by CodeRabbit's built-in defaults already; restating them buys nothing.

### Path instructions carry the traps

Sixteen entries, each capped at 20 000 characters by the schema. The selection principle: **encode the places where a competent general reviewer will confidently give the wrong advice**, not general good practice.

The highest-value entry is the repo-wide one about **ADR 0041**. The Route → Graph rename is accepted and not built, so every `route`, `activeRoute`, `RouteEdge` and `projectRouteEdges` in the tree is correct-as-is. Without that instruction, "inconsistent naming" would be the dominant finding of every review for as long as the rename is pending. It also lists the retired vocabulary (`manifest`, `Arrangement`, `Walk`, shared `Draft`) and the fact that `path` means a filesystem/router path.

The rest are drawn straight from the AGENTS.md gotchas that cost real debugging time:

| Path | What it prevents |
| --- | --- |
| `packages/react-flow-adapter/**` | Suggesting `useUpdateNodeInternals` (breaks the *next* connection), `display: none` on handles (0×0 measurement), `FIXED_ORDER` ports, bare ELK port ids, per-side handle counters |
| `packages/http/**` | `context.notFound()` re-entry, rethrowing from `onError`, Hono's `bodyLimit`, trusting `Content-Length`, a second media policy, `Zod.parse` prose in a client-facing decoder |
| `packages/persistence/**` | `submit` deciding from its argument instead of `state.working`; a second declaration of the repository seam |
| `packages/app/src/**` | Derived arrays in store selectors, `useMemo` on `Navigation.moves()`, reordering the install shell, a boolean install gate, `event.returnValue` |
| `packages/graph/**` | A new index export without the surface test; loosening closed `Placement` construction |
| `*.config.ts`, `vite*.ts` | Bare `@project/*` specifiers — the one place the extensionless-relative convention inverts, and the failure mode is a dev server that will not start |
| `migrations/**`, `src/prisma/**` | Proposing removal of the two documented Prisma Next 0.16.0 workarounds |
| `docs/adr/**`, `.scratch/**/*.md` | Rewriting historical ADR and resolved-issue bodies to current vocabulary |
| `.agents/skills/**`, `.claude/skills/**` | Editing vendored skills — while explicitly asking for security review of what changed |

The docs advise treating path instructions as a targeted supplement and observing a few reviews first. If any entry proves to be dead weight, delete it; `@coderabbitai emit path instructions` can propose replacements from what reviews actually surfaced.

### Tools: what was turned off, and why

**ESLint is off, and would have been inert anyway.** Two independent reasons:

1. CodeRabbit runs a curated plugin allow-list, and `eslint-plugin-react-refresh` is not on it. The documented behaviour is: "If any plugin outside the allow-list is referenced, CodeRabbit skips ESLint for the run." The root flat config registers `react-refresh`, so ESLint never runs here.
2. `@typescript-eslint` type-checking rules are disabled in CodeRabbit's runner. This repo's config is `strictTypeChecked` + `stylisticTypeChecked` with `projectService: true` — nearly all of it is type-aware.

`enabled: false` makes the no-op explicit rather than mysterious. CI's `eslint . --max-warnings=0` is the authority. (Allow-listed plugins, for reference: `@typescript-eslint`, `@stylistic`, `import`, `simple-import-sort`, `unused-imports`, `n`, `node`, `react`, `react-hooks`, `react-native`, `jsx-a11y`, `next`, `jest`, `vitest`, `testing-library`, `cypress`, `playwright`, `mocha`, `vue`, `nuxt`, `angular`, `@angular-eslint`, `svelte`, `astro`, `solid`, `qwik`, `turbo`, `hydrogen`, `storybook`, `sonarjs`, `security`, `unicorn`, `promise`, `regexp`, `compat`, `jsdoc`, `deprecation`, `lodash`, `boundaries`, `perfectionist`, `eslint-comments`, `e18e`, `prettier`, `tailwindcss`, `mdx`.)

| Tool | Off because |
| --- | --- |
| `biome`, `oxc` | A second JS linter's opinions are not the house style |
| `markdownlint` | Markdown is excluded from Prettier on purpose; ~240 KB of deliberately formatted prose would flood every docs PR |
| `languagetool` | Same volume problem — grammar findings would dominate every review |
| `yamllint` | Five YAML files, no `.yamllint`; default rules are style, and actionlint + zizmor cover the file that matters |
| `prismaLint` | `contract.prisma` is emitted by `prisma-next contract emit` |
| `checkov`, `trivy` | `compose.yaml` is a local dev PostgreSQL service, not deployed infrastructure |

Kept on: `actionlint` and `zizmor` (the CI workflow pins SHAs and handles a generated database password), `gitleaks`/`trufflehog`/`osvScanner`/`semgrep`, `dotenvLint` (there is a tracked `.env.example`), `reactDoctor`, and `ast-grep` essential rules.

`skillspector` is kept on **deliberately**: it scans `SKILL.md` manifests and MCP configurations for malicious patterns, and this repo tracks 80 vendored third-party skill files under `.agents/skills/` and `.claude/skills/`. That is the one place a supply-chain scanner earns its keep here — which is also why those directories are *not* in `path_filters`.

**`github-checks.timeout_ms: 900000`** is the single most mechanical win. The default is 90 seconds; this repo's CI runs `verify`, a PostgreSQL integration suite and Playwright, so CodeRabbit was always reviewing without knowing what CI found. 900 000 ms is the schema maximum (15 minutes) and matches the workflow's own `timeout-minutes: 15`/`20`.

### Pre-merge checks

Built-ins: docstring coverage `off` (no docstrings anywhere — an 80 % warning on every PR is pure noise), issue assessment `off`, title and description `warning`.

Three custom checks, all `warning` as the docs advise for new checks:

- **Verification evidence** — the description must carry real `pnpm verify` output, and `pnpm e2e` for UI/graph changes. This is `docs/agents/workflow.md`'s bar, checked by something other than memory.
- **Decision records** — a change that contradicts or supersedes an accepted ADR needs a new ADR with two-way refinement links, or an AGENTS.md build-status update.
- **Domain vocabulary** — new terms get a CONTEXT.md entry; retired terms stay retired.

`error` mode only blocks when `request_changes_workflow` is enabled, which it is not. Escalate a check to `error` only after watching it behave.

### Knowledge base

Defaults already ingest `**/AGENTS.md` and `**/CLAUDE.md` (a symlink to it). `filePatterns` **supplements** the defaults rather than replacing them, and a plain string pattern scopes the guideline to its own directory and below — which is wrong for `CONTEXT.md`, so the object form with explicit `applyTo` is used:

- `CONTEXT.md` → `**/*` (the domain model governs everything)
- `docs/agents/workflow.md` → `**/*`
- `docs/agents/issue-tracker.md` → `.scratch/**/*.md`
- `docs/agents/domain.md` → `docs/adr/**/*.md,CONTEXT.md`

The 42 ADRs are deliberately **not** loaded wholesale — 244 KB of decision record would swamp the context, and AGENTS.md's "Decided — read these before the code" section already is the digest, with a path instruction covering ADR conventions.

`learnings`, `issues` and `pull_requests` scopes are `local`: one prototype repository, nothing should bleed across.

`web_search` stays on — it can check whether the pinned React Flow 12.11.2, Hono and Prisma Next 0.16.0 workarounds still hold upstream, which is exactly the kind of thing that goes stale silently.

## Verification

- Parses with `yaml@2.9.0`.
- Structurally valid against `schema.v2.json` — every key known, every enum value legal, `tone_instructions` within its 250-character cap.
- `prettier --check .coderabbit.yaml` passes, so it does not break `pnpm format:check`.

## Open questions

- The `.claude/skills/` entries are symlinks into `.agents/skills/`. Whether CodeRabbit's sparse checkout materialises them as symlink blobs or as content is untested; either way `skillspector` sees the real files under `.agents/skills/`.
- `AGENTS.md` is 60 KB and `CLAUDE.md` symlinks to it. Both match default guideline patterns, and `filePatterns` cannot subtract from the defaults, so the file may be ingested twice. Harmless, but it is context budget.
- A phase-2 option not taken: `reviews.tools.ast-grep.rule_dirs` pointing at repo-authored rules that mechanically enforce the bans currently expressed as prose — `useUpdateNodeInternals`, `display: none` on a handle, `new Map()` where a `Placement` belongs. Worth doing only if the prose instructions prove unreliable in practice.
