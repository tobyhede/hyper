# Graph-Native Technical Presentations

A local, file-first prototype that proves one idea:

> A technical deck can be authored as Markdown cards on a spatial graph, then presented as a curated route through that graph.

Content lives in version-controlled files. A space directory holds a space file naming the routes, plus one Markdown file per card. [React Flow](https://reactflow.dev) draws **every** route at once, each in its own colour, and [elkjs](https://github.com/kieler/elkjs) lays them out automatically (layered, left→right). Each card exposes one inbound and one outbound handle per route (the "multiple handles" approach). Choosing a route in the toolbar emphasises it without hiding the others.

**Presenting is the same canvas, closer in.** There is no deck and no second surface ([ADR 0024](docs/adr/0024-presenting-is-traversing-a-route.md)): pressing Present moves React Flow's camera to the route's first card and draws that card's content rendered. Arrow keys walk the route's edges — Right follows the selected one, Left goes back along the path taken, Up and Down choose among a fork's branches without moving the camera ([ADR 0027](docs/adr/0027-presenting-is-the-graph-canvas-under-camera-control.md)).

## Running it

Requirements: Node ≥ 24 and pnpm 9.

```sh
pnpm install
pnpm dev            # start the app at http://localhost:5173
```

Then:

1. Pick a route in the toolbar. Every route stays drawn; the one you pick is emphasised.
2. Click a card to open it and read its Markdown source. `Esc` closes it.
3. Drag a card to move it. Nothing is written until you ask: **Save** (or `⌘S` / `Ctrl-S`) writes the arrangement back to the space directory, and until then the space is unsaved.
4. Press **Present** to walk the route: `→` follows an edge, `←` goes back, `↑` / `↓` choose at a fork, `Esc` returns to the overview.

The graph uses React Flow's [elkjs multiple-handles technique](https://reactflow.dev/examples/layout/elkjs-multiple-handles): ELK lays out the nodes and computes each port's position, and those exact offsets are applied to the handles so connected handles line up and the colored route edges stay legible.

### Verify

```sh
pnpm verify         # typecheck + lint + prettier check + unit/property tests
pnpm e2e            # Playwright flow (boots the dev server automatically)
```

`pnpm e2e` needs the Chromium browser once: `pnpm exec playwright install chromium`.

### Local PostgreSQL

PostgreSQL is an opt-in development dependency; the ordinary `pnpm verify` and
`pnpm e2e` suites do not require a database. Local connection values live in an
ignored `.env`, while `.env.example` records the required variables without a
usable credential:

```sh
cp .env.example .env
```

Choose a URL-safe local password, then set both blank values in `.env`. The URL
must carry the same database, user, password and port as the `POSTGRES_*`
variables:

```dotenv
POSTGRES_PASSWORD=<your-local-password>
DATABASE_URL=postgresql://hyper:<your-local-password>@127.0.0.1:55432/hyper
```

Never commit `.env`. In deployed environments, inject `DATABASE_URL` through
the platform's secret manager rather than shipping an environment file.

Start the pinned PostgreSQL 17.5 container and wait for its health check:

```sh
pnpm postgres:up
```

The complete database test path emits the Prisma Next contract, applies pending
migrations and performs a typed space/card JSONB write and read against the real
database:

```sh
pnpm test:integration:postgres
```

The individual schema commands remain available when developing a contract or
migration:

```sh
pnpm contract:emit
pnpm db:migrate
```

Stop PostgreSQL without deleting the named data volume:

```sh
pnpm postgres:down
```

Compose reads the same `.env` for every lifecycle command, including teardown.
Deleting the volume is a separate, destructive reset: `docker compose down
--volumes`.

## The space format

A space is a **space directory**: a space file (`space.json`) plus one Markdown file per card. Cards are not listed anywhere — a card exists because its file does ([ADR 0020](docs/adr/0020-a-card-is-a-markdown-file-with-frontmatter.md)), and they are discovered by scanning two locations **non-recursively**: `*.md` beside the space file, and `cards/*.md`. The bundled example lives in [`packages/app/example`](packages/app/example).

"Manifest" is retired, as a word and as a type ([ADR 0010](docs/adr/0010-space-is-the-root-loaded-by-loadspace.md)): the top-level value is a **Space**, and it is minted only by `loadSpace`.

### `space.json`

```json
{
  "version": 1,
  "id": "graph-native",
  "title": "Graph-Native Technical Presentations",
  "routes": [
    {
      "id": "main",
      "title": "Main walkthrough",
      "color": "#6ea8fe",
      "edges": [{ "from": "intro", "to": "problem" }]
    }
  ],
  "layouts": [
    {
      "id": "working",
      "title": "Working",
      "positions": { "intro": { "x": 0, "y": 0 } },
      "activeRoute": "main"
    }
  ],
  "defaultView": "working"
}
```

| Key | Meaning |
| --- | --- |
| `id`, `title` | What names the space. The id is not the title and not the file name. |
| `routes` | Named walkthroughs, each an `id`, `title`, optional `color`, and a set of `{ from, to }` **edges** between card ids ([ADR 0023](docs/adr/0023-a-route-is-an-acyclic-graph-of-card-edges.md)). A card may have several edges out (a fork) and several in (a merge); what a route may not do is close a cycle. Routes are a space's only structure ([ADR 0007](docs/adr/0007-routes-are-the-only-structure.md)), and the drawn edges and handles are derived from these. May be empty — a space with no routes renders and cannot be presented ([ADR 0015](docs/adr/0015-a-space-may-have-no-routes.md)). |
| `layouts` | Optional authored card-to-position maps ([ADR 0014](docs/adr/0014-layout-is-the-authored-data-strategy-is-the-behaviour.md)). Positions are sparse — a layout may omit cards but may not name one the space lacks. A layout also names the routes it shows (`routes`, a filter; absent means all) and which of them opens **active** (`activeRoute`; absent means the first visible one) — [ADR 0026](docs/adr/0026-a-route-is-active-and-the-layout-may-name-it.md). |
| `defaultView` | Which view the space opens in: a declared layout's id, or a built-in automatic one (`graph`, `grid`). A declared layout wins a name collision. |

### Routes as color-coded flows

Each authored edge becomes a colored drawn edge, and each card a route leaves gains a `<routeId>::out` handle (right) while each card it arrives at gains a `<routeId>::in` handle (left) — one per route per side, so a fork's several outgoing edges share one handle. Those become ELK port ids, and ELK lays out the chain with fixed port order per side (the "multiple handles" technique), returning each one's offset so the handles line up and the edge runs straight. `@project/graph` derives the handles (`buildCardHandles`), edges (`buildRouteEdges`), and the single-route view (`routeCardIds`, `filterHandlesByRoute`), then assembles the graph to arrange (`buildLayoutGraph`); `@project/react-flow-adapter` applies a **layout** to it and colors the projection. Switching routes re-runs the layout.

### Markdown cards

A card is **one file**: frontmatter, then body ([ADR 0020](docs/adr/0020-a-card-is-a-markdown-file-with-frontmatter.md)). The frontmatter carries `id`, `title`, an optional `description`, and for an alias its `kind` and `target`; everything under it is the content, GitHub-flavoured Markdown. A card can be visited by any number of routes — that reuse is the whole point, and a card shared by several routes carries one handle pair per route running through it.

A card's identity is its frontmatter `id`, never its filename, so renaming the file is not a data migration. Since the title lives in the same file as the body, a body may open with a heading — it is just a heading, not a repeat of a title held somewhere else.

The graph draws a card's **title**, not its body ([ADR 0006](docs/adr/0006-cards-show-titles-in-the-graph.md)). Click a card to open it and read its Markdown **source**, verbatim; the one place a card is drawn *rendered* is presenting ([ADR 0011](docs/adr/0011-opening-shows-markdown-source.md)). Content reaches a node only when that node is the card a walk has reached, so it is not embedded in every node.

A card occupies exactly one position in the graph; there is no placement layer letting the same card sit in two places. Showing the same content at a second position is the job of an **alias** card, which is not yet implemented ([ADR 0004](docs/adr/0004-cards-are-the-graph.md)).

Validation happens in two layers:

- **Shape** — Zod schemas (`@project/core`) validate the space file and each card file's frontmatter.
- **References** — `@project/graph` checks that both ends of every route edge resolve to a card, that no route closes a cycle, that a layout positions and shows only things the space has, and flags duplicate ids. Unresolved references are surfaced as a banner in the app rather than crashing it.

`@project/graph` also derives the route handles and edges (`buildCardHandles`, `buildRouteEdges`); `@project/react-flow-adapter` projects colored card nodes and edges (`projectCardNodes`, `projectRouteEdges`).

### Layouts

A **layout** is a named strategy for arranging cards. It takes the graph to arrange and returns it with positions on the cards — the same shape both ways, as elkjs models it, with no separate result type ([ADR 0005](docs/adr/0005-layout-is-a-strategy.md)):

```ts
type Layout = (graph: LayoutGraph) => LayoutGraph | Promise<LayoutGraph>;
```

Two ship. `elkLayout` (in `@project/react-flow-adapter`, the only package that may touch elkjs) runs ELK layered left→right and places every handle. `gridLayout` (in `@project/graph`) is pure and synchronous, reads only the cards, and places no handles — the render layer spreads handles evenly when a layout has no opinion about them. Which cards a layout arranges is the view's choice, not the layout's.

## Architecture

A pnpm workspace with strict TypeScript and enforced package boundaries:

| Package | Responsibility |
| --- | --- |
| `@project/core` | Domain types + Zod schema. No framework code. |
| `@project/graph` | Pure graph/route logic: lookups, route navigation, referential validation, the route→handles/edges derivation, and the `Layout` contract. Property-tested. |
| `@project/react-flow-adapter` | The only package that imports `@xyflow/react` and `elkjs`. Runs the ELK layout and projects the domain model into colored React Flow card nodes/edges. |
| `@project/ui` | Reusable, framework-agnostic React: card renderer, route selector, route legend, presentation controls, app shell. |
| `@project/app` | Wiring: TanStack Router, a Zustand store for presentation state, the example presentation, and Vite. |

Design rules kept throughout: domain logic stays out of React components, React Flow specifics stay in the adapter, and app wiring stays in `@project/app`.

### Tests

- Schema validation and rejection cases (`@project/core`).
- Unresolved card/edge/route-step references and duplicate ids (`@project/graph`).
- Route navigation behaviour, with fast-check property tests for clamping/monotonicity and validation invariants.
- React Flow projection correctness (`@project/react-flow-adapter`).
- Card rendering smoke test (`@project/ui`).
- A Playwright flow: app loads, the graph is visible, a route is selected, cards open, a drag is persisted, and a route is walked under the camera.

## Current limitations

- **Content is read-only.** No visual or Markdown editing, no drawing, no whiteboard shapes. Placement is the one thing the app writes: drag a card and press Save, and the arrangement goes back to the space directory ([ADR 0029](docs/adr/0029-saving-is-an-explicit-act.md)).
- **Single bundled presentation.** The example is imported at build time (`import.meta.glob`); there is no file picker or loader for arbitrary presentations.
- **Overlay legibility.** The graph draws every route at once. Only **compatible** routes — the union of their edges is acyclic — lay out cleanly as parallel forward paths; two routes disagreeing about the order of cards they share force a backward edge, drawn as a routed channel. See [`.scratch/multiple-routes/findings.md`](.scratch/multiple-routes/findings.md).
- **Cards are a fixed shape.** A card draws its title, so every card is the same size — declared once in `packages/app/src/card.ts` as a 16:9 ratio and consumed by both the layout and the stylesheet. Content adapts to the card, not the reverse, which is why measured DOM sizes are not fed into ELK.
- **No authoring of structure.** Routes and cards are edited in the files; the drag-to-connect surface ([ADR 0021](docs/adr/0021-routes-are-drawn-as-react-flow-edges.md)) is not built.
- **No speaker view, timer, transitions or export.** They went with the deck framework and return, if wanted, as their own decisions designed against a traversal ([ADR 0024](docs/adr/0024-presenting-is-traversing-a-route.md)).
- **The presented card is scaled by the camera**, so its text is rasterised rather than laid out at its final size — a property of wanting a spatial camera at all.
- The production bundle ships React Flow and elkjs in a single chunk (~2.1 MB) — fine for a prototype, not tuned for size.

## Next likely improvements

- Load an arbitrary presentation directory (drag-and-drop a folder or a `?src=` URL) instead of the bundled example.
- Encode the active route and card in the TanStack Router URL so a position is linkable and refresh-safe.
- Authored camera hints (zoom/pan/highlight several nodes) and move transitions in the space file.
- Speaker view: current + next card, notes, and elapsed time.
- A tiny CLI to validate a space directory (`space.json` + Markdown) in CI, reusing `@project/graph`.
