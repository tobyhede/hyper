# `activateGraph` guards against the Space, not the resolved view

Status: ready-for-agent

Surfaced by: review of PR #36

## Context

`Navigation.activateGraph` in `packages/app/src/navigation.ts` checks that the
Graph exists in the Space, and nothing more:

```ts
if (graph === undefined) {
  throw new Error(`The Graph ${graphId} does not exist.`);
}
```

But a Layout's `graphs` field is a *filter*, and the resolved view answers a
narrower set — `visibleGraphIds = layout?.graphs ?? all` in
`packages/app/src/view.ts`. A Graph can exist in the Space and still not be one
this Layout shows.

That id then flows into persisted state. `deriveCompletedEdit` reads it off
Navigation and hands it to `updatePositionedLayout`, which writes it as the
Layout's `activeGraph`. Intake rejects exactly that combination in
`packages/graph/src/validate.ts`:

```
Layout "<id>" opens active on graph "<id>", which it does not show
```

So the failure shape is a completed Edit that cannot commit: `loadSpaceSnapshot`
throws inside `deriveCompletedEdit`, or the snapshot reaches the backend and
returns a permanent `invalid-snapshot` rejection. Not a conflict, not a retry —
a dead edit.

**It is not reachable through the product today.** `GraphSelector` is fed
`visibleGraphs` in `App.tsx`, so the control cannot offer an out-of-filter
Graph. That is the only call site checked; the claim is about the path walked,
not an exhaustive sweep of callers.

What makes it worth recording is the asymmetry: the guard that exists is
Space-scoped, the invariant it protects is view-scoped, and the only thing
holding them together is which array a component was handed. `mintedGraphId` is
the one case the code *does* handle deliberately — `updatePositionedLayout`
widens the filter so a newly minted Graph becomes visible before it is named
active — which shows the invariant was understood in one place and not the
other.

Pre-existing; the Route→Graph rename moved this code but did not introduce the
gap.

## Direction

Move the guard to what it is actually guarding. `activateGraph` should refuse a
Graph the resolved view does not show, for the same reason it refuses a Graph
the Space does not hold, and the refusal should say so. The minted Graph keeps
its exception.

Decide at the same time whether the refusal throws, as the existing one does, or
returns — activation is not an Edit (ADR 0028) and a caller has no recovery for
either.

## Constraint that must survive

One place answers which Graphs a view shows and which opens active —
`resolveVisibleGraphs` in `packages/app/src/view.ts` (ADR 0026). A widened guard
reads that answer; it does not compute a second one, and no store learns to
reach for a Space-level Graph collection.

## Why this may be `wontfix`

ADRs 0040 and 0041 replace the Layout's `graphs` *filter* with nested owned
Graphs, at which point "a Graph the Layout does not show" stops being
expressible and this dissolves. Prefer the small guard now unless that
structural work is imminent — in which case close this and say so.

## Acceptance

- Activating a Graph outside the resolved view's visible set is refused.
- The minted-Graph path still activates.
- The refusal is covered at the Navigation seam.
