# 04 — Controlled `GraphView` + drag write-back

Status: open
Type: task
Blocked by: 03

The first ticket that changes behaviour, and the one the spike is the reference
for. `GraphView` currently gets away with no `onNodesChange` **because**
`nodesDraggable={false}` means nothing can move; flipping that owes React Flow
the change handler.

- `nodesDraggable={kind === 'positioned'}`. No edit mode, no flag — the layout
  kind is the whole rule (ADR 0013).
- `onNodesChange` → `applyNodeChanges`, with position changes written back into
  the active layout's map. Write on drag **end**, not on every intermediate
  position change; 06 persists on the same signal.
- The store owns the map. `App.tsx` currently re-derives `nodes` through a
  `useMemo` chain off `laidOut`, which will stamp on a drag if the map is not the
  source those positions come from.

Read `packages/app/.scratch/spike/SpikeGraph.tsx` and
`.scratch/graph-editing/README.md` §"Two runtime loops" first. Both bugs live in
exactly this code and neither is in React Flow's docs:

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

- e2e: drag a card in a positioned view, it stays where dropped and edges follow;
  drag in an automatic view does nothing.
- No console errors during or after a drag — assert it, since both spike bugs
  surfaced only as runtime errors.
- `pnpm verify` and `pnpm e2e` green.
