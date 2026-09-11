# Graph-Native Technical Presentations

A local prototype that proves one idea:

> A technical deck can be authored as Markdown things on a spatial graph, then presented as a curated Graph through that graph.

Content can be authored in version-controlled files and imported into the live persistence model. A space directory holds a space file naming the diagrams and the graphs each one owns, plus one Markdown file per thing. [React Flow](https://reactflow.dev) draws **every** Graph at once, each in its own colour, at the positions the diagram authored. A Thing exposes an outbound handle for each Graph with an outgoing Edge and an inbound handle for each Graph with an incoming Edge (the "multiple handles" approach). Choosing a Graph in the toolbar emphasises it without hiding the others.

**Presenting is the same canvas, closer in.** There is no deck and no second surface ([ADR 0024](docs/adr/0024-presenting-is-traversing-a-route.md)): pressing Present moves React Flow's camera to the Graph's first thing and draws that thing's content rendered. Arrow keys traverse the Graph's edges — Right follows the selected one, Left goes back along the path taken, Up and Down choose among a fork's branches without moving the camera ([ADR 0027](docs/adr/0027-presenting-is-the-graph-canvas-under-camera-control.md)).

## Running it

Requirements: Node ≥ 26.8.1 and pnpm 9. Local PostgreSQL also requires Docker
Engine or Docker Desktop with Compose v2.

```sh
pnpm install
pnpm dev             # PostgreSQL-backed app at http://localhost:5173 (needs the database up)
pnpm dev:new         # fresh one-thing memory space at http://localhost:5174
pnpm dev:fixture     # tracked test fixture in memory at http://localhost:5175
```

Then:

1. Pick a Graph in the toolbar. Every Graph stays drawn; the one you pick is emphasised.
2. Hover a Markdown Thing and use its Edit control to author its Title and Markdown source. `Esc` cancels and closes it.
3. Drag a thing to move it. A completed edit is committed automatically through the persistence session; the toolbar reports `Persisting…` and then `Persisted`. Under `pnpm dev` the edit lands in PostgreSQL and outlives the page; under `pnpm dev:new` and `pnpm dev:fixture` it lives in that server's memory repository, surviving browser reloads but not a restart.
4. Hover or select a thing to reveal its four authoring handles. Drag to another thing to add an Edge to the active Graph. Dropping on empty canvas cancels unless Option (macOS) or Alt (elsewhere) is held; the modifier gesture previews and atomically creates a blank `Thing N`, its placement and the Edge.
5. Press **Present** to traverse the Graph: `→` follows an edge, `←` goes back, `↑` / `↓` choose at a fork, `Esc` returns to the overview.
6. Watch the address bar. The Space, a Diagram, a Thing, a Graph and each Active Thing reached while Presenting have durable URLs built from their UUIDs ([ADR 0069](docs/adr/0069-entities-have-durable-web-addresses.md)); the Sidebar and the presenting chrome offer **Copy link** for the current one, browser Back and Forward follow the entries, and a pasted link reopens the same place. Resolving a URL is navigation, never authoring.

The graph uses React Flow's multiple-handles approach: a thing declares one handle pair per Graph, spread evenly down its sides, so the coloured Graph edges stay legible where several Graphs run through one thing.

### Verify

```sh
pnpm verify         # typecheck + lint + prettier check + unit/property tests
pnpm e2e            # Playwright flow (each test boots its own isolated server)
pnpm e2e:fixture    # only scenarios backed by the tracked fixture
```

Both commands create and dispose an isolated server per test automatically. They differ in what those servers hold: `pnpm e2e:fixture` runs only the tracked-fixture project, while `pnpm e2e` also runs `new-space`, whose servers start from an empty catalog so startup mints the one-thing new space. They need the Chromium browser once: `pnpm exec playwright install chromium`.

### Local PostgreSQL

Local PostgreSQL is opt-in; `pnpm verify` and `pnpm e2e` do not require it.
Copy the credential-free template:

```sh
cp .env.example .env
```

In `.env`, choose a URL-safe password and use it in both blank values:

```dotenv
POSTGRES_PASSWORD=<your-local-password>
DATABASE_URL=postgresql://hyper:<your-local-password>@127.0.0.1:55432/hyper
```

Then start PostgreSQL 17.5, run the real database test, and stop the container:

```sh
pnpm postgres:up
pnpm test:integration:postgres
pnpm postgres:down
```

The integration command emits the Prisma Next contract, applies pending
migrations, and performs a typed space/thing JSONB write and read. To run only
the schema steps:

```sh
pnpm contract:emit
pnpm db:migrate
```

Compose and Hyper's Prisma config/runtime read the same ignored `.env`;
deployed environments should inject `DATABASE_URL` through their secret
manager. `pnpm postgres:down` keeps the named data volume. To delete local
database state, run the destructive reset `docker compose down --volumes`.

## The space format

A space is a **space directory**: a space file (`space.json`) plus one Markdown file per thing. Things are not listed anywhere — a thing exists because its file does ([ADR 0020](docs/adr/0020-a-card-is-a-markdown-file-with-frontmatter.md)), and they are discovered by scanning two locations **non-recursively**: `*.md` beside the space file, and `things/*.md`. The bundled example lives in [`packages/app/example`](packages/app/example).

"Manifest" is retired, as a word and as a type ([ADR 0010](docs/adr/0010-space-is-the-root-loaded-by-loadspace.md)): the top-level value is a **Space**, and it is minted only by `loadSpace`.

### Durable URLs and HTTP resources

Every addressable entity has a durable product URL built from its UUID. Product URLs encode UUIDs as unpadded 22-character base64url values; titles never participate in identity. A URL may name an entity canonically or add the Diagram and Graph context needed to reopen the same canvas or Active Thing while Presenting:

| Product URL | Destination |
| --- | --- |
| `/spaces/:spaceId` | Space |
| `/spaces/:spaceId/things/:thingId` | Thing, using the Space's current Diagram when it contains the Thing |
| `/spaces/:spaceId/graphs/:graphId` | Graph in its owning Diagram |
| `/spaces/:spaceId/diagrams/:diagramId` | Authored Diagram |
| `/spaces/:spaceId/diagrams/:diagramId/things/:thingId` | Thing in an explicit Diagram |
| `/spaces/:spaceId/diagrams/:diagramId/graphs/:graphId` | Graph in an explicit Diagram |
| `/spaces/:spaceId/diagrams/:diagramId/graphs/:graphId/present/:thingId` | Presenting at its Active Thing |

These are navigation addresses, not persistence resources: resolving one never edits a Diagram, Active Graph or Thing. The browser and Node host share the same destination contract, so malformed addresses receive `400`, unresolved entities receive `404`, and direct requests return the same application destination that client-side navigation opens ([ADR 0069](docs/adr/0069-entities-have-durable-web-addresses.md)).

The JSON API deliberately stays smaller and keeps UUIDs in canonical spelling:

| HTTP resource | Purpose |
| --- | --- |
| `GET /api/spaces` | List stored Spaces and revisions |
| `GET /api/spaces/:uuid` | Load one Space snapshot and revision |
| `PUT /api/spaces/:uuid` | Commit a complete Space snapshot against an expected revision |

Things, Diagrams and Graphs are parts of the Space aggregate, so they have product URLs but no independent persistence endpoints. API failures use RFC 9457 Problem Details (`application/problem+json`).

### `space.json`

```json
{
  "version": 1,
  "id": "00000000-0000-4000-8000-000000000041",
  "title": "Graph-Native Technical Presentations",
  "diagrams": [
    {
      "id": "00000000-0000-4000-8000-000000000048",
      "title": "Working",
      "positions": {
        "00000000-0000-4000-8000-000000000027": { "x": 0, "y": 0, "open": false },
        "00000000-0000-4000-8000-000000000043": { "x": 340, "y": 0, "open": false }
      },
      "graphs": [
        {
          "id": "00000000-0000-4000-8000-000000000004",
          "title": "Main walkthrough",
          "color": "#6ea8fe",
          "edges": [
            {
              "from": "00000000-0000-4000-8000-000000000027",
              "to": "00000000-0000-4000-8000-000000000043"
            }
          ]
        }
      ],
      "activeGraph": "00000000-0000-4000-8000-000000000004"
    }
  ],
  "defaultDiagram": "00000000-0000-4000-8000-000000000048"
}
```

| Key | Meaning |
| --- | --- |
| `version` | `1` is the first-public shape. Version 2 was the disposable pre-release one, which carried a space-level `graphs` array beside diagrams that owned none; Hyper is unreleased, so it is rejected by name rather than migrated ([ADR 0040](docs/adr/0040-layouts-own-card-membership-and-routes.md)). |
| `id`, `title` | What names the space. Every explicit id is a UUID; an import may omit ids for the persistence layer to allocate. The id is not the title and not the file name. |
| `diagrams` | Optional authored thing-to-position maps ([ADR 0014](docs/adr/0014-layout-is-the-authored-data-strategy-is-the-behaviour.md)). A diagram's position keys **are** its thing membership: sparse relative to the space — it may omit things, but may not name one the space lacks. Each diagram owns a non-empty ordered `graphs` collection and may name which of them opens **active** (`activeGraph`; absent means the first it owns) — [ADR 0026](docs/adr/superseded/0026-a-route-is-active-and-the-layout-may-name-it.md). A space with no diagrams has no graphs, which is what a **new space** is: it renders and cannot be presented ([ADR 0015](docs/adr/0015-a-space-may-have-no-routes.md)). |
| `diagrams[].graphs` | Named walkthroughs, each an `id`, `title`, optional `color`, and a set of `{ from, to }` **edges** between things **of that diagram** ([ADR 0032](docs/adr/0032-routes-may-contain-cycles.md)). Forks, merges, disconnected components, cycles and self-edges are legal; an exact duplicate Edge within one Graph is not, and an endpoint naming a thing the owning diagram omits is a load error. A graph belongs to exactly one diagram, and there is no space-level collection beside them ([ADR 0040](docs/adr/0040-layouts-own-card-membership-and-routes.md)); its id is nonetheless unique across the whole space, because a view drawing every graph flattened across diagrams keys colour, handles and activation on that id alone ([ADR 0045](docs/adr/superseded/0045-a-view-takes-cards-and-graphs-and-returns-a-layout.md), superseded by [ADR 0079](docs/adr/0079-v1-exposes-only-layouts-and-first-open-initializes-one.md)). The edge set may be empty. Graphs are a diagram's only connection structure ([ADR 0007](docs/adr/0007-routes-are-the-only-structure.md)), and the drawn edges and handles are derived from them. |
| `defaultDiagram` | The declared Diagram UUID the Space opens in. |

### Graphs as color-coded flows

Each authored edge becomes a colored drawn edge, and each thing a Graph leaves gains a `<graphId>::out` handle (right) while each thing it arrives at gains a `<graphId>::in` handle (left) — one per Graph per side, so a fork's several outgoing edges share one handle. `@project/graph` derives the handles (`buildThingHandles`) and edges (`buildGraphRenderEdges`), then assembles the graph to arrange (`buildLayoutStrategyGraph`); `@project/react-flow-adapter` applies a `LayoutStrategy` and colors the projection. Switching graphs changes emphasis, not visibility or placement.

### Markdown things

A thing is **one file**: frontmatter, then body ([ADR 0020](docs/adr/0020-a-card-is-a-markdown-file-with-frontmatter.md), refined by [ADR 0051](docs/adr/0051-card-kinds-own-everything-beyond-the-title.md)). Shared frontmatter carries `id`, `title` and `kind`; an Alias adds its `target`, while everything after a Markdown Thing's fence is its content. A thing can be visited by any number of graphs — that reuse is the whole point, and a thing shared by several graphs carries one handle pair per Graph running through it.

A thing's identity is its frontmatter `id`, never its filename, so renaming the file is not a data migration. Since the title lives in the same file as the body, a body may open with a heading — it is just a heading, not a repeat of a title held somewhere else.

The graph draws a closed Thing's **title**, not its body ([ADR 0006](docs/adr/superseded/0006-cards-show-titles-in-the-graph.md)). Opening a Markdown Thing expands it in place and renders its Markdown content on the Thing ([ADR 0064](docs/adr/0064-opening-a-card-expands-it-in-place.md)); editing its source is a separate action. The same renderer shows the Active Thing while presenting, so content is not embedded in every closed node.

A thing occupies exactly one position in the graph; there is no placement layer letting the same thing sit in two places. Showing the same content at a second position is the job of an **alias** thing ([ADR 0004](docs/adr/0004-cards-are-the-graph.md)).

Validation happens in two layers:

- **Shape** — Zod schemas (`@project/core`) validate the space file and each thing file's frontmatter.
- **References** — `@project/graph` checks that both ends of every Graph Edge resolve to a Thing, that no Graph contains an exact duplicate Edge, that a Diagram positions and shows only Things the Space has, and flags duplicate ids. Unresolved references are surfaced as a banner in the app rather than crashing it.

`@project/graph` also derives the Graph handles and edges (`buildThingHandles`, `buildGraphRenderEdges`); `@project/react-flow-adapter` projects colored thing nodes and edges (`projectThingNodes`, `projectGraphEdges`).

### Diagrams

A **Diagram** is authored data: a named thing-to-position map stored with the space. A **LayoutStrategy** is behaviour: it takes the layout-strategy graph to arrange and asynchronously returns that same value with geometry on its things and handles ([ADR 0014](docs/adr/0014-layout-is-the-authored-data-strategy-is-the-behaviour.md)):

```ts
type LayoutStrategy = (graph: LayoutStrategyGraph) => Promise<LayoutStrategyGraph>;
```

Two ship, both in `@project/graph`. `gridStrategy` is a pure automatic strategy that places things on a grid, and nothing selects it today. `positionedStrategy` reads an authored Diagram, and it is what the canvas draws. An automatic arrangement returns as a destructive Edit over a Diagram rather than as a render path, which is what took elkjs out of the tree ([ADR 0086](docs/adr/0086-automatic-arrangement-is-an-edit-not-a-render-path.md)). Which things a strategy arranges is the view's choice, not the strategy's.

## Architecture

A pnpm workspace with strict TypeScript and enforced package boundaries:

| Package | Responsibility |
| --- | --- |
| `@project/core` | Domain types + Zod schema. No framework code. |
| `@project/graph` | Pure graph/Graph logic: intake and indexing, lookups, Graph navigation, referential validation, Graph→handles/edges derivation, and the `LayoutStrategy` contract. Property-tested. |
| `@project/persistence` | Browser-safe backend and session contracts, optimistic revisions, commit coalescing, failure/conflict handling, and the memory adapter. |
| `@project/react-flow-adapter` | Owns React Flow projection and every React Flow specific. Applies a `LayoutStrategy` and projects the domain model into coloured React Flow Thing nodes and Edges. |
| `@project/ui` | Reusable, framework-agnostic React: thing renderer, Graph selector, Graph legend, presentation controls, app shell. |
| `@project/app` | Wiring: Navigation, Space Authoring and Edge Authoring, product-URL navigation over the browser History API (no router library), the Zustand-backed render adapter, the canvas and its cameras, the example presentation, and Vite. |

Design rules kept throughout: domain logic stays out of React components, React Flow specifics stay in the adapter, and app wiring stays in `@project/app`.

### Tests

- Schema validation and rejection cases (`@project/core`).
- Unresolved thing/edge/Graph-step references and duplicate ids (`@project/graph`).
- Graph navigation behaviour, with fast-check property tests for clamping/monotonicity and validation invariants.
- React Flow projection correctness (`@project/react-flow-adapter`).
- Thing rendering smoke test (`@project/ui`).
- Playwright flows: app loads, the graph is visible, a Graph is selected, things open, a completed drag reaches the backend and survives a reload, a drawn connection mints and activates a Graph, and a Graph is traversed under the camera.

## Current limitations

- **Thing authoring is intentionally narrow.** Markdown source, Titles and Alias Targets are editable, while visual editing, freehand drawing and whiteboard shapes are not built. Thing, placement and Edge edits commit through the HTTP persistence session: under `pnpm dev` they land in PostgreSQL and outlive the page, and under `pnpm dev:new` they survive a browser reload but not a server restart.
- **The app never touches files.** The browser lists, opens and commits Spaces under `/api/spaces` and nothing else; file discovery and parsing are server-side CLI and import concerns. There is no write-back and no file picker. Canonical file export belongs to the `hyper` CLI ([ADR 0030](docs/adr/0030-postgres-is-the-live-write-model.md)), which regenerates a deterministic version 1 space directory from the database and records the revision it projected.
- **Overlay legibility.** The graph draws every Graph at once. Only **compatible** graphs — the union of their edges is acyclic — lay out cleanly as parallel forward paths; two graphs disagreeing about the order of things they share force a backward edge, and nothing routes an edge around a thing — every edge is the bezier React Flow draws, so a backward one curls back on itself. See [`.scratch/multiple-routes/findings.md`](.scratch/multiple-routes/findings.md).
- **Things are a fixed shape.** A thing draws its title, so every thing is the same size — declared once in `packages/app/src/thing.ts` as a 16:9 ratio and consumed by both the layout and the stylesheet. Content adapts to the thing, not the reverse, which is why a measured DOM size never decides placement.
- **Structural authoring is partial.** Dragging between spatial handles draws an Edge, and the first one mints and activates `Graph 1` ([ADR 0033](docs/adr/0033-route-authoring-uses-spatial-route-coloured-handles.md)). Option/Alt plus an empty drop atomically creates and connects a blank `Thing N`. There is no detached Thing creation, and deleting Things, Edges or Graphs is deliberately disabled until those operations can complete through the same persisted-Edit lifecycle. Broader Graph management is also unbuilt.
- **No speaker view, timer, transitions or deck export.** They went with the deck framework and return, if wanted, as their own decisions designed against a traversal ([ADR 0024](docs/adr/0024-presenting-is-traversing-a-route.md)).
- **The presented thing is scaled by the camera**, so its text is rasterised rather than laid out at its final size — a property of wanting a spatial camera at all.
- The production bundle ships React Flow in a single chunk — fine for a prototype, not tuned for size. The ~2.1 MB figure recorded here was measured with elkjs in the bundle and has not been remeasured since it left.

## Next likely improvements

- Structural deletion for Edges, Things and Graphs through the completed-Edit lifecycle.
- Detached Thing creation, without requiring an Edge from an existing Thing.
- Thing content and metadata editing, plus creation, naming, recolouring and reordering of additional Graphs.
- Authored camera hints (zoom/pan/highlight several nodes) and move transitions in the space file.
- A traversal-native speaker view: current and next Thing, notes, and elapsed time.
