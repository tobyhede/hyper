# After conversion, the Layout is what renders

Status: resolved
Type: task
Blocked by: 12
Prerequisite for: ADR 0021

## Problem Statement

After an Algorithmic View is edited, the app creates a Positioned Layout from
the card positions already on screen. However, `App` still runs the Algorithmic
View's layout strategy whenever the visible graph changes. Existing cards happen
to retain their live coordinates during reconciliation, but a newly projected
card takes coordinates from a fresh algorithmic computation over a graph whose
other cards no longer occupy those computed positions.

Graph structure cannot change in the current UI, so the defect is dormant. It
becomes visible as soon as ADR 0021 adds card creation, deletion, or connection.
Re-running the Algorithmic View after conversion violates ADR 0025: conversion
ends computed placement, and subsequent edits must operate on the authored
Layout without moving the existing cards.

## Solution

While an Algorithmic View remains unedited, render its visible graph with that
View's layout strategy. As soon as authored positions exist, render the current
and every subsequent visible graph through `positionedStrategy` using those
positions. A graph change after conversion must never invoke the former
Algorithmic View's strategy.

Issue 13 establishes this rendering rule and its regression seam without adding
the structural authoring gestures owned by ADR 0021. The future creation gesture
will add the new card's drop point to the authored positions; this ticket proves
that such a position is respected rather than replaced by algorithmic output.

## User Stories

1. As an author, I want the cards I have positioned to stay where I put them when the graph changes, so that editing remains predictable.
2. As an author, I want editing an Algorithmic View to end computed placement, so that later changes do not silently reapply an obsolete rule.
3. As an author, I want a newly created card to appear at the position supplied by my creation gesture, so that the drop point remains meaningful.
4. As an author, I want conversion itself to remain visually unchanged, so that the edit I made is the only visible movement.
5. As an author opening an unedited Algorithmic View, I want its selected layout strategy to continue positioning the cards, so that read-only navigation retains the chosen View.
6. As a future ADR 0021 implementer, I want a regression seam for changed graphs after conversion, so that structural editing can build on a fixed rendering rule.

## Implementation Decisions

- Strategy selection remains in the application composition layer because it
  combines the selected View with editor-owned authored positions.
- Null authored positions mean the Algorithmic View still renders through its
  selected layout strategy.
- Non-null authored positions mean the current graph renders through
  `positionedStrategy`, including when the map is sparse.
- The app observes authored-position changes so the first completed edit cancels
  any stale algorithmic computation and changes the rendering strategy
  immediately.
- The editor store remains the single owner of live React Flow nodes and authored
  positions. It does not gain knowledge of Views or layout strategies.
- Existing node reconciliation continues to preserve React Flow runtime state,
  including live coordinates, dimensions, selection, and drag state.
- Positioned rendering applies uniformly to every layout strategy. No behavior
  may depend specifically on ELK.
- A changed graph is simulated at the strategy seam in this ticket. Real
  create/delete/connect interactions remain owned by ADR 0021.
- Persistence behavior is unchanged. Completed edits continue to submit the
  Positioned Layout through the existing session flow.

## Testing Decisions

- Test at the App-level rendering-strategy seam, the highest existing boundary
  that can accept both a selected Algorithmic View and editor-authored positions.
- Use real `LayoutGraph` values and real layout strategies. Do not mock internal
  app, graph, or editor modules.
- Prove the red condition with an Algorithmic View strategy that places a changed
  graph differently from the authored Layout.
- Prove that null authored positions use the Algorithmic View strategy.
- Prove that non-null authored positions use positioned rendering on a changed
  graph, preserve existing authored coordinates, and respect the supplied
  coordinate for a simulated new card.
- Prove that the former Algorithmic View is not invoked after conversion by
  observing only the resulting card positions, not collaborator call counts.
- Follow the existing app strategy tests and editor-store tests as prior art.
- Run the focused test during each red-green cycle, then the repository's full
  verification and end-to-end suites because this changes graph rendering.

## Out of Scope

- Card creation, deletion, or connection gestures from ADR 0021.
- A mutable Space or graph-authoring store.
- The toolbar View/Layout selector from issue 16.
- Removing the prototype Auto-arrange button or `ResolvedView.automatic`.
- Changing persistence schemas, session behavior, or PostgreSQL adapters.
- Recording provenance from a Positioned Layout to an Algorithmic View.

## Further Notes

ADR 0025 explicitly rejects re-running a layout strategy after the edit rather
than before it. This ticket is the prerequisite that prevents ADR 0021 from
reviving that failure when graph structure first becomes editable.

## Answer

Shipped in `9c0e1e7`, `47b002e`, and `a8dafc0`. `App` now derives its rendering
strategy from the editor's authored positions: an unedited Algorithmic View uses
its selected automatic strategy, while a converted view uses
`positionedStrategy`. Layout results are guarded by both graph and strategy, and
obsolete asynchronous results cannot replace the current rendering.

Auto-arrange keeps the automatic result's valid port offsets and routed edge
sections while that exact graph remains visible. A card move still suppresses
that routing, and any later graph identity renders from the authored Layout. The
changed-graph regression supplies a future card position directly, establishing
the seam ADR 0021's creation gesture will use without implementing that gesture.

Verification on the completed code: `pnpm verify` passed 37 test files and 323
tests; `pnpm e2e` passed all 32 browser tests. The focused rendering-strategy
suite passed 4 tests, and the Auto-arrange lifecycle browser test passed.
