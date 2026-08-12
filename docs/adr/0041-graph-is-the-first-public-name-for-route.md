# Graph is the first-public name for Route

Status: accepted
Refines: 0003, 0007, 0014, 0015, 0024, 0025, 0027, 0028, 0030, 0031, 0032, 0033, 0035, 0040
Refined by: 0045
Related: 0010, 0034

The first-public domain calls the curated directed structure owned by a Layout
a **Graph**. This is an exact rename of the thing earlier decisions and the
built prototype call a Route. A Graph keeps the same identity, title, optional
colour, directed Edges, Layout ownership, authored order, activation,
authoring, traversal and presentation behaviour. Route does not remain as an
alias, subtype, presentation path or second connection structure.

The rename closes a mismatch between the old name and the model Hyper now
permits. The value is not a route through a predetermined sequence: it may be
empty, disconnected, branching, merging, cyclic and self-connected. A
traversal chooses one history through that structure; the authored value is the
Graph, not the history chosen through it. **Graph navigation** is the transient
working interaction and **Traversal history** is the ordered Cards actually
visited. `Walk` is retired rather than retained as another name for either.

This ADR decides vocabulary. Every invariant ADR 0040 records survives it
unchanged: every Graph belongs to exactly one Layout, every Edge endpoint names
a Card in that Layout, a Layout owns a non-empty ordered Graph collection and
always resolves one Active Graph, creating a Layout creates its initial empty
Active Graph in the same Edit, and Graph management cannot delete the final
Graph.

That is not the same as leaving the document contract untouched. The nesting of
Graphs under Layouts, the version number and the refusal of a compatibility path
are ADR 0040's decisions, restated below in the renamed vocabulary rather than
made here. The one contract clause this ADR adds is the refusal of a `route`-key
alias, which only a rename could create the need for.

## The first-public document

The one public document is version 1. The number restarts rather than continues.
The prototype opened at version 1 and became version 2 when persistence identity
moved to UUIDs (ADR 0030), so both earlier numbers named disposable pre-release
shapes and neither was ever public. Version 1 is therefore free to name the
first public contract, and a reader meeting 1 after 2 is seeing a restart rather
than a typo.

Graphs are nested values under their owning Layout; no Space-level `routes` or
`graphs` collection exists:

```json
{
  "version": 1,
  "id": "<space uuid>",
  "title": "Example",
  "layouts": [
    {
      "id": "<layout uuid>",
      "title": "Layout 1",
      "kind": "positioned",
      "positions": {
        "<card uuid>": { "x": 0, "y": 0 }
      },
      "graphs": [
        {
          "id": "<graph uuid>",
          "title": "Graph 1",
          "color": "#4f7cff",
          "edges": [{ "from": "<card uuid>", "to": "<card uuid>" }]
        }
      ],
      "activeGraph": "<graph uuid>"
    }
  ]
}
```

`layouts` remains optional. A Space with no Layout has no Graph. On a Layout,
`graphs` is required and non-empty; each Graph's `edges` is required and may be
empty. `activeGraph` is optional shape: when absent, the first Graph is the
read-time fallback, while a completed Layout Edit writes the resolved active
identity explicitly. `color` remains the JSON spelling and remains optional;
product prose uses “colour.” Canonical export writes version 1 and complete
identities. Import may omit persistence-owned Space, Card, Layout and Graph ids
at the existing import-only seam, and mints them before ordinary domain intake.

There is no compatibility parser, migration, dual-write period, version 2
export or `route`-key alias. Hyper is unreleased and its development data is
disposable. PostgreSQL continues to store and commit the complete Space
snapshot as one optimistic JSONB aggregate; nesting and naming do not create a
Graph table, repository operation or HTTP resource.

## Domain and module interfaces

The core schema and types use one exact family:

| Superseded name | First-public name |
| --- | --- |
| `routeEdgeSchema` | `graphEdgeSchema` |
| `routeSchema` | `graphSchema` |
| `importRouteSchema` | `importGraphSchema` |
| `RouteEdge` | `GraphEdge` |
| `Route` | `Graph` |
| `RouteId` | `GraphId` |
| `routes` | `graphs` |
| `activeRoute` / `activeRouteId` | `activeGraph` / `activeGraphId` |

`GraphEdge` is reserved for core's authored `{ from, to }` value. The current
`@project/graph` type also called `GraphEdge` is not that value: it is an Edge
prepared for rendering with a Graph identity and handle ids. It becomes
`GraphRenderEdge`. Its related render derivations use the same qualifier:
`GraphRenderHandleRef`, `buildGraphRenderEdges`, `filterHandlesByGraphs` and
`graphCardIds`. The current `routes.ts` render-derivation module becomes
`graph-rendering.ts`; Graph traversal remains in `traversal.ts`.

Traversal helpers take a `Graph`: `graphEntryCards`, `graphStartCard`,
`incomingEdges` and `outgoingEdges`. Lookup respects Graph identity's owner
scope: `getGraph(layout, graphId)` replaces a Space-wide `getRoute` lookup. A
validated `Space` has no Space-level `graphs` or `graphsById`; each indexed
Layout exposes its owned ordered Graphs and resolves ids within that owner.

Layout-strategy input is a different graph-shaped value and says so everywhere
it crosses a module interface. `LayoutGraph`, `LayoutCard`, `LayoutPort`,
`LayoutEdge`, `LayoutEdgeSection` and `buildLayoutGraph` become
`LayoutStrategyGraph`, `LayoutStrategyCard`, `LayoutStrategyPort`,
`LayoutStrategyEdge`, `LayoutStrategyEdgeSection` and
`buildLayoutStrategyGraph`. A local variable holding one is `strategyGraph`,
not `graph`. This is still the existing `LayoutStrategy` interface; the rename
does not add an intermediate arrangement type or a new seam.

