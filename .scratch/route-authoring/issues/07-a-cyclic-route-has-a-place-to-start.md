# 07 — A cyclic Route has a place to start

**What to build:** Give `routeStartCard` an answer for a Route no card enters, so
that presenting a cyclic Route begins somewhere instead of doing nothing. This
closes user story 32, which the effort's other six tickets never covered.

**Blocked by:** nothing. `01` already made cycles and self-edges valid authored
structure (ADR 0032); this is the presenting half of that decision.

**Status:** resolved
Tags: release/v1

## The defect

Reachable by the first gesture this effort shipped. `e2e/new-space.spec.ts:216`
proves a self-connection mints `Route 1` and activates it. That Route is
`{ edges: [{ from: A, to: A }] }`, and presenting it does nothing at all:

1. `routeEntryCards` keeps every card that is some Edge's `from` but no Edge's
   `to`. For a self-edge, `arrivedAt` is `{A}` and `A` is the only `from`, so it
   filters itself out and the list is empty.
2. `routeStartCard` returns `entries[0]` — `undefined`.
3. `navigation.ts:157` guards on exactly that and returns without a `setState`.
   No mode change, no walk, no message, no throw.
4. `RouteSelector.tsx:69` disables the control on `activeRoute === undefined` —
   "no Route is active". Here a Route *is* active, so the button renders
   enabled, reads `Present`, and swallows the click.

The disable condition and the guard test different things, and this is the gap
between them. A fully cyclic Route is the only way to reach it: `routeSchema`
requires `edges.min(1)`, so a valid Route always has a card.

`present()`'s single guard is also answering two questions at once — "is a Route
active" and "does it have a start" — and that conflation is what lets a cyclic
Route fall through it. Only the first is reachable once `routeStartCard` is
total.

## How six resolved tickets left this reachable

Worth recording, because the same shape will hide the next one. Ticket `01` is
the one that made cycles legal, and it closed on this criterion:

> `pnpm e2e` passes unchanged, proving existing rendering and presenting still
> tolerate the accepted fixture behavior.

That checks presenting against **the fixture**, which is acyclic by
construction — every fixture route returns to its start through an alias rather
than an edge, precisely so it lays out as clean forward paths. So the one check
meant to reassure about presenting could not have caught this: `01` legalised
cycles in the domain and then verified presenting on a graph that has none. The
line reads as coverage and is not.

The general form: an e2e criterion asserting "presenting still works" is only as
good as the fixture's shape, and a ticket that widens what the domain accepts
cannot be reassured by a fixture that never exercises the new shape.

## What to change

`routeStartCard` returns the first entry when one exists, and otherwise the
first Edge's `from`. Two rules in strict order:

1. **A card nothing arrives at wins.** This is what exists today and it must
   stay first, because it makes the start depend on the Route's shape rather
   than on the order the author drew it. Connecting appends
   (`space-authoring.ts:392` is `edges: [...route.edges, connection]`), so an
   author who draws `B→C` and then attaches `A→B` stores
   `[{B,C}, {A,B}]` — and `edges[0].from` would start presenting at `B`,
   skipping `A`, which forward traversal never reaches.
2. **Otherwise the first Edge's `from`.** In a loop every card is arrived at, so
   rule 1 has no answer and authoring order is the only tie-break left.

Record in the comment that these two rules are not the same kind of answer. For
a self-edge, rule 2 *derives* the start — one card, one Edge, nothing to choose.
For a multi-card cycle it *picks* one, and any card would have been defensible.

Leave `routeEntryCards` alone. "A card nothing arrives at" is a true and useful
question whose honest answer for a loop is "none"; making it report a card would
make the word a lie. One function reports the structure, the other decides what
to do when the structure declines to answer.

- [x] `routeStartCard` answers every schema-valid Route, cyclic ones included.
- [x] A Route with an entry card is unaffected, including when its Edges are
      stored out of drawing order — pin the `[{B,C}, {A,B}]` case, since that is
      what rule 1 exists for and nothing currently proves it.
- [x] A self-edge Route starts at its only Card.
- [x] A multi-card cycle starts at the first Edge's `from`.
- [x] A Route with a cycle *and* a tail (`A→B, B→C, C→B`) still starts at `A` —
      it has an entry, so rule 2 never runs.
- [x] `routeEntryCards` is unchanged and still answers `[]` for a fully cyclic
      Route.
