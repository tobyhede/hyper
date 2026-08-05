# 09 — A Route carries a non-empty Edge list

**What to build:** Change `routeSchema`'s `edges` from `z.array(routeEdgeSchema).min(1)`
to `z.array(routeEdgeSchema).nonempty()`, so `Route['edges']` infers as
`[RouteEdge, ...RouteEdge[]]` rather than `RouteEdge[]`. `routeStartCard` then
returns `CardId` instead of `CardId | undefined`, and the provably-unreachable
`if (start === undefined) return;` in `Navigation.present()` — plus the three-line
comment `07` wrote to explain why it had to stay — goes away.

**Blocked by:** nothing.

**Status:** needs-triage

## Why

`07` left this behind deliberately, and said so in its Answer: *"It could not be
deleted — `Route['edges']` is an array, not a non-empty tuple, so `edges[0]` is
optional whatever the schema promises, and removing the branch would mean a
non-null assertion that claims more than the type knows."* The domain already
guarantees at least one Edge; only the type disagrees. `.nonempty()` is zod's
way of saying it in the type, and it costs nothing at runtime.

The prize is small and worth stating plainly: one dead line and one explanatory
comment removed from `packages/app/src/navigation.ts`, and one honest signature
in `packages/graph/src/traversal.ts`. The dead branch is already documented as
dead, so it misleads nobody today.

## Evidence

Measured on `fix/cyclic-route-start` by making the change and running the root
program — not estimated.

**The runtime is provably unchanged.** In the pinned zod (3.25.76, via
`packages/core` `^3.23.8`), `ZodArray.nonempty(message)` is implemented as
`return this.min(1, message)` — literally the same call
(`zod/v3/types.js:1834`). Parsing `{ edges: [] }` through both produces a
byte-identical issue:

```
{"code":"too_small","minimum":1,"type":"array","inclusive":true,"exact":false,
 "message":"Array must contain at least 1 element(s)","path":["edges"]}
```

