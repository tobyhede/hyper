# Graph-Native Technical Presentations

A local prototype that proves one idea:

> A technical deck can be authored as Markdown cards on a spatial graph, then presented as a curated Graph through that graph.

Content can be authored in version-controlled files and imported into the live persistence model. A space directory holds a space file naming the layouts and the graphs each one owns, plus one Markdown file per card. [React Flow](https://reactflow.dev) draws **every** Graph at once, each in its own colour, and [elkjs](https://github.com/kieler/elkjs) lays them out automatically (layered, left→right). A Card exposes an outbound handle for each Graph with an outgoing Edge and an inbound handle for each Graph with an incoming Edge (the "multiple handles" approach). Choosing a Graph in the toolbar emphasises it without hiding the others.

**Presenting is the same canvas, closer in.** There is no deck and no second surface ([ADR 0024](docs/adr/0024-presenting-is-traversing-a-route.md)): pressing Present moves React Flow's camera to the Graph's first card and draws that card's content rendered. Arrow keys traverse the Graph's edges — Right follows the selected one, Left goes back along the path taken, Up and Down choose among a fork's branches without moving the camera ([ADR 0027](docs/adr/0027-presenting-is-the-graph-canvas-under-camera-control.md)).

## Running it

Requirements: Node ≥ 24 and pnpm 9. Local PostgreSQL also requires Docker
Engine or Docker Desktop with Compose v2.

```sh
pnpm install
pnpm dev             # PostgreSQL-backed app at http://localhost:5173 (needs the database up)
pnpm dev:new         # fresh one-card memory space at http://localhost:5174
pnpm dev:fixture     # tracked test fixture in memory at http://localhost:5175
```

Then:

1. Pick a Graph in the toolbar. Every Graph stays drawn; the one you pick is emphasised.
2. Hover a Markdown Card and use its Edit control to author its Title and Markdown source. `Esc` cancels and closes it.
3. Drag a card to move it. A completed edit is committed automatically through the persistence session; the toolbar reports `Persisting…` and then `Persisted`. Under `pnpm dev` the edit lands in PostgreSQL and outlives the page; under `pnpm dev:new` and `pnpm dev:fixture` it lives in that server's memory repository, surviving browser reloads but not a restart.
4. Hover or select a card to reveal its four authoring handles. Drag to another card to add an Edge to the active Graph. Dropping on empty canvas cancels unless Option (macOS) or Alt (elsewhere) is held; the modifier gesture previews and atomically creates a blank `Card N`, its placement and the Edge.
5. Press **Present** to traverse the Graph: `→` follows an edge, `←` goes back, `↑` / `↓` choose at a fork, `Esc` returns to the overview.

The graph uses React Flow's [elkjs multiple-handles technique](https://reactflow.dev/examples/layout/elkjs-multiple-handles): ELK lays out the nodes and computes each port's position, and those exact offsets are applied to the handles so connected handles line up and the colored Graph edges stay legible.

### Verify

```sh
pnpm verify         # typecheck + lint + prettier check + unit/property tests
pnpm e2e            # Playwright flow (each test boots its own isolated server)
pnpm e2e:fixture    # only scenarios backed by the tracked fixture
```

Both commands create and dispose an isolated server per test automatically. They differ in what those servers hold: `pnpm e2e:fixture` runs only the tracked-fixture project, while `pnpm e2e` also runs `new-space`, whose servers start from an empty catalog so startup mints the one-card new space. They need the Chromium browser once: `pnpm exec playwright install chromium`.

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
migrations, and performs a typed space/card JSONB write and read. To run only
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

A space is a **space directory**: a space file (`space.json`) plus one Markdown file per card. Cards are not listed anywhere — a card exists because its file does ([ADR 0020](docs/adr/0020-a-card-is-a-markdown-file-with-frontmatter.md)), and they are discovered by scanning two locations **non-recursively**: `*.md` beside the space file, and `cards/*.md`. The bundled example lives in [`packages/app/example`](packages/app/example).

"Manifest" is retired, as a word and as a type ([ADR 0010](docs/adr/0010-space-is-the-root-loaded-by-loadspace.md)): the top-level value is a **Space**, and it is minted only by `loadSpace`.

### `space.json`

```json
{
  "version": 1,
  "id": "00000000-0000-4000-8000-000000000041",
  "title": "Graph-Native Technical Presentations",
  "layouts": [
    {
      "id": "00000000-0000-4000-8000-000000000048",
      "title": "Working",
      "positions": {
        "00000000-0000-4000-8000-000000000027": { "x": 0, "y": 0 },
        "00000000-0000-4000-8000-000000000043": { "x": 340, "y": 0 }
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
  "defaultRenderer": "00000000-0000-4000-8000-000000000048"
}
```

| Key | Meaning |
| --- | --- |
| `version` | `1` is the first-public shape. Version 2 was the disposable pre-release one, which carried a space-level `graphs` array beside layouts that owned none; Hyper is unreleased, so it is rejected by name rather than migrated ([ADR 0040](docs/adr/0040-layouts-own-card-membership-and-routes.md)). |
| `id`, `title` | What names the space. Every explicit id is a UUID; an import may omit ids for the persistence layer to allocate. The id is not the title and not the file name. |
| `layouts` | Optional authored card-to-position maps ([ADR 0014](docs/adr/0014-layout-is-the-authored-data-strategy-is-the-behaviour.md)). A layout's position keys **are** its card membership: sparse relative to the space — it may omit cards, but may not name one the space lacks. Each layout owns a non-empty ordered `graphs` collection and may name which of them opens **active** (`activeGraph`; absent means the first it owns) — [ADR 0026](docs/adr/0026-a-route-is-active-and-the-layout-may-name-it.md). A space with no layouts has no graphs, which is what a **new space** is: it renders and cannot be presented ([ADR 0015](docs/adr/0015-a-space-may-have-no-routes.md)). |
| `layouts[].graphs` | Named walkthroughs, each an `id`, `title`, optional `color`, and a set of `{ from, to }` **edges** between cards **of that layout** ([ADR 0032](docs/adr/0032-routes-may-contain-cycles.md)). Forks, merges, disconnected components, cycles and self-edges are legal; an exact duplicate Edge within one Graph is not, and an endpoint naming a card the owning layout omits is a load error. A graph belongs to exactly one layout, and there is no space-level collection beside them ([ADR 0040](docs/adr/0040-layouts-own-card-membership-and-routes.md)); its id is nonetheless unique across the whole space, because a view drawing every graph flattened across layouts keys colour, handles and activation on that id alone ([ADR 0045](docs/adr/0045-a-view-takes-cards-and-graphs-and-returns-a-layout.md)). The edge set may be empty. Graphs are a layout's only connection structure ([ADR 0007](docs/adr/0007-routes-are-the-only-structure.md)), and the drawn edges and handles are derived from them. |
| `defaultRenderer` | The Canvas renderer the space opens in: a declared layout's id, or a built-in automatic one (`flow`, `grid`). A declared layout wins a name collision. |

### Graphs as color-coded flows

Each authored edge becomes a colored drawn edge, and each card a Graph leaves gains a `<graphId>::out` handle (right) while each card it arrives at gains a `<graphId>::in` handle (left) — one per Graph per side, so a fork's several outgoing edges share one handle. Those become namespaced ELK port ids. ELK keeps each port on its assigned side and returns its exact offset so the handles line up and the edge runs cleanly. `@project/graph` derives the handles (`buildCardHandles`) and edges (`buildGraphRenderEdges`), then assembles the graph to arrange (`buildLayoutStrategyGraph`); `@project/react-flow-adapter` applies a `LayoutStrategy` and colors the projection. Switching graphs changes emphasis, not visibility or placement.

### Markdown cards

A card is **one file**: frontmatter, then body ([ADR 0020](docs/adr/0020-a-card-is-a-markdown-file-with-frontmatter.md), refined by [ADR 0051](docs/adr/0051-card-kinds-own-everything-beyond-the-title.md)). Shared frontmatter carries `id`, `title` and `kind`; an Alias adds its `target`, while everything after a Markdown Card's fence is its content. A card can be visited by any number of graphs — that reuse is the whole point, and a card shared by several graphs carries one handle pair per Graph running through it.

A card's identity is its frontmatter `id`, never its filename, so renaming the file is not a data migration. Since the title lives in the same file as the body, a body may open with a heading — it is just a heading, not a repeat of a title held somewhere else.

The graph draws a card's **title**, not its body ([ADR 0006](docs/adr/0006-cards-show-titles-in-the-graph.md)). Click a card to open it and read its Markdown **source**, verbatim; the one place a card is drawn *rendered* is presenting ([ADR 0011](docs/adr/0011-opening-shows-markdown-source.md)). Content reaches a node only when that node is the Card the Traversal history has reached, so it is not embedded in every node.

A card occupies exactly one position in the graph; there is no placement layer letting the same card sit in two places. Showing the same content at a second position is the job of an **alias** card ([ADR 0004](docs/adr/0004-cards-are-the-graph.md)).

Validation happens in two layers:

- **Shape** — Zod schemas (`@project/core`) validate the space file and each card file's frontmatter.
- **References** — `@project/graph` checks that both ends of every Graph Edge resolve to a Card, that no Graph contains an exact duplicate Edge, that a Layout positions and shows only things the Space has, and flags duplicate ids. Unresolved references are surfaced as a banner in the app rather than crashing it.

`@project/graph` also derives the Graph handles and edges (`buildCardHandles`, `buildGraphRenderEdges`); `@project/react-flow-adapter` projects colored card nodes and edges (`projectCardNodes`, `projectGraphEdges`).

### Layouts

A **Layout** is authored data: a named card-to-position map stored with the space. A **LayoutStrategy** is behaviour: it takes the layout-strategy graph to arrange and asynchronously returns that same value with geometry on its cards and handles ([ADR 0014](docs/adr/0014-layout-is-the-authored-data-strategy-is-the-behaviour.md)):

```ts
type LayoutStrategy = (graph: LayoutStrategyGraph) => Promise<LayoutStrategyGraph>;
```

Three ship. `elkStrategy` (in `@project/react-flow-adapter`, the only package that may touch elkjs) is one automatic strategy and runs ELK layered left→right. `gridStrategy` (in `@project/graph`) is a pure automatic strategy that places cards on a grid. `positionedStrategy` reads an authored Layout. Which cards a strategy arranges is the view's choice, not the strategy's.

## Architecture

A pnpm workspace with strict TypeScript and enforced package boundaries:

| Package | Responsibility |
| --- | --- |
| `@project/core` | Domain types + Zod schema. No framework code. |
| `@project/graph` | Pure graph/Graph logic: intake and indexing, lookups, Graph navigation, referential validation, Graph→handles/edges derivation, and the `LayoutStrategy` contract. Property-tested. |
| `@project/persistence` | Browser-safe backend and session contracts, optimistic revisions, commit coalescing, failure/conflict handling, and the memory adapter. |
| `@project/react-flow-adapter` | Owns React Flow projection and all elkjs specifics. Runs the ELK strategy and projects the domain model into coloured React Flow Card nodes and Edges. |
| `@project/ui` | Reusable, framework-agnostic React: card renderer, Graph selector, Graph legend, presentation controls, app shell. |
| `@project/app` | Wiring: TanStack Router, a Zustand store for presentation state, the example presentation, and Vite. |

Design rules kept throughout: domain logic stays out of React components, React Flow specifics stay in the adapter, and app wiring stays in `@project/app`.

### Tests

- Schema validation and rejection cases (`@project/core`).
- Unresolved card/edge/Graph-step references and duplicate ids (`@project/graph`).
- Graph navigation behaviour, with fast-check property tests for clamping/monotonicity and validation invariants.
- React Flow projection correctness (`@project/react-flow-adapter`).
- Card rendering smoke test (`@project/ui`).
- Playwright flows: app loads, the graph is visible, a Graph is selected, cards open, a completed drag reaches the backend and survives a reload, a drawn connection mints and activates a Graph, and a Graph is traversed under the camera.

## Current limitations

- **Card authoring is intentionally narrow.** Markdown source, Titles and Alias Targets are editable, while visual editing, freehand drawing and whiteboard shapes are not built. Card, placement and Edge edits commit through the HTTP persistence session: under `pnpm dev` they land in PostgreSQL and outlive the page, and under `pnpm dev:new` they survive a browser reload but not a server restart.
- **The app never touches files.** The browser lists, opens and commits Spaces under `/api/spaces` and nothing else; file discovery and parsing are server-side CLI and import concerns. There is no write-back and no file picker. Canonical file export belongs to the `hyper` CLI ([ADR 0030](docs/adr/0030-postgres-is-the-live-write-model.md)), which regenerates a deterministic version 1 space directory from the database and records the revision it projected.
- **Overlay legibility.** The graph draws every Graph at once. Only **compatible** graphs — the union of their edges is acyclic — lay out cleanly as parallel forward paths; two graphs disagreeing about the order of cards they share force a backward edge, drawn as a routed channel. See [`.scratch/multiple-routes/findings.md`](.scratch/multiple-routes/findings.md).
- **Cards are a fixed shape.** A card draws its title, so every card is the same size — declared once in `packages/app/src/card.ts` as a 16:9 ratio and consumed by both the layout and the stylesheet. Content adapts to the card, not the reverse, which is why measured DOM sizes are not fed into ELK.
- **Structural authoring is partial.** Dragging between spatial handles draws an Edge, and the first one mints and activates `Graph 1` ([ADR 0033](docs/adr/0033-route-authoring-uses-spatial-route-coloured-handles.md)). Option/Alt plus an empty drop atomically creates and connects a blank `Card N`. There is no detached Card creation, and deleting Cards, Edges or Graphs is deliberately disabled until those operations can complete through the same persisted-Edit lifecycle. Broader Graph management is also unbuilt.
- **No speaker view, timer, transitions or deck export.** They went with the deck framework and return, if wanted, as their own decisions designed against a traversal ([ADR 0024](docs/adr/0024-presenting-is-traversing-a-route.md)).
- **The presented card is scaled by the camera**, so its text is rasterised rather than laid out at its final size — a property of wanting a spatial camera at all.
- The production bundle ships React Flow and elkjs in a single chunk (~2.1 MB) — fine for a prototype, not tuned for size.

## Next likely improvements

- Structural deletion for Edges, Cards and Graphs through the completed-Edit lifecycle.
- Detached Card creation, without requiring an Edge from an existing Card.
- Card content and metadata editing, plus creation, naming, recolouring and reordering of additional Graphs.
- Encode the active Graph and card in the TanStack Router URL so a position is linkable and refresh-safe.
- Authored camera hints (zoom/pan/highlight several nodes) and move transitions in the space file.
- A traversal-native speaker view: current and next Card, notes, and elapsed time.
