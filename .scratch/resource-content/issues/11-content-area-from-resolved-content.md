# 11: Whether an Open front draws a content area is answered from resolved content

**What to build:** `resource-content.ts` gains `drawsContentArea(content): boolean`. `CanvasResource` sets `data-content-area` from it, read off the display while Open and through the exit fade, and the rule at `canvas-resource.css:306` keys on that attribute rather than listing `data-kind` values no compiler sees. `useAreaContent`'s `space`/`ur` → `null` arms agree with it by construction, or ask it.

`PresentedResource` is out of scope: what a presented Space Resource draws is undecided (07), and this ticket does not decide it.

**Behaviour change (ADR 0114):** an Open Reference Resource to a Space Resource or an Ur Resource lays out its Title as its Target does, without the content-area ordering.

**Blocked by:** 08

**Status:** resolved

- [x] A `CanvasResource` test proves an Open Reference Resource to an Ur Resource has no `data-content-area`, and one to a Markdown Resource has it.
- [x] No stylesheet selects on a `data-kind` list to decide content-area layout.
- [x] The Ladle story and application proof for the Resource front still hold (ADR 0052), and `pnpm ui:catalog:check` passes.
- [x] CI passed on the draft PR.

## Comments

2026-10-03: CanvasResource publishes data-content-area from resolved content and retains it through the Close fade; CSS keys on that answer. A Reference-to-Ur/Markdown/fade regression failed before the change and passes afterward. PresentedResource behavior and rendering switches remain unchanged; image fixtures only gain the required naturalSize key.

Implementation complete; independent review and the draft PR CI gate are pending. Status remains ready-for-agent until those checks pass.

2026-10-03 verification: independent Standards and Spec reviews of `1e936ac0...ee8529aa` found no defects. Watched [CI run 37109080025](https://github.com/tobyhede/hyper/actions/runs/37109080025) finish with `CI passed` green for implementation commit `ee8529aa`: static-checks, coverage, all three e2e shards, ladle, postgres and sqlite passed. Coverage exercises the core/graph/projection/application seams; e2e and ladle exercise the Resource surfaces; database jobs include the restart proofs.

Local checks passed: `pnpm typecheck:toolchain`, `pnpm typecheck`, `pnpm typecheck:packages`, changed-file ESLint and oxlint, `pnpm ui:catalog:check`, targeted Vitest files (49 core/graph, 92 adapter, 99 UI and 186 application tests), and both existing `open-reference-shows-target-markdown-read-only` Playwright parity proofs. The application proof used `HYPER_E2E_PORT_BASE=62000` because port 5300 was occupied. An earlier Ladle attempt timed out during machine contention; the isolated rerun passed. Full local verify/e2e/Ladle/database suites were intentionally left to CI under AGENTS.md.

## Answer

Implemented and verified on draft PR #334. All acceptance criteria are satisfied; ticket 07 remains out of scope.
