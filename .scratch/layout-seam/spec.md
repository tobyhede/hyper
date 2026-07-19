# Layout as a value

Source: `/improve-codebase-architecture` review, 2026-07-19 — candidate 3, the top recommendation.

## Problem

There is no Layout value in the code. `App.tsx` hand-builds the ELK input inline, runs the layout in a `useEffect` with a cancellation flag, and parks the result in local state. The handle id (`<pathId>::in|out`) is a stringly-typed handshake spanning three packages: minted in `@project/graph`, used as the ELK port id in `react-flow-adapter`, and re-used as the React Flow `<Handle id>` in `CardNode`. Three parallel handle types — `PathHandleRef`/`CardHandleSet`, `ElkHandle`/`ElkPortData`, `CardHandle`/`CardNodeData` — restate the same thing at three stages.

Worse, that port id is identical on every card a route passes through, so ELK cannot tell which card an edge attaches to. It mislays **even single-route** graphs: the bundled demo's "Main walkthrough" ships today with a backward-looping rail. See `.scratch/multiple-routes/findings.md`, Finding 1.

## Direction

One module owns arranging: `arrange(space, selection) -> Layout`. It builds card-unique port ids, runs ELK, and returns positioned cards plus resolved handle offsets. `GraphView` renders a Layout and nothing else.

This encodes ADR 0002 (a layout arranges, a view renders) in the code, and turns multi-route into a parameter rather than a rewrite.

## Constraints

- ADR 0002 — layout and view stay separate concepts.
- ADR 0003 — routes may conflict; a view must tolerate a cyclic combined step-order.
- React Flow and elkjs specifics stay inside `react-flow-adapter` (AGENTS.md hard rule).
- Read `.scratch/multiple-routes/findings.md` before any multi-route rendering work.

## Issues

- `01-namespace-elk-port-ids` — the live defect. Standalone, worth landing on its own.
- `02-extract-arrange-module` — the deepening proper.
- `03-render-elk-edge-routing` — draw ELK's routed edges instead of default beziers.
- `04-elk-fixed-side-ports` — config fix for rail braiding.
