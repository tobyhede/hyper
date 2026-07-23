# 02 — Space file: `layouts` + `defaultView`

Status: resolved
Type: task

Additive schema change. Every existing space file — fixture, `example/`, the
tests' inline spaces — must still parse untouched, which is the main thing to
prove.

In `packages/core/src/schema.ts`:

- `positionedLayoutSchema`: `id`, `title`, `kind: 'positioned'`, `positions` as a
  record of card id → `{ x, y }`.
- `layoutSchema` as a discriminated union on `kind` with the same `preprocess`
  default-to-`'positioned'` shape `cardSchema` uses for `'markdown'`. One kind
  today; the point is that a second one costs no migration.
- `spaceFileSchema` gains `layouts: z.array(layoutSchema).optional()` and
  `defaultView: z.string().min(1).optional()`.

`defaultView` names a view — a positioned layout's id, or a built-in automatic
kind. It carries no parameters; see ADR 0013 for why that boundary matters.

In `packages/graph/src`:

- `validate.ts`: a position naming a card that does not exist is an error
  (`layout-position-unknown-card`), same class as an unresolvable step target. A
  layout **omitting** a card is fine — positions are sparse by design.
- `defaultView` naming neither a declared layout nor a known built-in is an error.
- `space.ts`/`lookup.ts`: index the layouts, `getLayout(space, id)`.

## Acceptance

- Round-trip: the fixture and `example/space.json` parse unchanged; a file with
  no `layouts` key is valid.
- Rejection tests for the dangling position and the unknown `defaultView`, with
  the error code asserted.
- `pnpm verify` green, `pnpm e2e` green **and unchanged**.

## Answer

Schemas landed as `layoutPositionSchema`, `positionedLayoutSchema` and
`layoutSchema` (the one-member discriminated union, with the `preprocess`
default-to-`'positioned'`). The default is justified differently from
`cardSchema`'s: there are no pre-layouts files to migrate, so it buys
hand-authoring ergonomics — a layout can be written as an id, a title, and its
positions.

Three naming/scope calls worth recording:

- The union type shipped as **`AuthoredLayout`** to dodge the collision with
  `@project/graph`'s `Layout` (then the strategy). That prefix named a property
  every layout in the file has by construction, so it distinguished nothing —
  ticket 07 replaced it, giving `Layout` to the data and `LayoutStrategy` to the
  behaviour (ADR 0014). `PositionedLayout` names the single member.
- The built-ins are **`graph` and `grid`**, declared in `core` as
  `BUILT_IN_VIEW_IDS`/`isBuiltInViewId`. Not `elk`: the engine is an
  implementation choice and `CONTEXT.md` already calls the route-driven view the
  Graph view.
- **`duplicate-layout-id`** was added alongside the two error kinds the ticket
  named. It is the same class as `duplicate-card-id`, and without it
  `layoutsById` silently drops a layout at load.

`Space` gained `layouts` (always an array — `[]` for a space that declares none,
never `undefined`), `defaultView`, and `layoutsById`; `getLayout` reads the index.
A built-in view's name resolves to no layout there, which is what makes ticket
03's chain a plain lookup-then-fallback.

Round-trip is proved by `packages/app/test/space-files.test.ts`, which loads both
on-disk files. `fixture/space.json` is already covered by the app booting, but
`example/` is dormant and nothing else would have noticed it breaking.

`positions` is a `Record`, so under `noPropertyAccessFromIndexSignature` it is
read with bracket access, and under `noUncheckedIndexedAccess` a lookup is
`| undefined`. That is the right shape for the file; ticket 03 converts to the
`ReadonlyMap` `positionedStrategy` takes at the seam.

Left open for 03: a declared layout whose id is `graph` or `grid` shadows the
built-in. Nothing rejects it, because which one wins is a resolution decision and
resolution does not exist yet.

`pnpm verify` green — 124 tests (25 new), 0 lint errors. `pnpm e2e` green and
unchanged, 16 passed.
