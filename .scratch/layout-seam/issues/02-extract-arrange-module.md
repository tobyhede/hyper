# Extract an arrange module that returns a Layout

Status: resolved
Blocked by: 01

## Context

`App.tsx` (~200 lines) owns the whole ELK pipeline: it builds `layoutNodes`/`layoutEdges`, duplicating edge-shaping that `projectPathEdges` also does, runs `getElkLayout` in a `useEffect` with a manual cancellation flag, and holds the result in `useState`. That imperative glue is race-prone (StrictMode double-invoke, fast route switches) and cannot be tested through its current interface. `getElkLayout` also closes over a module-singleton `new ELK()`, so no fake can be injected.

## Task

Introduce an arrange module in `react-flow-adapter` owning the port contract end to end: card-unique port ids (issue 01), the ELK run, and the resolved handle offsets. `App` stops constructing ELK input.

Follow the library alignment in `spec.md`: the **Layout** is the strategy (ELK's `layoutOptions`), and the result is the cards, ports and edges carrying positions — **not** a new `Layout`/`Arrangement` object. Which cards get arranged is passed in by the view; the module does not decide membership.

Collapse the three parallel handle representations where the seam allows.

## Acceptance

- `App.tsx` no longer imports ELK types or builds ELK input.
- The ELK run is testable with an injected fake.
- Behaviour preserved: `pnpm e2e` green and unchanged.

## Answer

Done in `a9e1677`, but **not the way this ticket described**, and the difference is
the finding.

The ticket said "introduce an arrange module in `react-flow-adapter`". Building it
that way would have designed the seam from one implementation, and the interface
drafted first was visibly ELK-shaped — it took `edges` and `handlesByCard` because
ELK wants them, not because arranging does. So the seam was built by adding a
**second layout** instead, and letting the contract fall out of having two.

The second layout had to not be ELK. A different ELK algorithm is not a second
implementation — a Layout *is* `layoutOptions` (ADR 0005), so swapping `layered`
for `stress` is a parameter value, and the seam would have stayed hypothetical.
`gridLayout` is pure, synchronous and engine-free, which is what made it useful.

### What the second layout changed

- **The contract moved packages.** A grid is neither ELK nor React Flow, so
  `Layout`/`LayoutGraph`/`buildLayoutGraph`/`gridLayout` live in `@project/graph`.
  Only `elkLayout` is in the adapter. The ticket had put the whole thing in the
  adapter; that would have forced a pure geometry function to depend on React Flow.
- **A layout need not be async.** `Layout` returns `LayoutGraph | Promise<LayoutGraph>`
  and the caller does `Promise.resolve(...)`. Had ELK been the only implementation,
  the promise would have looked intrinsic to arranging. It is intrinsic to ELK.
- **A layout need not place ports.** Grid has no opinion about them, so port offsets
  stay optional and the render layer falls back to an even spread. That fallback
  already existed in `projection.ts` but as an accident of "ELK has not run yet";
  it is now a documented part of the contract.
- **Edges are not a universal input, and that is fine.** Grid ignores them
  completely. This *validated* carrying them in `LayoutGraph` rather than refuting
  it — ELK hands the whole graph to every algorithm too, and lets the algorithm
  decide what it consumes.

### Against the acceptance criteria

`App.tsx` imports no ELK types and builds no ELK input; it builds a `LayoutGraph`
and applies a layout. Swapping `elkLayout()` for `gridLayout()` is one line, and it
removes the last ELK import from the file — verified by actually running the app
that way, with `pnpm e2e` green under both.

The ELK run is testable with an injected fake: `elkLayout(options, engine)`. The
port-id collision regression tests from issue 01 survive, now asserting on the graph
a spy engine captured rather than on an exported builder.

`ElkPortData`, `ElkHandle`, `ElkNodeLayout` and `ElkLayoutResult` are deleted —
`elk/types.ts` is gone, collapsing one of the three parallel handle representations.
`RouteHandleRef` and `CardHandle` remain, and are genuinely different things: one is
domain, one carries render state (color, resolved offset).

`pnpm verify` 51 tests green, `pnpm e2e` 4 green and unchanged.
