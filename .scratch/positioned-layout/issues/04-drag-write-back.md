# 04 — Controlled `GraphView` + drag write-back

Status: resolved
Tags: release/v1
Type: task
Blocked by: 03

The first ticket that changes behaviour. `GraphView` currently gets away with no
`onNodesChange` **because**
`nodesDraggable={false}` means nothing can move; flipping that owes React Flow
the change handler.

This ticket now also **creates the Layout** (ADR 0017): a space carrying none
gets one from the first layout result, so the fixture is editable on open and
Auto-arrange is no longer a gate. That is what makes this ticket runnable against
the fixture without any space-loading or addressing work first.

- The Layout cannot be created during view resolution — a strategy is async and
  consumes a built layout graph, and neither exists there. Create it from the
  first resolved layout, which means a space is not draggable for the frame
  before its layout lands. Same window `layoutReady` already gates the fit on.
- `nodesDraggable` is whether the view has a Layout. No edit mode, no flag (ADR
  0013). After creation that is true for every space, so what this really gates
  is the first frame — and, later, a reading view switched to deliberately.
- `onNodesChange` → `applyNodeChanges`, with position changes written back into
  the active Layout's map. Write on drag **end**, not on every intermediate
  position change; 06 persists on the same signal.
- The store owns the map. `App.tsx` currently re-derives `nodes` through a
  `useMemo` chain off `laidOut`, which will stamp on a drag if the map is not the
  source those positions come from. The spike's answer was one Zustand store
  owning both the node array and the structure; that shape is the reference.
- The created Layout is **ephemeral** — nothing writes it, so a reload loses the
  arrangement until 06. Say so in the ticket that ships it rather than letting it
  read as a bug.

Two runtime loops the spike hit, both living in exactly this code and neither in
React Flow's docs. The spike harness is gitignored and not kept, so they are
written out here rather than pointed at — see also `.scratch/graph-editing/`
§"Two runtime loops":

1. A subscription returning a fresh object every render rebuilds the `nodes`
   array every render, and feeding a per-render-new array to a controlled
   `<ReactFlow>` loops its node-sync effect (`Maximum update depth exceeded`).
   Subscribe to primitive slices.
2. React Flow reports `dimensions` changes for nodes it measures;
   `applyNodeChanges` returns a fresh array every time, so a change for a node
   the store does not own re-syncs and re-measures forever. Drop changes for
   unowned ids and return no update when nothing real changed.

Not in play here: `useUpdateNodeInternals`. Dragging does not change a card's
handle count, so the exposure AGENTS.md documents stays dormant. Structural
editing wakes it; this ticket does not.

## Acceptance

- e2e, against the fixture: drag a card, it stays where dropped and its edges
  follow. It does not spring back, and no other card moves — nothing reshuffles,
  which is the whole point of the pivot.
- No console errors during or after a drag — assert it, since both spike bugs
  surfaced only as runtime errors.
- `pnpm verify` and `pnpm e2e` green.

## Answer

`packages/app/src/editor.ts` — a Zustand store owning React Flow's `nodes` array
and the Layout's placement map, with `reconcile` and the owned-id filter promoted
from the spike.

Two representations of position, deliberately. The node array is React Flow's
runtime and has to absorb every intermediate frame or the card will not follow
the cursor in a controlled flow; the map is the domain value, written only on the
change carrying `dragging: false`. So what persists is a placement, not a
gesture.

The Layout is created in `syncNodes` on the first call, from the resolved
layout's own positions (ADR 0017). That is why `nodes` starts `null` rather than
`[]` — the null is what distinguishes "no layout yet" from "a space with no
cards", and `editable` reads it directly.

One thing the ticket did not anticipate: **ELK's routed edge geometry goes stale
the moment a card moves.** It describes the arrangement ELK computed, so a card
dragged out of it leaves edges anchored to where it used to be. A `moved` flag
now drops `layoutGraph` from `projectRouteEdges` after the first real move, and
edges fall back to plain curves between wherever the cards are — which is what a
positioned view draws anyway, since it routes nothing. Before the first move the
fixture keeps ELK's routing exactly as it had it, so the existing e2e assertion
is untouched.

Three mutations confirmed the unit tests bite, one test each: dropping
`reconcile`'s preservation of the live node kills the re-sync test; dropping the
stable-reference early return kills the unowned-change test; recording every
position change instead of only settled ones kills the mid-drag test.

The e2e needed a `settled()` helper, and the first version of it was wrong in a
way worth recording: it compared two reads of the viewport transform sampled in
the same tick, so it reported "stable" immediately, every time, mid-`fitView`.
The drag then began before the animation finished, `boundingBox()` was stale, and
mousedown landed beside the card — which fails looking exactly like dragging
being broken. The reads have to straddle a real gap.

`pnpm verify` green — 144 tests (10 new). `pnpm e2e` green — 18, the original 16
unchanged plus 2. No React Flow warnings: the auto-use gate in `e2e/fixtures.ts`
fails a test on any, so "no console errors during or after a drag" is asserted
rather than observed.

Not done here, and honest about it: the created Layout is **ephemeral**. Nothing
writes it, so a reload loses the arrangement until ticket 06.
