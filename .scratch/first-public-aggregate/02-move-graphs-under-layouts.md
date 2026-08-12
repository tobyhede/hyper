# Move Graphs under Layouts

Status: ready-for-agent
Blocked by: 01

## First commit — give the handle-id format one producer

Land this **before** the structural change, as its own commit, and verify it on
its own. It is behaviour-preserving, so doing it first keeps the aggregate diff
from also carrying a format-ownership change.

`graph-rendering.ts` owns the handle-id format in `outHandleId` and
`inHandleId`, but neither is offered from `@project/graph`'s index, so
`react-flow-adapter`'s `projection.ts` retypes both literals inline as the `??`
fallback in `declaredHandles`. Two packages, one format, no shared constant.

This belongs to *this* ticket for three reasons, all of them its own
instructions:

1. The duplicate-Graph-id load error below exists because `<graphId>::out`/`::in`
   would otherwise put one handle id on a Card for two Graphs.
2. The prohibition below — do not owner-qualify Graph references through the
   render pipeline — is only checkable by reading one module if the format *is*
   one module. Today it is two.
3. `declaredHandles` is currently handed `space.graphs.map((graph) => graph.id)`.
   The structural change replaces that with the flatten, so the ids those two
   literals mint start crossing Layout boundaries. Both literals are the
   fallback that declares a handle for a Graph **not yet incident** to the Card —
   load-bearing per AGENTS.md, because it is what makes a completed connection
   resolve in the same render that first makes its target incident, and what
   keeps warning #008 away on the *next* connection. After the flatten that
   fallback spans Layouts, and it should not be a string literal in the package
   that no longer owns the collection it derives from.

What to change:

- Offer `inHandleId` and `outHandleId` from `@project/graph`'s index, on the
  existing `./graph-rendering` value export.
- Rewrite the index doc block that cites them. It names `buildCardHandles` and
  `buildGraphRenderEdges` calling `outHandleId`/`inHandleId` as an instance of
  the curation rule — a helper no consumer needs to write stays in its module —
  and that instance is now false. The rule survives and
  `graphCardIds`/`cardIdsForGraphs` and `graphStartCard`/`graphEntryCards` are
  still true instances of it. Only the example list changes.
- Add both names to `OFFERED_VALUES` in `test/unit/graph-package-surface.test.ts`.
  The surface test holds the index's declarations and the module they produce to
  one list, and fails until they are listed.
- Call them from `projection.ts`'s two fallbacks. Its value import from
  `@project/graph` already exists — extend it.

**Do not**, in this commit:

- Touch the roughly forty literal handle-id assertions in the graph, adapter and
  app tests. A test that builds its expectation with the function under test
  asserts nothing. They are literal on purpose.
- Owner-qualify the handle id. This change exists to make that prohibition
  enforceable, not to open it.
- Touch `elkPortId` or the `<cardId>##<handleId>` namespacing — a separate
  concern, already centralised.
- Fix the duplicated even-handle-spread arithmetic in `declaredHandles`. Real,
  but not this.

Verify with a full `pnpm verify` and `pnpm e2e` **on this commit alone**, before
starting the structural work. E2E must pass unchanged with no e2e file touched —
that is the guard proving it was behaviour-preserving. No ADR: it changes no
decision, it makes an existing one enforceable by reading one module.

## What to build

The first-public version 1 document shape: a Graph is a nested owned value of
the Layout it belongs to, and there is no Space-level Graph collection. This is
ADR 0040's ownership and ADR 0045's identity rule, landed in the schema, the
intake and the view resolution together.

```jsonc
{
  "version": 1,
  "title": "…",
  "layouts": [
    {
      "id": "…",
      "title": "…",
      "positions": { "<cardId>": { "x": 0, "y": 0 } },
      "graphs": [{ "id": "…", "title": "Long", "edges": [{ "from": "…", "to": "…" }] }],
      "activeGraph": "…"
    }
  ],
  "defaultView": "…"
}
```

