# Unit-test the projection's handle invariants

Status: resolved

## Context

React Flow warning #008 — *"Couldn't create edge for source/target handle id"* — fires when an edge names a handle that doesn't resolve on the node it points at. The condition is entirely determined by what `projectCardNodes` and `projectRouteEdges` produce together, so it is checkable as a pure function, with no DOM, in `pnpm test` rather than `pnpm e2e`.

`projection.test.ts` covers each projection well on its own — handles are colored by route, edges are port-connected, ELK's points are carried through — but nothing asserts the *relationship* between the two outputs. A refactor that changed the handle id scheme on one side and not the other would pass every existing test and produce a graph with no edges.

The second invariant is the React Flow rule now recorded in `AGENTS.md`: multiple handles of the same kind on a node need distinguishable ids. It holds today because handle ids are `<routeId>::out`/`::in` and a route may not revisit a card (ADR 0012) — which means it is an invariant that depends on a *domain* rule, and that is exactly the kind of coupling worth pinning down.

## Task

Add to `packages/react-flow-adapter/test/projection.test.ts`:

1. **Referential integrity.** For a space projected to nodes and edges, every edge's `sourceHandle` resolves to an id in the source node's `sourceHandles`, and every `targetHandle` to an id in the target node's `targetHandles`.
2. **Handle id uniqueness per card per side.** No node has two `sourceHandles` sharing an id, likewise `targetHandles`.

Make at least (1) a fast-check property rather than a fixed example — the repo already uses fast-check, and the failure mode this guards is multi-route, so example-based coverage would likely miss it. A workable generator: a fixed pool of card ids, each route an ordered sample without replacement (satisfying ADR 0012), several routes over the shared pool; feed through `loadSpace` and skip any `{ ok: false }` rather than asserting on it.

## Acceptance

- Both invariants hold across generated multi-route spaces, including routes that share cards — the case that produces multiple same-side handles on one node.
- Breaking the handle id scheme on one side of the projection only (e.g. changing the suffix in `projectRouteEdges` but not `projectCardNodes`) fails the property.
- Runs in `pnpm test`; no React Flow import, no rendering.

## Notes

This overlaps `01` by design, and the overlap is the point: `01` catches it in whatever the app happens to render, this catches it deterministically across shapes the fixture doesn't contain, in a fraction of the time.

## Answer

Shipped as a new `packages/react-flow-adapter/test/projection.property.test.ts`
rather than appended to `projection.test.ts` — matching the repo's existing
`graph.property.test.ts` convention of keeping fast-check properties in their own
file, and keeping the example-based projection tests readable.

Two properties over generated multi-route spaces:

1. every projected edge's `sourceHandle`/`targetHandle` resolves to a handle id
   present on the referenced node, and
2. no node carries two same-side handles sharing an id.

The generator samples ordered card subsets without replacement from a shared
pool, which satisfies ADR 0012 by construction (so `loadSpace` always accepts),
and takes the card list from the union of what the routes visit (so there are no
orphans). The shared pool is the point: routes overlap on cards, which is the
only way a node ends up with several same-side handles.

Acceptance:

- Both pass; `pnpm test` is 87 tests over 13 files, ~2s.
- Not vacuous — property 1 asserts `edges.length > 0`.
- Mutation-checked **independently**, which matters because the two properties
  are easy to break together and thereby to verify only jointly:
  - Property 1: replacing the handle id in `resolveHandles` with a constant, so
    the node side no longer matches the ids the edges name, fails it.
  - Property 2: returning each handle twice (`[...handles, ...handles]`) leaves
    every id the edges name still present, so property 1 keeps passing and only
    property 2 fails.

  Both reverted. The first mutation happens to fail *both* properties, since a
  constant id also duplicates; the second is what shows property 2 has teeth on
  its own.
