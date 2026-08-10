# Record the Route-to-Graph domain rename

Type: domain-modeling
Status: resolved
Blocked by: 07

## Question

How should the accepted pure rename from Route to Graph roll through the
first-public schema, domain types, operations, interfaces, package vocabulary,
ADRs, product language, tests, fixtures, and standing guidance without leaving
Route as a second concept or confusing the domain Graph with render and layout
graphs?

## ADR

[ADR 0041 — Graph is the first-public name for Route](../../../docs/adr/0041-graph-is-the-first-public-name-for-route.md)

## Answer

ADR 0041 makes Graph the sole first-public name for the Layout-owned curated
directed structure. The rename preserves identity, title, optional colour,
directed Edges, Layout ownership, authored order, activation, authoring,
traversal and presentation behavior. Route is not retained as an alias,
subtype, presentation path or compatibility concept. Graph navigation names the
working interaction and Traversal history names the transient Cards actually
visited; Walk is retired.

The first-public version 1 document has no Space-level connection collection.
Each Layout requires a non-empty ordered `graphs` collection, each Graph
requires an `edges` collection that may be empty, and optional `activeGraph`
falls back on read to the first Graph. Canonical export emits complete version 1
identities; import may omit persistence-owned ids only at its existing intake
seam. There is no version 2 compatibility parser, `routes` alias, dual write or
migration.

The core family becomes `graphSchema`, `graphEdgeSchema`, `Graph`, `GraphEdge`
and `GraphId`. `GraphEdge` is reserved for the authored `{from, to}` value. The
current handle-resolved projection becomes `GraphRenderEdge`; the layout-
strategy family becomes `LayoutStrategyGraph`/`Card`/`Port`/`Edge`; and the
React component `GraphView` becomes `SpaceCanvas`. The existing Algorithmic
View labelled Graph becomes Flow, while Graph product labels exclusively name
the authored entity. The `@project/graph` package remains because it is the
established domain-behavior module, not a competing entity.

Authoring and Navigation use Graph names throughout, resolve Graph identity
within its owning Layout, and carry `traversalHistory` rather than `walk`.
Persistence, HTTP payloads, CLI import/export, diagnostics, tests, fixtures,
CSS, accessibility text and planning specifications use the same vocabulary.
HTTP routes and graph-layout routing remain only as qualified technical uses of
the ordinary word “route”; they do not name a Hyper entity.

Historical ADR titles/bodies and resolved-ticket paths remain unchanged. Their
status blocks and current guidance point to ADR 0041. Implementation is a
separate behavior-preserving rename before further feature work, with ADR
0040's ownership transformation kept as a distinct structural change. No
feature code was renamed while resolving this ticket.
