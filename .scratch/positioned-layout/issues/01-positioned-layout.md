# 01 — `positionedStrategy` in `graph`

Status: resolved
Type: task

The third strategy, and the one that reads geometry instead of computing it.
Pure, no app change, no schema change — it lands green on its own.

```ts
export function positionedStrategy(positions: ReadonlyMap<string, LayoutPoint>): LayoutStrategy
```

- Cards with an entry take it. Cards without are placed in a deterministic grid
  past the bounding box of the positioned ones (visibly unplaced, never stacked
  at the origin, never overlapping a positioned card).
- Places **no ports** and populates **no edge sections**, exactly like
  `gridStrategy` — `projectCardNodes` already spreads handles evenly across
  `nodeHeight` when offsets are absent, and `RoutedEdge` already falls back to a
  bezier when an edge has no `sections`. Nothing in the render layer needs to
  change; if it does, the seam has leaked.
- `async` to satisfy the uniformly-async contract, with the same
  `require-await` disable `gridStrategy` carries.

Lives beside `grid.ts` in `packages/graph/src/`, exported from `index.ts`.

## Acceptance

- Unit tests: positioned cards land exactly where the map says; omitted cards
  land outside the positioned bounding box and do not overlap; an empty map
  degrades to the all-unpositioned grid; edges pass through untouched.
- A property test worth having: for any map and card set, every card gets a
  position and no two cards overlap.
- `pnpm verify` green.

## Answer

`packages/graph/src/positioned.ts`, exported from `index.ts`. The contract needed
no change and the render layer needed no change — `projectCardNodes` already
spreads handles when ports carry no offsets, and `RoutedEdge` already falls back
to a bezier when edges carry no sections, so the seam held.

Unplaced cards go in a square-ish grid whose origin is `maxY + GAP` of the
authored bounding box, left-aligned to its `minX`. Separating vertically is what
makes non-overlap unconditional: an authored card can extend arbitrarily far
right, but nothing authored reaches below the band.

Two properties, in `packages/graph/test/positioned.test.ts`: every card ends up
positioned, and a card the map omits overlaps nothing. The second is deliberately
one-sided — cards the *author* placed may overlap each other, because that is the
author's business, and a property forbidding it would be a false claim about the
domain.

Both properties were shown to fail before being trusted: mutating the band origin
to `0` fails the omitted-card overlap property and the "below everything" example,
and passes the other eight. `pnpm verify` green — 99 tests, 0 lint errors.
