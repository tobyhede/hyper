# 09: First Open Size is answered from resolved content

**What to build:** The image arm of `ResourceContent` carries the Image Resource's recorded `naturalSize`, and `resource-content.ts` gains `firstOpenSize(content): Extent` from the same table. `SnapshotEdit.open` resolves the opening Resource's content and asks it; `openSizeDocument` and `firstOpenSize`'s own kind cascade in `graph/src/snapshot-edits.ts:386-419` are deleted. Resolution in `snapshot-edits` uses the same single-hop rule as `resolveResourceContent` rather than a second hand-written one.

**Behaviour change (ADR 0114):** a Reference Resource to a Space Resource first Opens at `DEFAULT_SPACE_RESOURCE_OPEN_SIZE`, not `DEFAULT_OPEN_SIZE`. A Reference Resource to an Ur Resource or a Markdown Resource is unchanged, and a Reference Resource to an Image Resource still reads its Target's natural size synchronously (ADR 0106).

**Blocked by:** 08

**Status:** resolved

- [x] A `snapshot-edits` property test proves a Reference Resource first Opens at exactly the size its Target would, for every Target kind. Its Space case fails before this change.
- [x] `openSizeDocument` is gone, and nothing in `graph` decides Open Size from a stored `kind`.
- [x] Any existing test that asserted the default size for a Reference to a Space is flipped, and the flip is named in this ticket's Comments.
- [x] CI passed on the draft PR.

## Comments

2026-10-03: Image content carries recorded naturalSize. SnapshotEdit.open and loaded-Space resolution share one single-hop resolver; graph no longer decides first Open Size by kind. The new property failed before the change for a Space Target (Reference 560×420, Target 960×720), then passed for every Target kind. No existing Reference-to-Space default-size assertion existed to flip; image sizing tests remain unchanged.

Implementation complete; independent review and the draft PR CI gate are pending. Status remains ready-for-agent until those checks pass.

2026-10-03 verification: independent Standards and Spec reviews of `1e936ac0...ee8529aa` found no defects. Watched [CI run 37109080025](https://github.com/tobyhede/hyper/actions/runs/37109080025) finish with `CI passed` green for implementation commit `ee8529aa`: static-checks, coverage, all three e2e shards, ladle, postgres and sqlite passed. Coverage exercises the core/graph/projection/application seams; e2e and ladle exercise the Resource surfaces; database jobs include the restart proofs.

Local checks passed: `pnpm typecheck:toolchain`, `pnpm typecheck`, `pnpm typecheck:packages`, changed-file ESLint and oxlint, `pnpm ui:catalog:check`, targeted Vitest files (49 core/graph, 92 adapter, 99 UI and 186 application tests), and both existing `open-reference-shows-target-markdown-read-only` Playwright parity proofs. The application proof used `HYPER_E2E_PORT_BASE=62000` because port 5300 was occupied. An earlier Ladle attempt timed out during machine contention; the isolated rerun passed. Full local verify/e2e/Ladle/database suites were intentionally left to CI under AGENTS.md.

## Answer

Implemented and verified on draft PR #334. All acceptance criteria are satisfied; ticket 07 remains out of scope.
