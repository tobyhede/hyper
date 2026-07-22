# Revisit `Layout`'s sync/async union

Status: resolved

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

## Answer

Collapsed. `03` and `04` are done and no synchronous consumer appeared — no CLI,
no static exporter, and `App` still awaits every layout through the same
`useEffect` + cancellation path. So the sync branch was decoration.

`Layout` is now `(graph: LayoutGraph) => Promise<LayoutGraph>`; `gridLayout` is
`async` (its arithmetic is unchanged, just wrapped); `App` dropped the
`Promise.resolve(...)` wrapper and calls `layout(graph).then(...)` directly. Every
caller now handles one shape.

`gridLayout`'s reason to exist is unchanged — it keeps the seam honest by placing
no handles and ignoring the edges, which is the ELK-specific surface, not
sync-vs-async. If a synchronous consumer ever does arrive (the CLI/exporter in
README's next steps), this is trivially reopened: give `Layout` back the union and
branch at the one call site.
