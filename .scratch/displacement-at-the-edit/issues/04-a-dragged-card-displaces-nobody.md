# 04 — A dragged Card displaces nobody

Status: ready-for-agent
Blocked by: 01

**What to build:** Remove the render adapter's `move` interaction draft and stop
the resize draft republishing its neighbours. Drag is React Flow's default
(ADR 0084).

**Why:** Both drafts exist to put a *derived* geometry on screen during a
gesture. With the derivation gone there is nothing to preview but the Card's own
rect: a dragged Card's neighbours do not depend on it, and a resizing Card's
neighbours do not move until the Edit lands.

- [ ] `InteractionDraft` loses its `move` arm and `moveDraft` is deleted.
      `changeNodes` publishes nodes, drag bookkeeping and selection, and mints no
      draft.
- [ ] The `resize` arm keeps the Card's proposed rect for the live preview and no
      longer layers a Placement its neighbours are drawn from. If nothing outside
      the resizing Card reads the draft's placement, the field goes too.
- [ ] `App.tsx:578` and `EmbeddedLayoutAuthoring.tsx:69` read the authored
      placement directly wherever the draft no longer answers for neighbours.
- [ ] `settled-card-movement` authors the drop point exactly. `reconcile`'s
      "an active drag alone keeps its live position" rule is untouched and is now
      the only thing standing between a projection and a dragged node.
- [ ] `packages/app/test/render-adapter.test.ts` loses the `move` draft describe
      block and keeps the resize, Layout-invalidation and epoch-reset coverage.
- [ ] `docs/agents/rendering.md`'s "there are two drafts now and they invalidate
      in different places" paragraph is rewritten for the one that remains.

The e2e test `dragging an Open Card displaces its neighbours before release, not
after` is superseded by `05` and should be removed rather than adjusted: it
asserts a preview of a derivation that no longer exists.
