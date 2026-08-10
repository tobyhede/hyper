# `activateGraph` guards against the Space, not the resolved view

Status: resolved

Surfaced by: review of PR #36

## Context

`Navigation.activateGraph` in `packages/app/src/navigation.ts` checks that the
Graph exists in the Space, and nothing more:

```ts
if (getGraph(currentSpace(), graphId) === undefined) {
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

```text
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
`resolveGraphs` in `packages/app/src/view.ts:83` (ADR 0026). A widened guard
reads that answer; it does not compute a second one, and no store learns to
reach for a Space-level Graph collection.

## Why this may be `wontfix`

ADRs 0040 and 0041 replace the Layout's `graphs` *filter* with nested owned
Graphs, at which point "a Graph the Layout does not show" stops being
expressible and this dissolves. Prefer the small guard now unless that
structural work is imminent — in which case close this and say so.

## Resolution

**Not `wontfix`.** ADR 0040 is accepted and unbuilt — the Layout `graphs` filter
is still the built model, so the state this describes is still expressible and
the small guard was taken.

`activateGraph` now asks `resolveView(space, selectedRenderer).visibleGraphIds`
whether the Graph is one this renderer draws, and refuses it if not. It reads
that answer rather than computing a second one, so `resolveGraphs` remains the
one place that decides which Graphs a view shows (ADR 0026); no store learned to
reach for `space.graphs`, and nothing was threaded into Navigation, which
already imported `resolveView` for `selectRenderer`, `openFresh` and
`continueInRenderer`. The Space-scoped check stays in front of it, because the
two refusals are not the same sentence: a Graph the Space does not hold gets
"does not exist", a Graph it holds but this renderer filters out gets "the
selected renderer does not show".

**The refusal throws, matching the one beside it.** Both answer the same
question — Navigation may not name structure the current view does not hold —
so reporting them differently would re-create this ticket's asymmetry one level
down. Neither is reachable through the product, since `GraphSelector` is fed the
visible Graphs, which makes each a caller's mistake rather than an author's:
returning would answer one by moving no emphasis and saying nothing, leaving the
stale Active Graph to be written by every Edit after it. Throwing names the
wrong call at the call that made it, which is the point of moving the failure
off the commit. `acceptStoredSpace`'s reasoning for *not* throwing does not
transfer — it refuses an author's gesture that has a message to show and local
work to protect, where this refuses a call the product cannot make. Nothing is
half-applied either way: both checks sit above `publish`.

**The minted Graph keeps its exception by ordering, not by an exemption.**
`installCompletedEdit` submits before it activates, and the snapshot it submits
is the one `updatePositionedLayout` widened, so the minted Graph is inside the
filter one statement before it is named active. The existing
`space-authoring.test.ts` case that covers this opens on a Layout whose `graphs`
is explicitly `[]` — a filter that shows nothing — which is what makes it a
genuine regression guard rather than a Layout that happens not to filter; a
comment now says so, since omitting the field would silently retire the
coverage.

## Acceptance

- [x] Activating a Graph outside the resolved view's visible set is refused.
- [x] The minted-Graph path still activates.
- [x] The refusal is covered at the Navigation seam
      (`packages/app/test/navigation.test.ts`), which also pins that the same
      Graph activates under a renderer that filters nothing.
