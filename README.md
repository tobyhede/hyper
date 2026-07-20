# Graph-Native Technical Presentations

A local, file-first prototype that proves one idea:

> A technical deck can be authored as Markdown cards on a spatial graph, then presented as a curated route through that graph.

Content lives in version-controlled files. A JSON manifest defines cards, the edges between them, and named presentation routes. [React Flow](https://reactflow.dev) renders the **selected route** as a single colored flow and [elkjs](https://github.com/kieler/elkjs) lays it out automatically (layered, left→right). Each card exposes one inbound and one outbound port for the route (the "multiple handles" approach). Choosing a different route in the toolbar swaps the visible flow; presentation mode walks it like a slide deck, highlighting the current card and fitting the viewport to each step.

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

The graph uses React Flow's [elkjs multiple-handles technique](https://reactflow.dev/examples/layout/elkjs-multiple-handles): ELK lays out the nodes and computes each port's position, and those exact offsets are applied to the handles so connected ports line up and the colored rails stay legible.

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
  "edges": [
    {
      "id": "intro-to-problem",
      "source": "intro",
      "target": "problem",
      "kind": "sequence"
    }
  ],
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
| `cards` | Content units: an `id`, a `title`, and `content` (a relative path to a Markdown file). Cards **are** the graph — edges and steps reference them directly, and a card occupies exactly one position (see [ADR 0004](docs/adr/0004-cards-are-the-graph.md)). |
| `edges` | Optional structural relationships between cards (`source`/`target`/`kind`). Still schema- and reference-validated, but **not drawn** in the current route-centric view (kept for a future structural layer). |
| `routes` | Named walkthroughs, each an `id`, `title`, optional `color`, and ordered `steps` targeting card ids. The selected route becomes the visible flow; its connections and ports are derived from these. |

### Routes as color-coded flows

The visible graph is the selected route. Each adjacent pair of steps becomes a colored edge, and each card it visits gains a `<routeId>::in` port (left) and `<routeId>::out` port (right). Those port ids are handed to ELK, which lays out the chain with fixed port order per side (the "multiple handles" technique) and returns each port's offset so the handles line up and the rail stays straight. `@project/graph` derives the ports (`buildCardHandles`), edges (`buildRouteEdges`), and the single-route view (`routeCardIds`, `filterHandlesByRoute`); `@project/react-flow-adapter` runs ELK (`getElkLayout`, applying the computed port offsets) and colors the projection. Switching routes re-runs the layout.

### Markdown cards

Each card body is a standalone Markdown file (GitHub-flavoured Markdown via `remark-gfm`, so tables, code fences, and task lists work). A card can be visited by any number of routes — that reuse is the whole point. You see it by switching routes: a shared card shows up in more than one route's flow.

A card occupies exactly one position in the graph; there is no placement layer letting the same card sit in two places. Showing the same content at a second position is the job of an **alias** card, which is not yet implemented ([ADR 0004](docs/adr/0004-cards-are-the-graph.md)).

Validation happens in two layers:

- **Shape** — a Zod schema (`@project/core`) validates the manifest structure.
- **References** — `@project/graph` checks that every `edge.source`/`edge.target` and `route.step.target` resolves to a card, and flags duplicate ids. Unresolved references are surfaced as a banner in the app rather than crashing it.

`@project/graph` also derives the route ports and rails (`buildCardHandles`, `buildRouteEdges`); `@project/react-flow-adapter` runs the ELK layout (`getElkLayout`) and projects colored card nodes and edges (`projectCardNodes`, `projectRouteEdges`).

## Architecture

A pnpm workspace with strict TypeScript and enforced package boundaries:

| Package | Responsibility |
| --- | --- |
| `@project/core` | Domain types + Zod schema. No framework code. |
| `@project/graph` | Pure graph/route logic: lookups, route navigation, referential validation, and the route→ports/rails derivation. Property-tested. |
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
- **One route at a time.** The graph shows the selected route only, and there is no whole-graph overview. This is a *view* choice, not a limit of the model: multiple **compatible** routes (their combined step-order is acyclic) lay out cleanly. Routes whose combined order contains a cycle force an unavoidable backward rail. See [`.scratch/multiple-routes/findings.md`](.scratch/multiple-routes/findings.md).
- **ELK runs on fixed-size cards.** The layout uses a uniform card size, not measured DOM dimensions, so cards are pinned to one height. A route that visits the same card twice reuses that card's ports (a visual overlap, not a crash).
- **Structural `edges` aren't drawn.** Only the selected route's rail is rendered; manifest `edges` are validated but not shown.
- **No route branching.** A route is a linear list of steps; step transitions/annotations are not modelled.
- **Client-only, no persistence.** Presentation state lives in memory; there is no routing per step or shareable deep links.
- The production bundle ships React Flow and elkjs in a single chunk (~2.1 MB) — fine for a prototype, not tuned for size.

## Next likely improvements

- Load an arbitrary presentation directory (drag-and-drop a folder or a `?src=` URL) instead of the bundled example.
- Encode the active route/step in the TanStack Router URL so a step is linkable and refresh-safe.
- Per-step camera hints (zoom/pan/highlight several nodes) and step transitions in the manifest.
- Speaker view: current + next card, notes, and elapsed time.
- Feed measured card sizes into ELK (via `useNodesInitialized`) so cards can be variable-height, and re-run layout when a route set changes.
- Draw manifest `edges` as a faint structural layer beneath the colored route rails.
- A tiny CLI to validate a presentation directory (`graph.json` + Markdown) in CI, reusing `@project/graph`.
