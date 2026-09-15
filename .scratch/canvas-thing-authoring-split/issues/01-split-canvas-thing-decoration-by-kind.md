# 01 — Split canvas Thing decoration by kind

Status: resolved

**What to build:** `useCanvasThingAuthoring` stops owning one monolithic node map. Pure decorate functions — shared, markdown, and space — patch each Thing's projection data; the hook keeps caret, session subscription, completions, and effects. Unrelated session edits must not rebuild every node’s `data` when a kind’s inputs did not change — extending the merged drag-performance work at the authoring seam. Host canvas and embedded Diagram paths share the same decorators; Alias stays on the shared pass only.

**Blocked by:** None — can start immediately.

- [x] `canvas-thing-decoration.ts` (or equivalent) exports `decorateSharedThingNode`, `decorateMarkdownThingNode`, and `decorateSpaceThingNode` taking `(node, CanvasThingDecorationContext)` and returning partial `node.data` patches; the hook merges patches in one map.
- [x] The hook retains caret, context notice/editing state, open/close/body/title/space completions, and reporting effects; completions stay callable from context rather than moving into decorators.
- [x] Space decoration owns target lookup, `buildSpaceThingRail`, `contextNotice`, and `portal`; markdown decoration owns body-editor attachment; shared decoration owns open/close, resize, title editor, and entity actions.
- [x] Decoration memo dependencies are trimmed to what decorators actually read; add tests that unchanged kinds keep stable `node.data` references when only another kind’s inputs change (where the rules allow).
- [x] Pure decorator unit tests cover kind-specific rules; existing `canvas-thing-authoring` integration tests stay green.
- [x] `pnpm verify` passes; Space Thing embedded-diagram and drag-alignment proofs stay green.