So `loadSpace`'s `invalid-shape` message (`edges: Array must contain at least 1
element(s)`), the `spaceFileSchema` rejection pinned in
`packages/core/test/schema.test.ts` ("rejects a route with no edges — a Route is
its Edges (ADR 0032)"), and the backend's `invalid-snapshot` path are all
unaffected. Only `ZodArray`'s `Cardinality` type parameter moves, from `"many"`
to `"atleastone"` (`zod/v3/types.d.ts:485-496`). No test in the tree pins the
issue `code` or message for this case, so there is nothing to regress.

**The import and export schemas do not constrain it, but the exporter does.**
`importRouteSchema` is `routeSchema.extend({ id: uuidSchema.optional() })`, so
`edges` carries through untouched and import gains the same guarantee for free;
`src/import/` never names `routes` or `edges` at all. The *exporter* is the one
production site that breaks — see below.

**The ripple is 14 errors across 7 files.** `pnpm exec tsc -p tsconfig.json
--noEmit` is clean before and reports exactly these after. `pnpm -r typecheck`
stays green either way, because the per-package configs cover `src` only.

| File | Errors | The fix | Verdict |
| --- | --- | --- | --- |
| `src/export/export-space.ts` | 1 | `canonicalSpaceFile` does `edges: route.edges.map(({ from, to }) => ({ from, to }))`; `Array.prototype.map` does not preserve tuple shape, so this needs a head/tail split (`[project(first), ...rest.map(project)]`) or a cast | **Churn, in production code.** Three lines of ceremony replacing a one-line field projection, proving nothing about the exporter |
| `packages/graph/test/graph.property.test.ts` | 5 | `spaceFileFromIds` builds `edges: ids.slice(0, -1).map(...)` and the diamond case builds `middles.flatMap(...)`. Both are `RouteEdge[]` by construction | **Worse than churn.** The real guarantee is fast-check's `minLength: 2`, which no type sees; the fixes are two hand-written `as [RouteEdge, ...RouteEdge[]]` casts, or an off-by-one-prone head/tail rewrite of a clear one-liner. A cast in a property test re-asserts by hand exactly what this change exists to prove |
| `packages/ui/test/RouteLegend.test.tsx` | 2 | invent an Edge naming two card UUIDs | **Churn.** The subject is the legend's stripes and dimming; Edges are irrelevant to it |
| `packages/ui/test/RouteSelector.test.tsx` | 2 | same | **Churn.** The subject is the combobox and the Present button's disabled state |
| `packages/react-flow-adapter/test/RouteHud.test.tsx` | 2 | same | **Churn.** Same shape again |
| `packages/persistence/test/memory-backend.test.ts` | 1 | annotate the inferred `invalidSnapshots` array as `SpaceSnapshot[]` so the literal is contextually typed | **Mild improvement** — the array gains a declared type |
| `packages/graph/test/traversal.test.ts` | 1 | the local `route()` helper maps a `[UUID, UUID][]`, and the `route([])` case becomes unconstructible | **Genuine.** That test — "is undefined only for a route with no edges, which the schema forbids" — is the one the change is supposed to make meaningless, and deleting it is the point |

So: 2 of the 7 files improve, 1 gets ceremony in production code, 1 gets casts in
a property test, and 3 get an invented Edge in tests that never look at Edges.
Ten of the fourteen errors are in that last group plus the property test.

## Acceptance criteria

- [ ] `routeSchema.edges` is `.nonempty()`; `Route['edges']` is
      `[RouteEdge, ...RouteEdge[]]`.
- [ ] **Written first:** a test pinning that a Route with no edges is still
      rejected by `loadSpace` with the same reported error as today — the
      `invalid-shape` message, not just `ok: false`. `schema.test.ts` currently
      asserts only `result.success === false`, which would not catch a changed
      message. Prove it red-to-green against the message, before the schema moves.
- [ ] `routeStartCard` returns `CardId`, and its `?.` becomes `.`.
- [ ] `present()`'s `start === undefined` branch and the comment describing it
      are both gone; the "no active Route" refusal and its comment stay, since
      that is the reachable one and the one `RouteSelector` agrees with.
- [ ] `traversal.test.ts`'s "is undefined only for a route with no edges" case is
      **deleted**, not repaired — it asserts a value the type no longer admits.
      The `undefined` sentence in `routeStartCard`'s doc comment goes with it.
- [ ] No `as [RouteEdge, ...RouteEdge[]]` cast is introduced anywhere. If the
      property test cannot be fixed without one, that is the signal to close this
      as `wontfix` rather than to write the cast.
- [ ] `pnpm verify` passes, including `graph`'s pinned coverage thresholds.
      `pnpm e2e` is not strictly required — no behaviour changes — but a
      behaviour-preserving change should leave it green and unchanged.

## Recommendation

**Close as `wontfix` unless a reviewer disagrees with the table above.** The
change buys one dead line and one comment, both already documented as dead, and
charges for it a cast in a property test, ceremony in the CLI exporter, and three
UI/adapter tests forced to invent structure they do not test. The type is right
in principle; the tree is not shaped to receive it cheaply.

If it is taken, take it whole and alone (per the rename rule in
`docs/agents/workflow.md`): never riding along with a structural change, since
the diff is otherwise unreadable.

## Alternatives considered

- **A non-null assertion in `routeStartCard`** — `route.edges[0]!.from` — moves
  the dead branch from `app` to `graph` and shrinks the ripple to zero. Rejected
  for the same reason `07` rejected it: an assertion that claims more than the
  type knows, in the one package whose job is to make a `Space` correct by
  construction. It trades a documented dead branch for an undocumented unchecked
  one.
- **A throw instead of a return in `present()`.** Same objection — the branch
  survives, only its failure mode changes.
- **Relaxing `validateReferences`'s `Referenceable.routes` to a structurally
  looser Route.** Would spare the property test, at the cost of a second Route
  shape in `graph` for the type checker's benefit. Not worth a parallel type.

## Out of scope

- **Any other schema field.** `spaceFileSchema.routes` stays a plain array: a
  space with no routes is what a new space *is* (ADR 0015), and
  `schema.test.ts` pins it.
- **A Route naming its own start**, still floated by `traversal.ts` and still
  deferred by `07`.
