# AGENTS.md

Instructions for AI coding agents working in this repo.

A local, file-first prototype for **graph-native technical presentations**: Markdown cards on a spatial graph, authored as a JSON manifest and presented as curated routes that elkjs lays out automatically. The app currently renders one route at a time, as a single colored "rail" — a *current view choice*, not a domain limit (see Scope discipline). pnpm + TypeScript (strict) monorepo.

## Commands

- Install: `pnpm install` (Node >= 20, pnpm 9).
- Dev: `pnpm dev` (app at http://localhost:5173).
- Verify: `pnpm verify` runs `typecheck` -> `lint` -> `format:check` -> `test` (i.e. `tsc --noEmit`, `eslint .`, `prettier --check .`, `vitest run`).
- Test: `pnpm test` (Vitest, `vitest` for watch). Unit + property tests (fast-check) live in `packages/*/test`.
- E2E: `pnpm e2e` (Playwright, chromium only). One-time first: `pnpm exec playwright install chromium`. The config auto-starts the dev server.
- Build: `pnpm build` (Vite build of the app).

## Package layout & boundaries

Five `@project/*` workspace packages under `packages/`:

- `core` — domain model. Zod schemas (`schema.ts`) + types derived from them (`types.ts`); `parseManifest`/`safeParseManifest`. No React, no framework deps.
- `graph` — pure graph logic over a manifest: lookups, path navigation (clamped step indexing), path→ports/edges derivation, reference validation. Depends only on `core`.
- `react-flow-adapter` — the ONLY place React-Flow (`@xyflow/react`) and elkjs specifics live: projects a manifest+path into RF nodes/edges, runs ELK layout, renders `CardNode`.
- `ui` — reusable, presentation-agnostic React components + shadcn-style primitives (Tailwind v4, Radix Select, CVA). Depends on `core` only.
- `app` — wiring/composition: Zustand store, TanStack Router, manifest loading, graph/presentation views, hand-rolled CSS.

Hard rules:
- Domain logic stays out of React (keep it in `core`/`graph`).
- React-Flow / elkjs specifics stay in `react-flow-adapter` — nothing else imports them.
- Reusable UI goes in `ui`; app-specific glue goes in `app`.

## Conventions & gotchas

- **Strict TypeScript everywhere**, incl. `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `noImplicitOverride`.
- **`verbatimModuleSyntax` + ESLint `consistent-type-imports` are on** — use `import type` for type-only imports or lint/typecheck fails.
- **Cross-package imports** use the `@project/*` path aliases (declared in `tsconfig.base.json` AND mirrored in `vitest.config.ts` `resolve.alias`; Vite resolves them via the workspace). Keep the two alias lists in sync when adding a package.
- **Relative imports inside a package are EXTENSIONLESS** (`./foo`, not `./foo.ts`).
- **ELK port offsets are applied to handles.** ELK computes each port's position; those exact offsets drive where `CardNode` handles render so the colored rails line up. Don't hardcode handle positions.
- **ELK port ids are namespaced per card.** A handle id (`<pathId>::out`/`::in`) is the *same* on every card a route passes through, so `buildElkGraph` hands ELK `<cardId>##<handleId>` (`elkPortId`) and builds edge endpoints from the same key; `getElkLayout` strips the prefix on read-back, so handles keep their bare ids and `CardNode` is unaffected. Never hand ELK a bare handle id — it then can't tell which card an edge attaches to and mislays *even single-route* graphs. See `.scratch/layout-seam/issues/01-namespace-elk-port-ids.md`.
- **"path" == Route.** The code and this file say `path`/`paths` (`buildPathEdges`, `pathCardIds`); CONTEXT.md's domain term is **Route** and lists "path" under _Avoid_. Same concept — the glossary is the naming target; the code hasn't been renamed yet.
- **Styling is split:** `ui` uses Tailwind v4 + shadcn-style primitives; the graph/card CSS stays hand-rolled in `packages/app/src/styles.css`. Tailwind scans `app` + `ui/src` via `@source` in `tailwind.css`.
- **Markdown is excluded from Prettier** (`.prettierignore`) — don't rely on `format` to touch `*.md`.

## Before claiming done

- Run `pnpm verify` and report the real output.
- For any UI/graph change, also run `pnpm e2e` and report it.
- Do not assert success without having run the commands.

## Scope discipline

Keep to the MVP. Don't over-generalize the domain model and don't add features beyond what's asked.

On multi-route rendering (the old "no overlay" rule, corrected): the single-route view is what ships. Overlaying **compatible** routes — their combined step-order (every route's `step[i] → step[i+1]`, unioned) is acyclic — lays out cleanly and is a legitimate direction. **Conflicting-order** routes (two routes disagreeing on the order of shared nodes, a reverse route, or a route that revisits a node) always force a backward rail: renderable *legibly* only via ELK's own orthogonal edge routing, or by unrolling revisits into duplicate nodes sharing a card — never as a clean forward line while keeping one node per card. Don't build any multi-route rendering without reading `.scratch/multiple-routes/findings.md` first.

## Agent skills

### Issue tracker

Issues and specs live as local markdown under `.scratch/<feature>/` (no remote; this is a local prototype). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
