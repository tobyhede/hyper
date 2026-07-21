# AGENTS.md

Instructions for AI coding agents working in this repo.

A local, file-first prototype for **graph-native technical presentations**: Markdown cards on a spatial graph, authored as a JSON manifest and presented as curated routes that elkjs lays out automatically. The overview draws every route at once, each as a colored line of React Flow edges, with the selected one emphasised. Cards in the graph show their title; **opening** a card reads it in place, and **presenting** a route is a separate reveal.js deck (ADR 0006, ADR 0008). pnpm + TypeScript (strict) monorepo.

## Commands

- Install: `pnpm install` (Node >= 20, pnpm 9).
- Dev: `pnpm dev` (app at http://localhost:5173).
- Verify: `pnpm verify` runs `typecheck` -> `lint` -> `format:check` -> `test` (i.e. `tsc --noEmit`, `eslint .`, `prettier --check .`, `vitest run`).
- Test: `pnpm test` (Vitest, `vitest` for watch). Unit + property tests (fast-check) live in `packages/*/test`.
- E2E: `pnpm e2e` (Playwright, chromium only). One-time first: `pnpm exec playwright install chromium`. The config auto-starts the dev server.
- Build: `pnpm build` (Vite build of the app).

## Package layout & boundaries

Five `@project/*` workspace packages under `packages/`:

- `core` — domain model. Zod schemas (`schema.ts`, incl. `spaceFileSchema` — the space-file shape) + the `Card`/`Route`/`RouteStep` types derived from them (`types.ts`). No React, no framework deps.
- `graph` — pure graph logic over a `Space`: `loadSpace` (the one intake — parse, validate references, index), the `Space` type, O(1) lookups, route navigation (clamped step indexing), route→handles/edges derivation, reference validation, and the `Layout` contract (`LayoutGraph`, `buildLayoutGraph`, `gridLayout`). Depends only on `core`.
- `react-flow-adapter` — the ONLY place React-Flow (`@xyflow/react`) and elkjs specifics live: projects a space+route into RF nodes/edges, implements `Layout` as `elkLayout`, renders `CardNode`.
- `ui` — reusable, presentation-agnostic React components + shadcn-style primitives (Tailwind v4, Radix Select, CVA). Depends on `core` only.
- `app` — wiring/composition: Zustand store, TanStack Router, space loading, graph/presentation views, hand-rolled CSS.

Hard rules:
- Domain logic stays out of React (keep it in `core`/`graph`).
- React-Flow / elkjs specifics stay in `react-flow-adapter` — nothing else imports them.
- Reusable UI goes in `ui`; app-specific glue goes in `app`.

## Conventions & gotchas

- **Strict TypeScript everywhere**, incl. `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `noImplicitOverride`.
- **`verbatimModuleSyntax` + ESLint `consistent-type-imports` are on** — use `import type` for type-only imports or lint/typecheck fails.
- **Cross-package imports** use the `@project/*` path aliases (declared in `tsconfig.base.json` AND mirrored in `vitest.config.ts` `resolve.alias`; Vite resolves them via the workspace). Keep the two alias lists in sync when adding a package.
- **Relative imports inside a package are EXTENSIONLESS** (`./foo`, not `./foo.ts`).
- **A Layout is a strategy, and the contract lives in `graph`, not the adapter.** `Layout` is `(graph: LayoutGraph) => LayoutGraph | Promise<LayoutGraph>`: geometry lands as optional fields on the cards and handles, mirroring how ELK itself models it. There is no `Arrangement` result type — see ADR 0005. `gridLayout` (pure, synchronous, places no handles) exists partly to keep the seam honest; if a change only works for `elkLayout`, the contract has leaked. Which cards get arranged is the view's choice, passed in. The sync/async union is deliberate but currently unexercised — see `.scratch/layout-seam/issues/06-revisit-async-optionality.md` before either building on it or removing it.
- **ELK port offsets are applied to handles.** ELK's *port* is React Flow's *handle* — same thing, two libraries' words. ELK computes each one's position, and those exact offsets drive where `CardNode` renders the handle, so a route's edges meet its cards cleanly. Don't hardcode handle positions.
- **Port constraints are `FIXED_SIDE`, not `FIXED_ORDER`.** ELK orders `FIXED_ORDER` ports **clockwise** around the node — EAST top-to-bottom but WEST *bottom-to-top*. Handing both sides the same list order therefore puts a route's outbound handle at the top of one card and its inbound handle at the bottom of the next, crossing every route at every shared card. `FIXED_SIDE` fixes the side and lets ELK order within it. Don't switch back without reading `.scratch/layout-seam/issues/04-elk-fixed-side-ports.md`.
- **ELK port ids are namespaced per card.** A handle id (`<routeId>::out`/`::in`) is the *same* on every card a route passes through, so `elkLayout` hands ELK `<cardId>##<handleId>` (`elkPortId`) and builds edge endpoints from the same key, stripping the prefix on read-back, so handles keep their bare ids and `CardNode` is unaffected. Never hand ELK a bare handle id — it then can't tell which card an edge attaches to and mislays *even single-route* graphs. See `.scratch/layout-seam/issues/01-namespace-elk-port-ids.md`.
- **A card's title lives in the manifest, not in its Markdown.** Card bodies are body-only; a leading heading that repeats `card.title` renders twice, on every surface. This was true of the bundled demo from the initial commit until 2026-07-20.
- **Routes are a space's only structure.** There is no authored `edges` array; ADR 0007 deleted it along with the `sequence`/`reference` kinds. `Edge` is React Flow's word for the drawn line, one per route step transition, and `CONTEXT.md` lists it under a render-layer section rather than as a domain term. Don't reintroduce authored edges as a "structural layer".
- **`path` now means a file path only.** The Route rename is done: the manifest key is `routes`, and the code says `Route`/`routeId`/`buildRouteEdges`. Remaining `path` identifiers are filesystem paths, TanStack Router URL paths, or React Flow's own SVG `edge-path` class — don't "fix" those.
- **`manifest` is retired, in vocabulary and code (ADR 0010).** The top-level domain value is a **Space**, minted only by `loadSpace(input) → { ok, space } | { ok: false, errors }` in `@project/graph` — the one intake that parses, validates references, and indexes, so a `Space` is consistent and O(1)-indexable by construction. `getCard`/`getRoute` read that index; every `graph`/adapter/app signature takes a `Space`. The on-disk shape is the **space file** (`space.json`, validated by `core`'s `spaceFileSchema`); a value that only passes that schema is *not yet* a Space. Don't reintroduce `manifest` anywhere — not as a type, not as the word for the file. The future edit buffer (a `Draft`, not built) is where a mutable, possibly-invalid working copy would live; a Space is never that.
- **Styling is split:** `ui` uses Tailwind v4 + shadcn-style primitives; the graph/card CSS stays hand-rolled in `packages/app/src/styles.css`. Tailwind scans `app` + `ui/src` via `@source` in `tailwind.css`.
- **Markdown is excluded from Prettier** (`.prettierignore`) — don't rely on `format` to touch `*.md`.

## Before claiming done

- Run `pnpm verify` and report the real output.
- For any UI/graph change, also run `pnpm e2e` and report it.
- Do not assert success without having run the commands.

## Scope discipline

Keep to the MVP. Don't over-generalize the domain model and don't add features beyond what's asked.

On multi-route rendering (shipped 2026-07-20, `.scratch/multi-route/`): the overview draws every route, and **selection is emphasis, not filtering** — at all times, not only while presenting. The dimming in `projectRouteEdges`, `CardNode` and `RouteLegend` is now live; it was dead code from the initial commit until then. `filterHandlesByRoute` and `routeCardIds` still exist and are still right for a view that wants one route. Which routes a view shows is a View decision passed into the layout (ADR 0005) — don't let the layout or `graph` decide it.

The overlay limit that remains: only **compatible** routes — their combined step-order (every route's `step[i] → step[i+1]`, unioned) is acyclic — lay out cleanly, and the bundled demo is compatible. **Conflicting-order** routes (two routes disagreeing on the order of shared cards, a reverse route, or a route that revisits a card) always force a backward edge: renderable *legibly* only via ELK's own orthogonal edge routing (`layout-seam/03`), or by unrolling revisits into duplicate nodes sharing a card — never as a clean forward line while keeping one node per card. ADR 0003 says routes may conflict, so a view must tolerate it. Read `.scratch/multiple-routes/findings.md` before extending any of this.

## Agent skills

### Workflow

How work moves from a question to committed code: the grilling loop, when a decision earns an ADR, the rename rule, the verification bar. See `docs/agents/workflow.md`. The skills themselves live in `.claude/skills/`, which is gitignored — `workflow.md` is the copy that survives without them.

### Issue tracker

Issues and specs live as local markdown under `.scratch/<feature>/` (no remote; this is a local prototype). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
