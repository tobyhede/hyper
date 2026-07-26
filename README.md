# Graph-Native Technical Presentations

A local, file-first prototype that proves one idea:

> A technical deck can be authored as Markdown cards on a spatial graph, then presented as a curated route through that graph.

Content lives in version-controlled files. A space directory holds a space file naming the routes, plus one Markdown file per card. [React Flow](https://reactflow.dev) draws **every** route at once, each in its own colour, and [elkjs](https://github.com/kieler/elkjs) lays them out automatically (layered, left→right). Each card exposes one inbound and one outbound handle per route (the "multiple handles" approach). Choosing a route in the toolbar emphasises it without hiding the others.

**Presenting is the same canvas, closer in.** There is no deck and no second surface ([ADR 0024](docs/adr/0024-presenting-is-traversing-a-route.md)): pressing Present moves React Flow's camera to the route's first card and draws that card's content rendered. Arrow keys walk the route's edges — Right follows the selected one, Left goes back along the path taken, Up and Down choose among a fork's branches without moving the camera ([ADR 0027](docs/adr/0027-presenting-is-the-graph-canvas-under-camera-control.md)).

## Running it

Requirements: Node ≥ 20 and pnpm 9.

```sh
pnpm install
pnpm dev            # start the app at http://localhost:5173
```

Then:

1. Pick a route in the toolbar. Every route stays drawn; the one you pick is emphasised.
2. Click a card to open it and read its Markdown source. `Esc` closes it.
3. Drag a card to move it. The arrangement is saved back to the space directory.
4. Press **Present** to walk the route: `→` follows an edge, `←` goes back, `↑` / `↓` choose at a fork, `Esc` returns to the overview.

The graph uses React Flow's [elkjs multiple-handles technique](https://reactflow.dev/examples/layout/elkjs-multiple-handles): ELK lays out the nodes and computes each port's position, and those exact offsets are applied to the handles so connected handles line up and the colored route edges stay legible.

### Verify

```sh
pnpm verify         # typecheck + lint + prettier check + unit/property tests
pnpm e2e            # Playwright flow (boots the dev server automatically)
```

`pnpm e2e` needs the Chromium browser once: `pnpm exec playwright install chromium`.

## The presentation format

A presentation is a directory containing a `graph.json` manifest plus the Markdown files it references. The bundled example lives in [`packages/app/example`](packages/app/example).

### `graph.json`

```json
{
  "version": 1,
  "title": "Graph-Native Technical Presentations",
  "cards": [{ "id": "intro", "title": "Graph-native presentations", "content": "cards/intro.md" }],
  "routes": [
    {
      "id": "main",
      "title": "Main walkthrough",
      "color": "#6ea8fe",
      "edges": [{ "from": "intro", "to": "problem" }]
    }
  ]
}
```

| Key | Meaning |
| --- | --- |
| `cards` | Content units: an `id`, a `title`, and `content` (a relative path to a Markdown file). Cards **are** the graph — route steps reference them directly, and a card occupies exactly one position (see [ADR 0004](docs/adr/0004-cards-are-the-graph.md)). |
| `routes` | Named walkthroughs, each an `id`, `title`, optional `color`, and a set of `{ from, to }` **edges** between card ids ([ADR 0023](docs/adr/0023-a-route-is-an-acyclic-graph-of-card-edges.md)). A card may have several edges out (a fork) and several in (a merge); what a route may not do is close a cycle. Routes are a space's only structure ([ADR 0007](docs/adr/0007-routes-are-the-only-structure.md)), and the drawn edges and handles are derived from these. |

### Routes as color-coded flows

Each authored edge becomes a colored drawn edge, and each card a route leaves gains a `<routeId>::out` handle (right) while each card it arrives at gains a `<routeId>::in` handle (left) — one per route per side, so a fork's several outgoing edges share one handle. Those become ELK port ids, and ELK lays out the chain with fixed port order per side (the "multiple handles" technique), returning each one's offset so the handles line up and the edge runs straight. `@project/graph` derives the handles (`buildCardHandles`), edges (`buildRouteEdges`), and the single-route view (`routeCardIds`, `filterHandlesByRoute`), then assembles the graph to arrange (`buildLayoutGraph`); `@project/react-flow-adapter` applies a **layout** to it and colors the projection. Switching routes re-runs the layout.

### Markdown cards

Each card body is a standalone Markdown file (GitHub-flavoured Markdown via `remark-gfm`, so tables, code fences, and task lists work). A card can be visited by any number of routes — that reuse is the whole point, and a card shared by several routes carries one handle pair per route running through it.

A card's title lives in the manifest, so a card's Markdown file is its **body only** — do not repeat the title as a heading in the file, or it will appear twice everywhere the card is drawn.

The graph draws a card's **title**, not its body ([ADR 0006](docs/adr/0006-cards-show-titles-in-the-graph.md)). Click a card to open it and read its Markdown **source**, verbatim; the one place a card is drawn *rendered* is presenting ([ADR 0011](docs/adr/0011-opening-shows-markdown-source.md)). Content reaches a node only when that node is the card a walk has reached, so it is not embedded in every node.

A card occupies exactly one position in the graph; there is no placement layer letting the same card sit in two places. Showing the same content at a second position is the job of an **alias** card, which is not yet implemented ([ADR 0004](docs/adr/0004-cards-are-the-graph.md)).

Validation happens in two layers:

- **Shape** — a Zod schema (`@project/core`) validates the manifest structure.
- **References** — `@project/graph` checks that both ends of every route edge resolve to a card, that no route closes a cycle, and flags duplicate ids. Unresolved references are surfaced as a banner in the app rather than crashing it.

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

- **Read-only.** No visual or Markdown editing, no drawing, no whiteboard shapes — the app only reads files.
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
- Per-step camera hints (zoom/pan/highlight several nodes) and step transitions in the manifest.
- Speaker view: current + next card, notes, and elapsed time.
- A tiny CLI to validate a presentation directory (`graph.json` + Markdown) in CI, reusing `@project/graph`.
