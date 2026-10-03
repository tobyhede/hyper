# 10: Resize floor and Map embedding reach the node as answers

**What to build:** `resource-content.ts` gains `openSizeFloor(content): Extent` and `embedsMap(content): boolean`. The projection, which already resolves each Resource's content, publishes both on `ResourceNodeData` for every Resource, Closed included, because a Closed display carries no content (ADR 0070). `canvas-resource-decoration.ts:184` takes the resize floor from the node, and `reportsBodyHeight` (`embedded-open-space-resource.ts:171`) reads `embedsMap` from the node. After this, the node's `kind` is read only for the glyph.

**Behaviour change (ADR 0114):** a Reference Resource to a Space Resource has `SPACE_RESOURCE_MIN_OPEN_SIZE` as its resize floor. Only a Reference Resource whose Target embeds a Map reports its body height; a Reference to Markdown, Image or Ur no longer does.

**Blocked by:** 08

**Status:** resolved

- [x] `core` property test: `embedsMap` and `openSizeFloor` are independent of `via`.
- [x] A projection test proves a Reference Resource to a Space Resource publishes the Space floor and `embedsMap: true`, and a Reference to Markdown publishes neither. This replaces the decoration test's hand-built `kind: 'space'` floor case.
- [x] No source site reads `node.data.kind` for anything but the glyph.
- [x] CI passed on the draft PR.

## Comments

2026-10-03: Projection publishes openSizeFloor and embedsMap for Closed and Open nodes. Resize consumes the projected floor; body-height reporting consumes embedsMap. Projection tests cover Space and Markdown References, and the decoration floor case now uses a real Reference-to-Space projection. The Closed Reference non-Map body-height regression failed before migration and passes afterward. Rendering discriminants remain in frontOf as explicitly scoped; semantic node-kind policy checks are removed.

Implementation complete; independent review and the draft PR CI gate are pending. Status remains ready-for-agent until those checks pass.

2026-10-03 verification: independent Standards and Spec reviews of `1e936ac0...ee8529aa` found no defects. Watched [CI run 37109080025](https://github.com/tobyhede/hyper/actions/runs/37109080025) finish with `CI passed` green for implementation commit `ee8529aa`: static-checks, coverage, all three e2e shards, ladle, postgres and sqlite passed. Coverage exercises the core/graph/projection/application seams; e2e and ladle exercise the Resource surfaces; database jobs include the restart proofs.

Local checks passed: `pnpm typecheck:toolchain`, `pnpm typecheck`, `pnpm typecheck:packages`, changed-file ESLint and oxlint, `pnpm ui:catalog:check`, targeted Vitest files (49 core/graph, 92 adapter, 99 UI and 186 application tests), and both existing `open-reference-shows-target-markdown-read-only` Playwright parity proofs. The application proof used `HYPER_E2E_PORT_BASE=62000` because port 5300 was occupied. An earlier Ladle attempt timed out during machine contention; the isolated rerun passed. Full local verify/e2e/Ladle/database suites were intentionally left to CI under AGENTS.md.

## Answer

Implemented and verified on draft PR #334. All acceptance criteria are satisfied; ticket 07 remains out of scope.
