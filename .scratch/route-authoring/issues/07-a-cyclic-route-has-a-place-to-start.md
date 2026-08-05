# 07 — A cyclic Route has a place to start

**What to build:** Give `routeStartCard` an answer for a Route no card enters, so
that presenting a cyclic Route begins somewhere instead of doing nothing. This
closes user story 32, which the effort's other six tickets never covered.

**Blocked by:** nothing. `01` already made cycles and self-edges valid authored
structure (ADR 0032); this is the presenting half of that decision.

**Status:** ready-for-agent

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

- [ ] `routeStartCard` answers every schema-valid Route, cyclic ones included.
- [ ] A Route with an entry card is unaffected, including when its Edges are
      stored out of drawing order — pin the `[{B,C}, {A,B}]` case, since that is
      what rule 1 exists for and nothing currently proves it.
- [ ] A self-edge Route starts at its only Card.
- [ ] A multi-card cycle starts at the first Edge's `from`.
- [ ] A Route with a cycle *and* a tail (`A→B, B→C, C→B`) still starts at `A` —
      it has an entry, so rule 2 never runs.
- [ ] `routeEntryCards` is unchanged and still answers `[]` for a fully cyclic
      Route.
- [ ] `present()`'s `start === undefined` guard is removed or proven
      unreachable, and `RouteSelector`'s `disabled` condition is correct on its
      own once it is.
- [ ] Presenting a self-connected Route enters presenting mode, draws the Card,
      and offers its one outgoing move.
- [ ] `pnpm verify` and `pnpm e2e` pass.

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
