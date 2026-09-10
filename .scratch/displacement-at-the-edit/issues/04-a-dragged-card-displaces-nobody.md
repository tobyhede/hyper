# 04 — A dragged Card displaces nobody

Status: resolved
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
- [x] The `resize` arm keeps the Card's proposed rect for the live preview and no
      longer layers a Placement its neighbours are drawn from. If nothing outside
      the resizing Card reads the draft's placement, the field goes too.
- [ ] `App.tsx:578` and `EmbeddedLayoutAuthoring.tsx:69` read the authored
      placement directly wherever the draft no longer answers for neighbours.
- [x] `settled-card-movement` authors the drop point exactly. `reconcile`'s
      "an active drag alone keeps its live position" rule is untouched and is now
      the only thing standing between a projection and a dragged node.
- [ ] `packages/app/test/render-adapter.test.ts` loses the `move` draft describe
      block and keeps the resize, Layout-invalidation and epoch-reset coverage.
- [x] `docs/agents/rendering.md`'s "there are two drafts now and they invalidate
      in different places" paragraph is rewritten for the one that remains.

The e2e test `dragging an Open Card displaces its neighbours before release, not
after` is superseded by `05` and should be removed rather than adjusted: it
asserts a preview of a derivation that no longer exists.

## Answer

**Three of this ticket's six boxes describe a tree that does not exist, and they are left
unchecked rather than quietly ticked.**

`InteractionDraft` has no `move` arm, `moveDraft` is not in the source and never was
(`git log -S moveDraft -- packages/app/src` is empty), and the e2e test
`dragging an Open Card displaces its neighbours before release, not after` is not in
`packages/app/e2e/`. The render adapter has exactly one draft, `resizeDraft`. The ticket was
written against `.scratch/expanded-cards/issues/06`, whose preview fix it assumed had landed;
that ticket does not exist either (see `07`). So there was nothing to delete, and
`render-adapter.test.ts` has no `move` draft describe block to lose.

**What was real, and is done:**

The resize draft stopped layering a Placement its neighbours are drawn from the moment ticket
01 deleted `Placement.drawn`. `previewResize` builds `Placement.place(draft.placement, cardId,
{ ...at, openSize: proposedSize })` — the authored placement with the subject's own rect
replaced — and `positionedStrategy` now reads that map as it stands, so the neighbours are
drawn at their authored coordinates for the whole gesture and move only when the Edit lands.
That is exactly the preview ADR 0084 asks for.

**The `placement` field therefore stays**, and this ticket's "if nothing outside the resizing
Card reads the draft's placement, the field goes too" resolves the other way: it is read by
`App.tsx:671` and `EmbeddedLayoutAuthoring.tsx:69` as the input to `usePlacementRendering`,
which is how the subject's own proposed rect reaches the canvas at all. Both call sites are
correct unchanged — they never answered for neighbours once the derivation was gone.

`render-adapter.test.ts`'s resize case already asserted the neighbour staying put; only its
name was stale (it said "through a derived Placement"). Renamed to
`previews the resizing Card and nobody else, and completes only its final size`, with a comment
tying it to ADR 0084 and stating the negative — this is what stops a `move` draft being
reacquired.

`settled-card-movement` authors the drop point exactly, via ticket 01's change to
`Placement.next`. `reconcile`'s "an active drag alone keeps its live position" rule is
untouched and is now the only thing standing between a projection and a dragged node.

`docs/agents/rendering.md` is rewritten for the one draft that remains, and carries both
negatives: do not reintroduce a draft that republishes a Card's neighbours, and do not add a
`move` draft.

**Beyond the ticket.** Three documents described the derived model and none was listed here or
anywhere else in this effort: `CONTEXT.md`'s Placement entry defined displacement as derived
and never part of the placement; `AGENTS.md`'s ADR 0064 entry carried the reversed sentence;
and its ADR 0066 entry said the draft "previews the Card, displaced neighbours, handles and
Edges atomically". All three are corrected, and `AGENTS.md` gained an ADR 0084 entry carrying
the negatives a future session would otherwise re-suggest.
