# Extract an arrange module that returns a Layout

Status: open
Blocked by: 01

## Context

`App.tsx` (~200 lines) owns the whole ELK pipeline: it builds `layoutNodes`/`layoutEdges`, duplicating edge-shaping that `projectPathEdges` also does, runs `getElkLayout` in a `useEffect` with a manual cancellation flag, and holds the result in `useState`. That imperative glue is race-prone (StrictMode double-invoke, fast route switches) and cannot be tested through its current interface. `getElkLayout` also closes over a module-singleton `new ELK()`, so no fake can be injected.

## Task

Introduce `arrange(space, selection) -> Layout` in `react-flow-adapter`, owning the port contract end to end: card-unique port ids (issue 01), the ELK run, and the resolved handle offsets. `GraphView` consumes a Layout and renders it; `App` stops constructing ELK input.

Collapse the three parallel handle representations where the seam allows.

## Acceptance

- `App.tsx` no longer imports ELK types or builds ELK input.
- The ELK run is testable with an injected fake.
- Behaviour preserved: `pnpm e2e` green and unchanged.
