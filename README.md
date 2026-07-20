# Graph-Native Technical Presentations

A local, file-first prototype that proves one idea:

> A technical deck can be authored as Markdown cards on a spatial graph, then presented as a curated route through that graph.

Content lives in version-controlled files. A JSON manifest defines cards and the named routes laid across them. [React Flow](https://reactflow.dev) renders the **selected route** as a single colored flow and [elkjs](https://github.com/kieler/elkjs) lays it out automatically (layered, left→right). Each card exposes one inbound and one outbound handle per route (the "multiple handles" approach). Choosing a different route in the toolbar swaps the visible flow; presentation mode walks it like a slide deck, highlighting the current card and fitting the viewport to each step.

## Running it

Requirements: Node ≥ 20 and pnpm 9.

```sh
pnpm install
pnpm dev            # start the app at http://localhost:5173
```

Then:

1. Pick a route in the toolbar (**Main walkthrough** or **Quick tour**).
2. Press **Present**.
3. Use `→` / `←` (also `Space`, `↑` / `↓`) to move between steps. The current card is highlighted and centred.
4. Press **Exit** or `Esc` to return to the overview.

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
      "steps": [{ "target": "intro" }, { "target": "problem" }]
    }
  ]
}
```

| Key | Meaning |
| --- | --- |
| `cards` | Content units: an `id`, a `title`, and `content` (a relative path to a Markdown file). Cards **are** the graph — route steps reference them directly, and a card occupies exactly one position (see [ADR 0004](docs/adr/0004-cards-are-the-graph.md)). |
| `routes` | Named walkthroughs, each an `id`, `title`, optional `color`, and ordered `steps` targeting card ids. Routes are a space's only structure ([ADR 0007](docs/adr/0007-routes-are-the-only-structure.md)); the selected route becomes the visible flow, and its edges and handles are derived from these. |

### Routes as color-coded flows

The visible graph is the selected route. Each adjacent pair of steps becomes a colored edge, and each card it visits gains a `<routeId>::in` handle (left) and `<routeId>::out` handle (right). Those become ELK port ids, and ELK lays out the chain with fixed port order per side (the "multiple handles" technique), returning each one's offset so the handles line up and the edge runs straight. `@project/graph` derives the handles (`buildCardHandles`), edges (`buildRouteEdges`), and the single-route view (`routeCardIds`, `filterHandlesByRoute`), then assembles the graph to arrange (`buildLayoutGraph`); `@project/react-flow-adapter` applies a **layout** to it and colors the projection. Switching routes re-runs the layout.

### Markdown cards

Each card body is a standalone Markdown file (GitHub-flavoured Markdown via `remark-gfm`, so tables, code fences, and task lists work). A card can be visited by any number of routes — that reuse is the whole point, and a card shared by several routes carries one handle pair per route running through it.

The graph draws a card's **title**, not its body ([ADR 0006](docs/adr/0006-cards-show-titles-in-the-graph.md)). Click a card to open it and read its content; presentation mode steps through the same content full-width. Content is loaded when a card is opened, not embedded in every graph node.

A card occupies exactly one position in the graph; there is no placement layer letting the same card sit in two places. Showing the same content at a second position is the job of an **alias** card, which is not yet implemented ([ADR 0004](docs/adr/0004-cards-are-the-graph.md)).

Validation happens in two layers:

- **Shape** — a Zod schema (`@project/core`) validates the manifest structure.
- **References** — `@project/graph` checks that every `route.step.target` resolves to a card, and flags duplicate ids. Unresolved references are surfaced as a banner in the app rather than crashing it.

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
- A Playwright flow: app loads, graph is visible, a route is selected, presentation mode is entered, and next/previous changes the focused card.

## Current limitations

- **Read-only.** No visual or Markdown editing, no drawing, no whiteboard shapes — the app only reads files.
- **Single bundled presentation.** The example is imported at build time (`import.meta.glob`); there is no file picker or loader for arbitrary presentations.
- **One route at a time.** The graph shows the selected route only, and there is no whole-graph overview. This is a *view* choice, not a limit of the model: multiple **compatible** routes (their combined step-order is acyclic) lay out cleanly. Routes whose combined order contains a cycle force an unavoidable backward edge. See [`.scratch/multiple-routes/findings.md`](.scratch/multiple-routes/findings.md).
- **ELK runs on fixed-size cards.** The layout uses a uniform card size, not measured DOM dimensions, so cards are pinned to one height. Since a card draws only its title this is now correct rather than a limitation, but the size is still declared twice — in the app and in the stylesheet. A route that visits the same card twice reuses that card's handles (a visual overlap, not a crash).
- **No route branching.** A route is a linear list of steps; step transitions/annotations are not modelled.
- **Client-only, no persistence.** Presentation state lives in memory; there is no routing per step or shareable deep links.
- The production bundle ships React Flow and elkjs in a single chunk (~2.1 MB) — fine for a prototype, not tuned for size.

## Next likely improvements

- Load an arbitrary presentation directory (drag-and-drop a folder or a `?src=` URL) instead of the bundled example.
- Encode the active route/step in the TanStack Router URL so a step is linkable and refresh-safe.
- Per-step camera hints (zoom/pan/highlight several nodes) and step transitions in the manifest.
- Speaker view: current + next card, notes, and elapsed time.
- Feed measured card sizes into ELK (via `useNodesInitialized`) so cards can be variable-height, and re-run layout when a route set changes.
- A tiny CLI to validate a presentation directory (`graph.json` + Markdown) in CI, reusing `@project/graph`.
