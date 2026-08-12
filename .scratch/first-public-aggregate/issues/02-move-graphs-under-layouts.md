# Move Graphs under Layouts

Status: ready-for-agent
Blocked by: 01

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

First ticket on the shared branch. **`pnpm verify` will be red, and that is
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
