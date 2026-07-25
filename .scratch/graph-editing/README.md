# Graph editing — spike

Throwaway spike (delete before any merge). It exists to answer one thing **by
feel**: with ELK owning placement, does editing the graph via React Flow's
add-node-on-edge-drop read well, and does a **landing preview** tame the
re-layout?

## Run

The dev server serves it at a second page (it is not part of the app build):

```
pnpm dev            # if not already running
open http://localhost:5173/spike.html
```

Files: `packages/app/spike.html` (dev-only entry) + `packages/app/.scratch/spike/`
(the TS — under `.scratch/` so it is outside tsc/eslint; it does **not** affect
`pnpm verify`).

## What it does (increment 4 — the pivot to a manual layout)

The earlier increments proved ELK is the wrong tool for editing (a global
optimiser can't honour local placement — it reshuffles, and the new card lands
"randomly"). So editing is now a **manual ("Positioned") layout**: a
`card -> {x,y}` map the user authors, which is exactly the "hand-placed" layout
kind CONTEXT.md already names. Positions are a property of the *layout*, not the
card.

- Seeds `A → B → C` on route `r1` at hand-set coordinates.
- Every card carries a generic **edit handle on each edge** (faint, brightening on
  hover) — drag off one to author structure. The per-route render handles stay as
  inert coloured dots.
- **Drag a card body** → React Flow's own drag writes its new coordinate into the
  map (`onNodesChange`); it stays exactly where you drop it. No re-layout.
- **Drag off an edit handle, drop on empty canvas** → a new card appended (off a
  route's last card) or branched (off a mid-route card), placed **at the drop
  point** and left there. A cursor-following ghost previews it.
- **Auto-arrange (ELK)** — the one-shot button runs the real `elkLayout` and
  writes its computed positions *into the same map*, then you keep editing. ELK is
  demoted from "the layout" to "a layout / a command" (ADR 0002/0005).
- Positions live in component state (persistence deferred). Edges stay derived
  from routes (ADR 0007).

Pipeline held to: React Flow gesture → Route edit → render, edges stay derived
(ADR 0007). React Flow never owns an edge or a node; it is the input device.

## What it skips

Copy / alias / detached-card commands, connect-to-existing, insert, delete; card
content and metadata; persistence (positions in component state); nice edge
routing in manual mode (plain beziers, since Auto-arrange pulls only ELK's card
positions). The full surface is `commands.md`.

## Findings

1. **ELK is the wrong tool for editing.** Increments 1–3 tried to make ELK's
   auto-layout serve interactive editing (append, then branch, then
   interactive/seeded ELK). Every version reshuffled existing cards and placed the
   new one by global optimisation, so it felt random — a global optimiser can't
   honour "put it *here*."
2. **Editing is a manual (Positioned) layout.** Increment 4 pivoted: positions are
   a `card -> {x,y}` map the user authors (the "hand-placed" kind CONTEXT.md
   already names). Drag places and holds; a new card lands at the drop and stays;
   nothing reshuffles. Direct manipulation — **validated**.
3. **ELK becomes a command / view.** "Auto-arrange" runs `elkLayout` once *into*
   the map; the ELK linear view is one layout to switch to for reading. Positions
   are a property of the layout, not the card.

Next: productionize the Positioned layout (real `Layout` seam + where the map
persists → an ADR), or spike more commands. See `commands.md` Status.

## Increment 6 — React-Flow-idiomatic rebuild (review + rebuild)

Increment 5 worked but fought React Flow's grain (a re-derived controlled node
list, a module-level singleton to reach a node, a manual `document` pointer
listener, `nodeOrigin=[0.5,0.5]` with hand-compensated `+size/2`, a `.react-flow__node`
transform transition). Four agents reviewed it against React Flow's own docs
(`reactflow.dev/llms-full.txt`, source cited). Verdict: **salvageable, not a
restart** — the core (controlled flow, `reconcile` preserving measured/position,
module-const node/edge types, `useUpdateNodeInternals` on handle topology, unique
handle ids, inline-`top` handles) was already doc-correct. The rebuild applied the
review's simplifications:

- **One Zustand store** owns the single `nodes` array (RF's runtime) *and* the
  `draft` (structure). Structural edits are store actions that re-fold the derived
  half into the same array — no second reconciled list, no effect copying source to
  source, no module singleton. (RF state-management guide's "use Zustand".)
- **Native top-left origin.** Dropped `nodeOrigin`; ELK's top-left coords map
  straight onto positions (no `+size/2`). The adapter's `projectCardNodes` now
  carries `LayoutCard.width/height` through instead of dropping them (the "honest
  home" — verified safe for the read-only app: `pnpm verify` 89 tests + `pnpm e2e`
  16 tests green).
- **Connection lifecycle = the official example's shape.** `onConnectEnd(event,
  connectionState)` alone; the ghost is driven by `useConnection`, not a manual
  listener. `fitView({ duration })` replaced the CSS transform transition.

### Two runtime loops the doc-review missed (found only in the browser)

Overlaying a transient ghost node into a **controlled** `nodes` array is where RF's
`StoreUpdater` bites — both surfaced as `Maximum update depth exceeded`, neither is
in the docs:

1. **`useConnection()` (no selector) returns a fresh `ConnectionState` every
   render** → `nodesForFlow` rebuilt every render → controlled-node sync loops.
   Fix: subscribe to a **primitive** slice (`"x:y"` string), stable between pointer
   moves.
2. **RF measures the ghost and reports a `dimensions` change for it through
   `onNodesChange`** → `applyNodeChanges` always returns a fresh array → re-sync →
   re-measure, forever. Fix: `changeNodes` drops changes whose id the store doesn't
   own, returning no update when nothing real changed.

Both confirm the state-ownership reviewer's flag that the docs carry no
"max-update-depth" guidance: overlaying an unowned, measured node into a controlled
array is the real-world trigger.

### Verified in-browser (dev server, page loaded only — server untouched)

Clean first paint at seed positions (no slide-in); drag + snap + edges follow +
selection + `NodeToolbar`; auto-arrange (ELK → `arrange` → `fitView`, no offset);
delete via toolbar (store action) and via keyboard; add-node-on-edge-drop creates
the card + a branch route with a new handle registered (no #008) and no crash. No
console errors after the two fixes.
