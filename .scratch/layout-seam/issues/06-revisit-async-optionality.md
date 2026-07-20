# Revisit `Layout`'s sync/async union

Status: open

## Context

`Layout` returns `LayoutGraph | Promise<LayoutGraph>`. The union is *true* —
`elkLayout` hands off to an engine, `gridLayout` is arithmetic — but as of
`a9e1677` nothing exploits it. `App` wraps every layout in `Promise.resolve` and
pushes it through the same `useEffect` + `setState(null)` + cancellation dance
that only ELK needs, so a synchronous layout still pays the async tax: a null
frame, a re-render, and the `layoutReady` plumbing.

Decision taken 2026-07-20: **keep the union, do not branch on it yet.** The type
states something true, the cost is one `Promise.resolve` at one call site, and
the branch is worth adding when there is a second reason for it. Not an ADR —
trivially reversible.

## Trigger

Revisit when `03` and `04` are done. By then either:

- **A synchronous consumer exists** — the graph/route CLI in README's next
  improvements, a static exporter, or `App` computing a sync layout in `useMemo`
  to drop the null frame and the cancellation race. Then the union has earned its
  place; cash it in and note where.
- **None has appeared.** Then it is decoration. Collapse `Layout` to
  `Promise<LayoutGraph>` and make `gridLayout` async — uniform, one less thing
  for every caller to handle.

## Acceptance

- The union is either exercised by a real caller or removed.
- Whichever way it goes, the reason is recorded here.
