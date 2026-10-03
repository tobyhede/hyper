# 08: Content action is answered from resolved content

**What to build:** `core`'s `resource-content.ts` gains `contentAction(content: ResourceContent): 'none' | 'edit-markdown' | 'replace-image' | 'author-space-view'`, answered from one private table that `satisfies Record<ResourceContent['kind'], …>`, and `'none'` whenever `via` is `'reference'` (ADR 0113, ADR 0114). Every site that restates "this content may be authored" asks it instead:

- `ui`'s `beginEditing` and `beginReplacing` (`resource-display.ts:61`, `:80`)
- `CanvasResource.tsx:336` (`contentFront`), `:338` (`spaceFront`) and `:358` (`contentAuthoring`)
- `react-flow-adapter`'s `ResourceNode.tsx` `frontOf`, for which arms carry `onBeginEdit`
- `app`'s `canvas-resource-decoration.ts:249`, `:255`, `:282` and `canvas-resource-authoring.ts:225-226`
- `embedded-open-space-resource.ts:206` (`via === 'reference'` read-only)

No behaviour changes. The rendering switches that draw each content shape (`frontOf`'s arms, `useAreaContent`, `PresentedContent`) stay as they are.

**Blocked by:** none (ADR 0114 and the `CONTEXT.md` **Content action** entry are recorded)

**Status:** resolved

- [x] A `core` property test over every `ResourceContent` arm and both `via` values proves `contentAction` answers `'none'` for every `via: 'reference'` and for `ur` and `unresolved`, and the kind's action otherwise.
- [x] No source site outside `resource-content.ts` names `'markdown' | 'image'` or reads `via` to decide whether content may be authored.
- [x] Existing Edit, Replace and embedded-Map authoring tests pass unchanged.
- [x] CI passed on the draft PR.

## Comments

2026-10-03: Built the core contentAction function over one exhaustive private content-facts table and migrated UI, adapter and application authoring decisions. Closed projections publish the action without carrying content. Core properties cover all valid kind/via combinations; existing display, replacement and embedded authoring tests remain green.

Implementation complete; independent review and the draft PR CI gate are pending. Status remains ready-for-agent until those checks pass.

2026-10-03 verification: independent Standards and Spec reviews of `1e936ac0...ee8529aa` found no defects. Watched [CI run 37109080025](https://github.com/tobyhede/hyper/actions/runs/37109080025) finish with `CI passed` green for implementation commit `ee8529aa`: static-checks, coverage, all three e2e shards, ladle, postgres and sqlite passed. Coverage exercises the core/graph/projection/application seams; e2e and ladle exercise the Resource surfaces; database jobs include the restart proofs.

Local checks passed: `pnpm typecheck:toolchain`, `pnpm typecheck`, `pnpm typecheck:packages`, changed-file ESLint and oxlint, `pnpm ui:catalog:check`, targeted Vitest files (49 core/graph, 92 adapter, 99 UI and 186 application tests), and both existing `open-reference-shows-target-markdown-read-only` Playwright parity proofs. The application proof used `HYPER_E2E_PORT_BASE=62000` because port 5300 was occupied. An earlier Ladle attempt timed out during machine contention; the isolated rerun passed. Full local verify/e2e/Ladle/database suites were intentionally left to CI under AGENTS.md.

## Answer

Implemented and verified on draft PR #334. All acceptance criteria are satisfied; ticket 07 remains out of scope.
