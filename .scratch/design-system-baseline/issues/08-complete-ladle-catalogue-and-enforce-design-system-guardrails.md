# 08 — Complete the Ladle catalogue and enforce design-system guardrails

**What to build:** Make Ladle a trustworthy catalogue of the real UI, then enforce the boundary that product components and styles come through the design system while React Flow retains only its necessary geometry and integration styling.

**Blocked by:** 03 — Recompose Card and Alias panes from form primitives; 04 — Bring workspace selection and operational feedback into the system; 05 — Make the production canvas Card a design-system component; 06 — Systematise Graph HUD and Edge authoring surfaces; 07 — Rebuild presentation chrome with design-system components; 11 — Deliver ADR 0052 and its production-parity operating rule to `main`; 14 — Replace the workspace toolbar with a workspace Sidebar. Issue 14 supersedes resolved Issue 02's withdrawn Menubar and interim selector designs.

**Status:** ready-for-agent

- [ ] Every production UI component has representative real-component Ladle stories for its meaningful states; no proposal-only story is presented as production evidence.
- [ ] Legacy feature-owned visual styling is removed or explicitly limited to React Flow geometry and integration requirements.
- [ ] Automated checks prevent new product UI components or styles from bypassing `@project/ui`, and the complete verification suite remains green.
- [ ] `$shadcn-first-ui` exists and is the mandatory production-UI workflow.
- [ ] Root `AGENTS.md` routes production UI work to that skill near the beginning of the file.
- [ ] `pnpm ui:catalog` deterministically exposes the public design-system inventory.
- [ ] `pnpm ui:catalog:check` is part of verification.
- [ ] Codex has project-scoped access to the official shadcn MCP server.
- [ ] App and React Flow adapter code cannot import Base UI, cmdk, Lucide, or `@project/ui` internals directly.
- [ ] `stories/components` contains only real production components.
- [ ] `stories/surfaces` contains real production compositions.
- [ ] `stories/review` is the only home for proposal-only UI.
- [ ] `stories/support` contains no product visual facsimiles.
- [ ] A custom replacement for existing shadcn/Base UI behavior requires an explicit documented deviation.
- [ ] Every meaningful stable-story claim is verified both through the rendered Ladle story and through the real application composition (ADR 0052).
- [ ] A deterministic parity inventory maps every meaningful stable-story claim to both its Ladle behavior test and its corresponding application behavior test, and `pnpm ui:catalog:check` rejects missing or stale mappings (ADR 0052).
- [ ] `pnpm ui:catalog` prints the resolved story, claim, Ladle evidence and application evidence matrix for review.
- [ ] Each Playwright suite validates at runtime that every expected parity test was collected once and passed without a flaky retry.
- [ ] Ladle E2E runs as its own required CI job, and CI fails when any Playwright test is flaky even if a diagnostic retry passes.

## Audit note

`ui:catalog:check` currently proves public-export reachability and story
taxonomy. It does not prove that every meaningful production state has a story
or detect a product visual facsimile under `stories/support`; the missing states
recorded in issues 02–07 pass it today. Close this ticket only when those limits
and ADR 0052's dual-verification traceability are enforced by the deterministic
parity inventory. ADR 0052 owns the durable production-parity rule and rationale;
this ticket owns its implementation and enforcement.

## Answer

Parity is inventoried as explicit named behavioral claims rather than story
files or exports alone. A meaningful claim is any product-significant state,
semantic, geometry, accessibility contract or interaction that justifies a
stable story's presence. Every named export under `stories/components` and
`stories/surfaces` must have at least one claim; `stories/review` is excluded.

The checked-in source of truth is a literal TypeScript manifest. Each row holds
a stable semantic kebab-case claim id, a story file and named export, and a
concise human-readable claim. It contains no helpers or derived entries. Tests
refer to claims through literal native Playwright tags of the form
`@parity:<claim-id>`. Each claim has exactly one tagged Ladle test and exactly
one tagged application test; one test may carry several tags when it genuinely
proves several claims.

Enforcement has two layers. `pnpm ui:catalog:check` enumerates stable story
exports, validates every manifest story reference, requires a non-empty claim
set per export, rejects duplicate or unknown claim ids and tags, and rejects
missing, stale, review-only or obviously excluded evidence. `pnpm ui:catalog`
prints the resolved matrix. Human review remains responsible for whether the
declared claim set is semantically complete.

Each Playwright suite also validates at runtime that every expected tagged
logical test was collected once and passed. Skipped, excluded and flaky tests
are not evidence. Retries may remain to gather diagnostics, but CI fails if any
Playwright test needed one. This is repository-wide rather than parity-only.

`pnpm verify` retains the static gate. Application and Ladle E2E remain separate
runtime commands, with Ladle E2E added as its own parallel required CI job. The
manifest, complete evidence backfill, static checker, runtime validation and CI
job land coherently: there is no grandfather list. A stable state without both
proofs moves to `review` or is removed.

## Comments

### 2026-08-19 — the CI job moves to Issue 15

The criterion "Ladle E2E runs as its own required CI job" is now owned by
[Issue 15](15-run-the-ladle-parity-suite-in-ci.md), which is blocked by nothing.
This ticket is blocked by 03, 04, 05, 06, 07, 11 and 14 — every one of which is
required to land a stable story and its Ladle behaviour test — so holding the job
here means six tickets' worth of parity evidence accumulates before anything
executes any of it.

What stays here is unchanged: the parity inventory, the `@parity:<id>` tags, the
runtime collection validation, and `ui:catalog:check`'s traceability
enforcement. Issue 15 delivers only the job that runs the suite, so the
"land coherently, no grandfather list" rule above still governs the manifest and
the checker — it just no longer has to wait for a workflow file.

One correction to carry: the retry half of the criterion assumed a diagnostic
retry exists. `playwright.ladle.config.ts` sets `retries: 0`, so there is nothing
for `failOnFlakyTests` to change. Issue 15 settles which of the two shapes both
suites use.
