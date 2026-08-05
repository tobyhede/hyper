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

Implemented in PR #24. The graph package's duplicate `LayoutPoint` was removed,
and graph, app and React Flow adapter APIs now use the schema-derived
`LayoutPosition` from `@project/core`.

The guard is `test/unit/point-type-identity.test.ts`, and it reads the
declarations in `packages/graph/src` rather than asserting a type. **A type-level
assertion cannot do this job.** TypeScript is structural, so a re-declared
`interface LayoutPoint { x: number; y: number }` *is* `LayoutPosition` as far as
the type system is concerned: restoring the duplicate and typing `Placement` over
it leaves `identity-types.test.ts`'s `Placement` assertion green, along with both
typechecks and lint. Measured, not assumed. That assertion pins the shape, and the
shape is exactly what the two types agree on — only the declarations tell them
apart, so the declarations are what has to be read. The check finds a point
re-declared under any name, and is not a search for `LayoutPoint`.

ADR 0014 keeps its own record of why the duplication looked structural; ADR 0038
is where that judgement is superseded.