- [x] `present()` stops answering two questions with one guard. "No active
      Route" is the reachable refusal and is exactly what `RouteSelector`
      disables on, so the two must agree and that disable condition must be
      correct on its own afterwards. Decide deliberately what happens to the
      unreachable half rather than deleting it by default.
- [x] Presenting a self-connected Route enters presenting mode, draws the Card,
      and offers its one outgoing move.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Out of scope

- **Where a traversal of a loop ends.** Advancing walks forever; ADR 0032
  explicitly defers how a presenting surface "warns, limits, or visualises
  repeated visits" to presentation work. This ticket makes a loop startable, not
  finishable.
- **A Route naming its own start.** `traversal.ts` floats it — "if a route ever
  wants to name its own start, that is a field on the route and a change here" —
  and it stays floated. It is a schema change, an import/export change and a new
  authoring surface, for a field only cyclic Routes would use, and it would make
  a Route more than the set of Edges ADR 0032 says it is. The fallback does not
  foreclose it.

## Why not refuse instead

Fixing `RouteSelector`'s disable condition to match the guard would also close
the silent-click bug, and it was considered. It loses: a self-connection is this
effort's own first gesture, so refusing means the app ships a gesture that
produces a Route that can never be presented, which reads as contradicting ADR
0032's decision that cycles are legal authored structure. An author would also
have no way to tell why the control was dead.

## Answer

`routeStartCard` is now `routeEntryCards(route)[0] ?? route.edges[0]?.from` —
one line, two rules, in the order this ticket fixed. Its comment records that
they are not the same kind of answer: for a self-edge rule 2 *derives* the start,
while for a multi-card cycle it *picks* one that any card on the loop could have
been. `routeEntryCards` is untouched and still answers `[]` for a loop, which is
now pinned by a test rather than only implied by the ones that read it.

The defect was reproduced at three seams before any production code changed, and
each was red for the reason the ticket describes. `routeStartCard` on a self-edge
Route answered `undefined`; `Navigation.present()` over the same Route left
`mode: 'overview'` with an empty walk; and in Chromium, drawing the
self-connection and clicking the enabled `Present` control never produced
`presenting-chrome` — the click went nowhere, which is the bug as an author meets
it. All three are now green, and the browser test is the acceptance criterion
about entering presenting mode, drawing the Card and offering its one move.

`present()`'s single guard became two, because it had been answering two
questions at once and that conflation is what let a cyclic Route fall through it.
**No active Route** is the reachable refusal and is exactly what `RouteSelector`
disables the control on, so the two now agree and the disable condition is
correct on its own — `visibleRoutes` plus `resolveView`'s "first *visible*
route" fallback mean `activeRoute === undefined` holds precisely when no Route is
active. The second guard is the edge-less Route `routeSchema`'s `edges.min(1)`
forbids: unreachable through the domain, and kept only because the type still
admits it. Keeping it is the deliberate decision this ticket asks for, not a
default: `Route['edges']` is an array rather than a non-empty tuple, so `edges[0]`
is optional whatever the schema promises, and deleting the branch would mean a
non-null assertion claiming more than the type knows. Issue `09` records the
schema change that would remove it honestly, with the ripple measured — 14
errors across 7 files, only two of which improve — and a recommendation to close
`wontfix` unless a reviewer disputes that table.

The agreement between the two conditions is recorded at `onPresent={present}` in
`App.tsx`, the one place both sides are in view. `RouteSelector` keeps only the
claim it can make alone, because `ui` depends on `core` and may not document
`app`'s guard.

One correction to the ticket: the `[{B,C}, {A,B}]` case it says nothing proves
was already pinned, by `routeStartCard`'s "does not depend on which card the
first edge happens to mention". It was written when reading the first Edge's
`from` was merely a plausible simplification; now that rule 2 actually does read
it, that test is load-bearing, so its comment now names the appending connect
(`space-authoring.ts`) that makes stored order drawing order.

Where a walk of a loop *ends* remains out of scope, as written above: advancing a
self-edge walks forever, and ADR 0032 defers that to presentation work. This
makes a loop startable, not finishable — and because starting it is what made
that deferral reachable, it is now issue `08` rather than a line in an ADR.

`pnpm verify`: 80 test files, 790 tests passed, coverage thresholds green
(`graph/src` 96.37% statements, 93.52% branches). `pnpm e2e`: 71 passed.
