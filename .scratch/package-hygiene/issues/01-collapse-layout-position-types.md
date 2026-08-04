# `LayoutPosition` and `LayoutPoint` are the same type in two packages

Status: resolved

## Context

```
LayoutPosition   packages/core/src/types.ts    z.infer<typeof layoutPositionSchema>   { x: number, y: number }
LayoutPoint      packages/graph/src/layout.ts  interface                              { x: number, y: number }
```

Structurally identical, declared in two packages. `Layout.positions` values are
the `core` one; everything downstream uses the `graph` one. They convert silently
because TypeScript is structural, which is why nobody has noticed.

Found while grilling the Placement module and deliberately left out of that change
to keep the diff on one concern.

## Direction

Collapse to one. The likely answer is that `core` owns it — it is derived from a
Zod schema that already exists there, and `graph` may import `core` — but confirm
that `graph`'s uses do not want a distinct type for a reason not written down.

## Resolution

Implemented in `1b5b480`. The graph package's duplicate `LayoutPoint` was removed,
and graph, app and React Flow adapter APIs now use the schema-derived
`LayoutPosition` from `@project/core`. A compile-time package API regression test
guards the shared type, and ADR 0014 no longer claims the duplication is required.
