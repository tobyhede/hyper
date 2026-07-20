# Layout as a value

Source: `/improve-codebase-architecture` review, 2026-07-19 — candidate 3, the top recommendation.

## Problem

There is no Layout value in the code. `App.tsx` hand-builds the ELK input inline, runs the layout in a `useEffect` with a cancellation flag, and parks the result in local state. The handle id (`<pathId>::in|out`) is a stringly-typed handshake spanning three packages: minted in `@project/graph`, used as the ELK port id in `react-flow-adapter`, and re-used as the React Flow `<Handle id>` in `CardNode`. Three parallel handle types — `PathHandleRef`/`CardHandleSet`, `ElkHandle`/`ElkPortData`, `CardHandle`/`CardNodeData` — restate the same thing at three stages.

Worse, that port id is identical on every card a route passes through, so ELK cannot tell which card an edge attaches to. It mislays **even single-route** graphs: the bundled demo's "Main walkthrough" ships today with a backward-looping rail. See `.scratch/multiple-routes/findings.md`, Finding 1.

## Direction

One module owns arranging. It builds card-unique port ids, applies a **Layout** — a named strategy, which for the default is ELK layered/direction RIGHT — and returns the cards, ports and edges carrying positions. `GraphView` renders that and nothing else.

This encodes ADR 0002 (a layout arranges, a view renders) in the code, and turns multi-route into a parameter rather than a rewrite.

## Aligned with ELK and React Flow

Checked against the installed types, 2026-07-20. Neither library has a Layout entity, and we should not invent one:

- ELK keeps geometry as optional fields **on the graph elements** (`ElkShape` has `x?`/`y?`/`width?`/`height?`; `ElkNode`, `ElkPort` and edge `sections?` all extend from there). `elk.layout(graph)` takes an `ElkNode` and returns an `ElkNode` — the same structure with coordinates populated. The *strategy* is `LayoutOptions`, literally `{[key: string]: string}`, attachable at any level.
- React Flow's `NodeBase` has `position: XYPosition` as a **required** field and no layout concept at all; it renders whatever coordinates it is given.

So: a Layout is a named strategy (ELK's `layoutOptions`), and there is **no separate arranged-result type** — positions land on the cards. Do not introduce an `Arrangement`/`Layout` result object; `CONTEXT.md` lists "arrangement" under _Avoid_ for exactly this reason.

Which cards are arranged is decided by the **View** before the layout runs — ELK's `layoutOptions` has no notion of membership, and routes are simply part of the graph structure (ports and rail edges) that the layout consumes. Many routes, one Layout.

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
- `05-audit-default-layout-options` — strip the default layout to options that earn their place.
- `06-revisit-async-optionality` — decide whether `Layout`'s sync/async union earns its place.
- `07-demo-graph-that-discriminates` — a demo shape that actually exercises the layout.
- `08-choose-node-placement-strategy` — NETWORK_SIMPLEX vs BRANDES_KOEPF, split out of 05.
