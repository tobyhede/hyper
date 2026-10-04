# Reading path: where to read before you work

> **Non-normative pilot specimen** (`.scratch/adr-consolidation/issues/01-prove-map-graph-pilot.md`). This page stands in for the routing guidance a contributor would meet in `AGENTS.md`, for a reading-path evaluation only. It adopts no policy and changes no accepted decision. Only the Map and Graph topic has a current contract here; every other topic keeps its existing route.

## The project in brief

Hyper is a local prototype for graph-native technical presentations. A **Space** holds Markdown and other **Resources**. Each **Map** places a chosen subset of them on a canvas, and the **Graphs** a Map owns connect them with directed Edges that a presentation traverses. Placement is authored, not computed. PostgreSQL is the write model, reached over HTTP. Shared vocabulary is defined once, in [CONTEXT.md](../../../../CONTEXT.md).

## Task routing

### Maps, Graphs, placement, Open/Close, initialization, layout strategies

Read **[maps-and-graphs.md](maps-and-graphs.md)** first, before the code, if your task does any of the following:

- adds, deletes, selects or defaults a Map, or touches `defaultMap`
- adds, deletes, orders or activates a Graph, or touches `activeGraph`
- adds a Resource to a Map, removes it from one, or deletes it from the Space, where Map membership or Edges are affected
- changes Open, Close, Resize, Open Size, or how neighbours are displaced
- changes how a new Space is created, or how a stored or imported Space without a Map is first opened
- changes the layout strategy contract, or adds or proposes an automatic arrangement (Auto-arrange) or a new automatic strategy

It also applies if you touch any of these paths:

- `packages/graph/src/layout.ts`, `positioned.ts` or `grid.ts`
- `packages/graph/src/new-space.ts`
- `packages/graph/src/placement.ts` or `snapshot-edits.ts` (the open, close, resize, add-to-Map, remove-from-Map and delete-from-Space Edits)
- `packages/graph/src/validate.ts`, for Map, Graph or Edge refusals
- `packages/core/src/schema.ts`, for the Map, Graph or position schemas
- `packages/persistence/src/working-space.ts` (first working load)
- `packages/persistence/src/session-registry.ts` `deleteMap` and `deleteGraph`, and `packages/persistence/src/space-resource-planning.ts` `planContextDeletion` (Map and Graph deletion, its survivor and `defaultMap` movement)
- `packages/app/src/map-resolution.ts`, `placement-rendering.ts` or `navigation.ts` (Graph activation)
- `packages/app/src/map-authoring-commands.ts` and `graph-authoring-commands.ts` (Add, Delete and their availability, including the last Map and the last Graph)
- `packages/app/src/space-authoring.ts`, for `created-map`, `added-graph`, and which Edit target records `defaultMap`
- `packages/app/src/snapshot.ts` `updatePositionedMap`

The contract states each rule with its reason, the alternatives that were rejected, what is accepted but not built, and one point still awaiting a decision (D21, whether an Edit through a drawn Map should record `defaultMap`). Follow its source ADR links only when you need deeper history or the full argument for a rejected alternative. Do not treat code as the design: an accepted rule can be ahead of the code, and code alone never retires a rule.

### Everything else

Use the existing route. In `AGENTS.md`, see "Decided — read these before the code" and the "Agent skills" section, which point to:

- `docs/agents/editing-and-persistence.md`: `SpaceBackend`, `SpaceSession`, the completed-edit lifecycle, `packages/persistence`, `migrations/**` and `src/prisma/**`. Its Map/Graph model is covered by `maps-and-graphs.md` for this pilot.
- `docs/agents/rendering.md`: React Flow, handles, Edge geometry and lanes, the camera, Edge Authoring and `packages/react-flow-adapter`.
- `docs/agents/http.md`: `packages/http`.
- `docs/agents/ui.md`: `packages/ui`, panes, menus, the Command Dock, and feedback surfaces. Production UI work starts with the `shadcn-first-ui` skill.
- `docs/agents/build-tooling.md`, `docs/agents/anti-slop.md` and `docs/agents/workflow.md`: tooling, typing patterns, and how work moves to a commit.
- `docs/adr/README.md`: the decision catalogue, for any topic without a current contract.

Some neighbouring topics are deliberately **not** in the Map and Graph contract and keep the existing route. These are what a Graph may contain (cycles, forks, duplicate Edges), Edge anchors, lanes and head shapes, and Space Resource selection and framing beyond relocation on deletion.
