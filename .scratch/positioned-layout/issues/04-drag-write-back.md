# 04 — Controlled `GraphView` + drag write-back

Status: open
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
