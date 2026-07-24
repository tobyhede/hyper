# 05 — Auto-arrange: the command

Status: resolved
Type: task
Blocked by: 04

The only crossing from computed to authored. It runs an automatic strategy once
and writes the result into the active Layout's map — an edit, not a cache.

**The on-ramp half of this ticket is gone (ADR 0017).** A space with no Layout
gets one when it opens, so Auto-arrange no longer has to be pressed before a
hand-authored space can be edited. What is left is what the name says: in a
positioned view, "Auto-arrange" overwrites the active map with what the
automatic strategy computes, and you keep editing from there.

It still sets `defaultView` to the active Layout when the space does not already
name one — an arrangement that does not reopen is the derived-placement failure
wearing a different hat. Ticket 04 creates the Layout; this is the first thing
that gives the space a reason to *open* in it.

ELK's coordinates land as-is: `projectCardNodes` already carries
`LayoutCard.width`/`height` through and the adapter is on React Flow's native
top-left origin, so there is no `+size/2` compensation to apply. If you find
yourself adding one, `nodeOrigin` has drifted.

## Acceptance

- e2e: drag a card away, press Auto-arrange, the card returns to the strategy's
  position and stays draggable.
- Unit test that Auto-arrange replaces every position in the active map, rather
  than merging into it — a card dragged out of the way must not survive.
- `pnpm verify` and `pnpm e2e` green.

## Answer

`layoutPositions(graph)` in `packages/graph/src/positioned.ts` — the map a
laid-out graph describes, which is `positionedStrategy` run backwards. It sits
beside the strategy it inverts because that file already claimed the symmetry in
prose ("Auto-arrange is the same conversion run backwards"); this is the function
that sentence was describing. Cards a strategy left unplaced are **omitted**
rather than defaulted to the origin — absence in a Layout means unplaced, and
collapsing it to `(0, 0)` would assert a placement nothing made.

`ResolvedView` gained `automatic`, the strategy Auto-arrange runs. For an
automatic view it is literally the same function as `strategy`, so a grid view
re-arranges by the grid. For a positioned view it is the default automatic
strategy, because a Layout records where its cards are and not how they got
there — there is no strategy of the view's own to re-run.

`arrange(positions)` on the editor store replaces the map wholesale and moves the
nodes to match. It also resets `moved`, which is the non-obvious half: the routed
edge geometry arriving with an arrangement describes *that* arrangement, so it is
true again and the edges go back to ELK's routing rather than the plain curves a
drag had demoted them to. `App` installs the result as the layout result in the
same batch, so the sync effect that follows reconciles onto positions the store
has already taken.

Five mutations, each killed by the intended test: merging instead of replacing
(kills both replacement tests), keeping `moved`, dropping the before-first-layout
guard, defaulting unplaced cards to the origin, and giving a positioned view
itself as its automatic strategy. The round-trip property —
`positionedStrategy(layoutPositions(g))` reproduces `g`'s placement — is what
makes this a conversion rather than a reinterpretation.

**The `defaultView` half is not here, and did not silently vanish.** This ticket
asked Auto-arrange to name the active Layout as `defaultView` when the space names
none. ADR 0017 moved the ground under that: the Layout is now created when the
space *opens*, not when Auto-arrange is pressed, so the question "what is this
Layout called, and does the space open in it" belongs to the moment of creation
and not to a button that may never be pressed. Answering it needs an id for a
Layout nobody authored, which is ADR 0016 territory (proposed, unaccepted), and
the only thing that makes the answer observable is serialization. So it moves to
06, which is where the space file gets written and where `{ ...spaceFile,
layouts, defaultView }` already appears in the plan. Nothing about the current
behaviour depends on it: the arrangement is ephemeral either way until 06 lands.

`pnpm verify` green — 153 tests (9 new: 4 store, 3 `layoutPositions`, 2 view).
`pnpm e2e` green — 19, the 18 unchanged plus one.
