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

## Answer

**Not `wontfix`.** ADR 0040 is accepted and unbuilt — the Layout `graphs` filter
is still the built model, so the state this describes is still expressible and
the small guard was taken.

**What is guarded is a pair, and both writers of it now hold the invariant.**
Navigation's state carries a selected renderer and an Active Graph, and only
four things write either: `openedState` and `selectRenderer` resolve both
together and cannot disagree, `activateGraph` writes the Graph, and
`continueInRenderer` writes the renderer. Guarding the first of those two and
not the second would have left this ticket's asymmetry in place one level along
— the same dead Edit, reached by adopting a renderer instead of by activating a
Graph. Both refuse now, and both read the same answer:

- `activateGraph` refuses a Graph the resolved view does not show.
- `continueInRenderer` refuses a renderer that does not show the Active Graph.
  An absent Active Graph names nothing and is exempt.

`viewShowsGraph(view, graphId)` in `packages/app/src/view.ts` is the membership
test both call. It reads `visibleGraphIds` rather than deciding a second time, so
`resolveGraphs` remains the one place that answers which Graphs a view shows (ADR
0026); no store learned to reach for `space.graphs`, and nothing was threaded
into Navigation, which already imported `resolveView` for `selectRenderer`,
`openFresh` and `continueInRenderer`.

**`continueInRenderer` refuses rather than re-resolving.** Falling back to the
adopted Layout's own Active Graph would move the emphasis without being asked,
and this is the one call that must not interrupt a traversal: the history being
presented belongs to the Graph that was active, so silently naming another leaves
`moves()` answering Edges out of a Card nothing is standing on. Refusing leaves
the traversal exactly as it was. Its only caller is Edit completion, which cannot
trip it — the Layout it hands over names Navigation's own Active Graph as
`activeGraph`, on a snapshot domain intake has just accepted, and that pairing is
precisely what intake checks.

**Both refusals throw, matching each other.** They answer the same question —
Navigation may not name structure the current view does not hold — so reporting
them differently would re-create the asymmetry again. Neither is reachable
through the product, since `GraphSelector` is fed the visible Graphs, which makes
each a caller's mistake rather than an author's: returning would answer one by
moving no emphasis and saying nothing, leaving the stale Active Graph to be
written by every Edit after it. `acceptStoredSpace`'s reasoning for *not*
throwing does not transfer — it refuses an author's gesture that has a message to
show and local work to protect, where these refuse a call the product cannot
make. Nothing is half-applied either way: every check sits above `publish`.

**The Space-scoped refusal is subsumed and stays anyway.** `visibleGraphIds` is
either a Layout's filter or every Graph in the Space, and intake validates that a
filter names only Graphs the Space holds — so the visible set is a subset, and
the view-scoped check catches every Graph the Space-scoped one would. What the
first refusal adds is the sentence: "does not exist" and "does not show" are
different mistakes and one message covering both would name neither. It is a
discriminator rather than a case the other misses, and the comment now says so
plainly instead of implying two independent questions.

**The minted Graph keeps its exception by ordering, and the order was wrong.**
`installCompletedEdit` now runs `continueInRenderer(edit.nextRenderer)` *before*
`activateGraph(edit.mintedGraphId)`. Activating first resolved the renderer the
Edit began in rather than the one it produced, and passed on two unrelated
accidents: an outgoing Layout shares its id with the Layout written back into it,
so the widened filter happened to be the one read; and an outgoing Algorithmic
View filters nothing, so any answer passed. Neither is a reason, and the second
hid the case that would break. With the renderer adopted first, both shapes admit
the minted Graph for a reason this Edit established — a Layout converted from an
Algorithmic View carries no filter at all, and an existing Layout that does
filter was widened by `updatePositionedLayout` in the same write that added the
Graph.

The completion window stays total, and its docblock now says why per statement
rather than claiming there is nothing to trip: `install` decides nothing,
`continueInRenderer` resolves a Layout the submitted snapshot holds and whose
`activeGraph` is the current Active Graph, and `activateGraph` resolves that same
adopted Layout. The guards live in Navigation because the invariant is
Navigation's, held against every caller; the window is a caller that satisfies
them.

**Coverage.** The Layout case opens on a Layout whose `graphs` is explicitly `[]`
— a filter showing nothing — which is what makes it a real regression guard; a
comment says so, since omitting the field would silently retire it. The View case
needed its own test, because there the widening does nothing and the path passed
for an unrelated reason: `activates the minted Graph against the Layout the Edit
created, not the View it converted` pins the renderer Navigation is on *at the
moment of activation*, and that the converted Layout carries no filter of its
own. Reverting the swap fails it.

## Acceptance

- [x] Activating a Graph outside the resolved view's visible set is refused.
- [x] Adopting a renderer that does not show the Active Graph is refused too, so
      the invariant is held at both writers.
- [x] The minted-Graph path still activates, against the renderer the Edit
      produced.
- [x] The refusals are covered at the Navigation seam
      (`packages/app/test/navigation.test.ts`), which also pins that the same
      Graph activates under a renderer that filters nothing, and that a Space
      with no Active Graph adopts any renderer.
- [x] The View-converting minted path is pinned in
      `packages/app/test/space-authoring.test.ts` rather than passing for an
      unrelated reason.
