# Extract an arrange module that returns a Layout

Status: open
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
