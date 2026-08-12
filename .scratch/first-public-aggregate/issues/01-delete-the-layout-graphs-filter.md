# Delete the Layout graphs filter

Status: resolved
Blocked by: None — can start immediately

## What to build

A Layout stops carrying a list of the Graphs it draws. Every renderer draws
every Graph in the Space, which is what "selection is emphasis, not filtering"
already meant everywhere else.

The filter is authored-only: the app has never had a surface for writing one,
the tracked fixture declares no Layout at all, and it appears exclusively in
tests. Removing it is behaviour-preserving for every document in the tree.

It goes now, ahead of the aggregate change, for two reasons. It is the field
name the Layout-owned Graph collection takes, so the collision has to clear
first. And it removes a whole reference rule and a whole branch of the placement
writer before those modules are rewritten, so the rewrite is smaller.

What goes with it:

- The Layout's `graphs` array of Graph ids in the core schema, and its import
  variant.
- The `layout-active-graph-not-shown` reference error, and the filter half of
  `layout-unknown-graph`. A Layout's `activeGraph` still has to name a Graph
  that exists — that check stays.
- The filter branch in `resolveGraphs`. `visibleGraphIds` survives as a field
  and answers every Graph in the Space; it becomes load-bearing again in `02`,
  where a selected Layout answers with the Graphs it owns.
- `updatePositionedLayout`'s filter maintenance, and with it the `mintedGraphId`
  member of the placement edit — it exists only to put a newly minted Graph into
  an existing filter. Its caller in Space Authoring drops the argument.

## Green bar

Standalone. `pnpm verify` and the full Playwright suite both green, and this
lands on `main` before the branch that `02`–`06` share.

## Acceptance criteria

- [x] A Layout has no `graphs` key in the normal or import schema.
- [x] A document that carries one is rejected as an unrecognised key rather than
      silently ignored, so a stale authored file is not read as drawing
      everything by accident.
- [x] `activeGraph` naming a Graph the Space does not hold is still a named
      reference error; the "does not show" error is gone.
- [x] `resolveGraphs` answers every Graph in the Space for both a selected
      Layout and an Algorithmic View.
- [x] The placement edit carries no minted-Graph argument, and no caller passes
      one.
- [x] Tests that asserted filtering are deleted rather than adapted — there is
      no filter left to assert against.
- [x] `pnpm verify` and `pnpm e2e` green.

## Answer

Done in `4a954a1`. A Layout no longer names the Graphs it draws; every renderer
draws every Graph in the Space, which is what selection-is-emphasis already
meant everywhere else. `visibleGraphIds` survives as the seam and becomes
load-bearing again in `02`, where it answers a Layout's owned Graphs.

Two decisions worth carrying forward.

`positionedLayoutSchema` is now `.strict()` rather than guarding the one retired
key. Stripping `graphs` silently would read a file saying "draw only these" as
one saying "draw all of them" — the single answer its author did not write. It
is the only strict object in `schema.ts`; the asymmetry is documented at the
point of surprise, and `.extend()` carries the mode into the import variant, so
that is pinned rather than assumed.

About fifteen tests were deleted rather than adapted, because there is no filter
left to assert against. Two were kept and adapted instead: a canvas-projection
property test whose subject is the React Flow #008 handle-resolution invariant
rather than filtering, and the e2e covering Alt empty-drop minting into an
existing Layout, whose seeded empty filter was inert scaffolding.

Review found no Spec defects. Its one substantive Standards finding is that two
Navigation guards are now unreachable and their tests went with the filter,
leaving both `throw` sites uncovered. The guards stay — AGENTS.md is explicit
that the invariant lives in Navigation — and ticket `02` makes the state
constructible again, which is where the coverage belongs.