The `@project/graph` package keeps its name. It is the established module for
validated Space intake, Graph behaviour and layout strategies, and renaming it
would move package boundaries without resolving a domain ambiguity. Its
curated export rule remains unchanged. No `@project/routes` compatibility
package, re-export or deprecated alias is introduced.

## Authoring, navigation and rendering

Every caller-facing authoring and navigation name follows the domain:
`activateGraph`, `addGraph`, `deleteGraph`, `activeGraphId`, `mintedGraphId`,
Graph title and colour drafts, and Graph-scoped connection validation. A
connection still authors an Edge in the Active Graph; activation remains
navigation and not an Edit. Space Authoring continues to expose complete
semantic operations and validated Space transitions rather than leaking
partial mutations or render events.

Navigation stores **Traversal history**, never a `Walk`. Presenting and working
Graph navigation each own the transient history needed to retreat through the
path actually taken; neither persists it in the Space or infers it from
incoming Edges. Interfaces and state use `traversalHistory` where the value must
be named. Generic verbs such as `advance`, `retreat` and `selectBranch` may stay
when their owner already supplies the Graph-navigation or Presenting context.

The React Flow adapter uses `GraphEmphasis`, `ColorByGraphId`,
`projectGraphEdges`, `GraphHud`, `GraphLegend`, `GraphSelector`,
`GraphConnectionLine` and Graph-qualified ids, classes and test ids. The
existing React component `GraphView` becomes `SpaceCanvas`: it renders the
selected Algorithmic View or Layout and may present the Active Graph, so it is
neither a domain Graph nor a domain View. `GraphViewProps`, its test filename
and references follow that name.

The existing application-supplied Algorithmic View whose id and label are
`graph` / **Graph** becomes `flow` / **Flow**. Its strategy and behaviour do not
change. “Graph” in product controls then always names the authored Graph:
**Active Graph**, **Add Graph**, **Graph manager**, **Delete Graph**, **Select
Graph Target**, **Present this Graph**, **End of Graph** and **Graph has no
Edges**. The Cards View keeps its name and remains a distinct collection View;
neither View is defined by where it is mounted.

## Persistence, transport, CLI and verification vocabulary

Snapshots, repository fixtures, memory adapters and PostgreSQL tests carry the
version 1 `layouts[].graphs` shape. Import mints missing Graph ids within their
Layout, validates duplicates within that owner and reports Graph vocabulary.
Export emits `graphs` and `activeGraph` deterministically inside each Layout.
CLI diagnostics say Graph and use paths such as
`layouts.0.graphs.0.edges.0.from`. HTTP request and response bodies inherit the
same runtime schemas; the `/api/spaces` resource tree and optimistic protocol
otherwise do not change.

Lowercase **route** remains valid only as established transport or graph-layout
terminology: an HTTP route serves a request, and an engine routes an Edge's
geometry. Such uses are qualified by their module or sentence and do not name a
Hyper entity. They are not mechanically changed to Graph. Conversely, user
messages, diagnostics, accessibility text and test descriptions about the
authored entity must say Graph.

Tests, properties, constants, builders and fixtures follow the public names:
`GRAPH_ID`, `graph`, `graphs`, Graph-owned duplicate/reference error kinds and
Graph-focused descriptions. Files named for the old module or product surface
are renamed (`routes.test.ts`, `GraphView.test.tsx`, and equivalent fixtures),
while tests of generic mathematical or layout graphs receive a qualifier such
as Space validation, render graph or layout-strategy graph. CSS selectors,
test ids and accessibility labels change with the product vocabulary rather
than preserving `route` as an invisible compatibility surface.

Accepted ADR bodies and titles remain historical and are not rewritten. Their
status blocks point here, and current guidance reads Graph wherever a still-
binding decision says Route. Resolved issue filenames and quoted historical
questions may likewise retain Route as provenance, but current maps,
specifications, handoff plans and new tickets use Graph. `AGENTS.md` records the
temporary code/document divergence until the implementation rename lands, then
that exception is removed.

## Roll-forward discipline

The implementation rename runs as a dedicated behaviour-preserving change,
ahead of feature work that would add more names in the obsolete vocabulary.
The ADR 0040 ownership transformation remains a separate structural change so
its diff does not hide inside a rename. Both changes target only the final
version 1 document; separation of implementation commits does not authorize a
compatibility format or a released intermediate shape.

The implementation is complete only when a case-sensitive repository scan
finds no domain `Route`, `RouteId`, `RouteEdge`, `activeRoute`, `routes` or
`Walk` outside explicitly historical records and qualified HTTP/layout-routing
prose. The normal `pnpm verify` and `pnpm e2e` bars apply, and the PostgreSQL
integration suite proves the same vocabulary through import, storage, load and
export.

## Rejected alternatives and cost

We rejected keeping Route as the presentation traversal over a more general
Graph. The traversal is transient behaviour over the same authored Edges, not
a second value worth owning, identifying or synchronising. We rejected
`DomainGraph` or `HyperGraph` as defensive prefixes: they weaken the ubiquitous
language and make every domain caller pay for collisions created by adapters.
Render and strategy intermediates are the values that need qualification. We
also rejected renaming the `@project/graph` package as part of this decision;
that would be a package-boundary redesign disguised as terminology work.

The accepted cost is a deliberately broad pre-release rename across documents,
types, interfaces, product copy, CSS, tests and fixtures. Historical ADRs still
contain Route and therefore require readers to follow their refinement links.
That cost is smaller than carrying two first-public nouns whose apparent
difference the model cannot explain.