`version: 1` replaces `2`, and a version 2 document is **rejected by name**, not
migrated. Hyper is unreleased; the disposable development shape has no
compatibility claim on the first-public one.

**The built `Space` keeps `graphs` as a derived flatten** across its Layouts,
alongside the existing `graphsById` index. That is what holds this ticket's
blast radius down: colour assignment, handle derivation, render Edge
derivation, the canvas projection and Navigation all read `space.graphs` and
none of them changes. Add an owner lookup beside the index so a Graph can answer
which Layout holds it.

Reference validation changes in three ways:

- **A Graph id repeated anywhere in the Space is a load error naming both owning
  Layouts.** The id is unique across the Space although ownership is
  Layout-scoped (ADR 0045), because the flatten keys colour, handles, Edge ids
  and activation on the id alone — and `graphsById` is built with `new Map`, so
  a duplicate today drops one Graph from the index in silence while it stays in
  the collection. Do not answer this by owner-qualifying Graph references
  through the render pipeline; that alternative is weighed and rejected in the
  ADR, and it costs the `::out`/`::in` handle scheme two libraries depend on.
- **Every Edge endpoint of an owned Graph names a Card in that Layout** — its
  position keys are its membership. One rule, no kinds, no conditions.
- **A Layout's Graph collection is non-empty and ordered.** A Layout with none
  is invalid.

`resolveGraphs` answers a selected Layout with the Graphs it owns, and an
Algorithmic View — whose subject is the Space's Cards — with every Graph
flattened across every Layout. The flatten is derived and never stored.

**Leave the omitted-Card fallback band alone.** Package 5 of the handoff builds
its replacement (Cards View, Add to Layout). Between here and there, a Card a
Layout omits would otherwise render nowhere with no surface able to reach it.

## Green bar

The first commit above is fully green — `pnpm verify` and `pnpm e2e` both pass,
with no e2e file touched. Prove that before starting the structural change; it
is the only point on this branch where the whole bar is available, and it is
what makes the format-ownership change independently verifiable.

For the structural change that follows, **`pnpm verify` will be red, and that is
correct** — `pnpm typecheck` runs one program spanning every package's `src`
*and* `test`, so nothing typechecks until `04` has migrated the last consumer.
Do not add a compatibility shim, a cast or a temporary field to turn it green.

The bar for this ticket is the scoped one, and it must pass:

```
pnpm --filter @project/core typecheck
pnpm --filter @project/graph typecheck
pnpm vitest run packages/core packages/graph
```

Migrate `packages/core/test` and `packages/graph/test` here, with this ticket,
rather than leaving them for the integration ticket to discover.

## Acceptance criteria

- [ ] `inHandleId` and `outHandleId` are offered from `@project/graph` and are
      the only producers of the handle-id format; no package retypes it.
- [ ] The index doc block no longer cites them as an instance of the curation
      rule, and the surface test lists them.
- [ ] That commit passes `pnpm verify` and `pnpm e2e` on its own, with no e2e
      file touched.
- [ ] The normal, document, snapshot and import schemas all carry `version: 1`,
      no Space-level `graphs`, and a Layout-owned `graphs` of full Graph values.
- [ ] A version 2 document fails intake with an error naming the version, not a
      cascade of shape errors.
- [ ] `loadSpace` and `loadSpaceSnapshot` flatten owned Graphs into the Space's
      collection and index; a Graph can answer its owning Layout.
- [ ] A Space carrying one Graph id in two Layouts is a named load error
      identifying both owners — proved by a test, not by the absence of one.
- [ ] An owned Edge whose endpoint is not a member of that Layout is a named
      reference error; a property test covers it.
- [ ] A Layout with an empty Graph collection is invalid.
- [ ] `resolveGraphs` answers a Layout with its own Graphs and an Algorithmic
      View with the flatten; a test covers a flatten crossing two Layouts.
- [ ] The fallback band and its guards are untouched.
