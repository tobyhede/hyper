# Graph identity is unique within the Space

Status: accepted
Refines: 0040, 0041
Related: 0030, 0069, 0079, 0104

A Graph belongs to exactly one Map, and its id is unique across the whole Space rather than only within that Map. Two Maps in one Space may not own Graphs carrying the same id. Intake refuses the document with `duplicate-graph-id`, one error per repeated id naming every occurrence, whether the repeats sit in one Map or in several (`packages/graph/src/validate.ts`; held by `packages/graph/test/space-intake.test.ts`, `graph.property.test.ts` and `test/unit/aggregate-refusal.test.ts`).

Ownership is unchanged. Which Map a Graph belongs to, the Resources its Edges are closed over, and which Map an Edit to it is written into are all ADR 0040's. Only the scope the id must be unique in moves. ADR 0040 said Route identity is scoped to the owning Layout, and ADR 0041 carried that forward as an owner-scoped `getGraph(layout, graphId)` lookup. Neither is what is built.

## Why the Space and not the Map

Every reader that resolves a Graph by id resolves it without a Map:

- **Lookup.** `space.lookup.graph(id)` (`packages/graph/src/lookup.ts`) is one Space-wide index that answers a Graph together with its owning Map. A caller holding only a Graph id gets the owner back, rather than having to know it first.
- **Address.** The canonical Graph URL is `/spaces/:spaceId/graphs/:graphId` (ADR 0069). It names no Map, and the owning Map is found from the id.
- **Render keys.** `graphColorsByGraphId` reads colour off `space.graphs`, the derived flatten of every Map's Graphs, keyed by id alone. A render Edge's id is `${graphId}::${from}::${to}` (ADR 0104). Two Graphs sharing an id would share a colour slot and collide on Edge ids.

A duplicate id would make each of these answer one Graph and silently drop the other, while both stayed in the document.

The uniqueness is within one Space. Graph ids live inside the Space document, and nothing resolves one outside its own Space (ADR 0030), so a Graph id may repeat in another Space.

## Rejected: Map-scoped Graph ids

Letting each Map scope its own Graph ids would need every lookup to take a `(map, graph)` pair, every render key to carry the Map, and the canonical Graph URL to name a Map. That is a larger surface to defend an ability nobody uses: every Graph a gesture creates takes a freshly minted id, so no authoring path ever produces two Maps holding one.

This restates the rule superseded ADR 0045 carried, so that it has a live home.
