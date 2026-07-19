# AGENTS.md

Instructions for AI coding agents working in this repo.

A local, file-first prototype for **graph-native technical presentations**: Markdown cards on a spatial graph, authored as a JSON manifest and presented as a curated path (a single colored "rail") that elkjs lays out automatically. pnpm + TypeScript (strict) monorepo.

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
- **One path at a time.** The app renders the single selected path; elkjs lays out only that path's chain. Overlaying multiple paths is a deliberate non-goal — it makes ELK reconcile conflicting orderings and the graph turns to spaghetti.
- **ELK port offsets are applied to handles.** ELK computes each port's position; those exact offsets drive where `CardNode` handles render so the colored rails line up. Don't hardcode handle positions.
- **Styling is split:** `ui` uses Tailwind v4 + shadcn-style primitives; the graph/card CSS stays hand-rolled in `packages/app/src/styles.css`. Tailwind scans `app` + `ui/src` via `@source` in `tailwind.css`.
- **Markdown is excluded from Prettier** (`.prettierignore`) — don't rely on `format` to touch `*.md`.

## Before claiming done

- Run `pnpm verify` and report the real output.
- For any UI/graph change, also run `pnpm e2e` and report it.
- Do not assert success without having run the commands.

## Scope discipline

Keep to the MVP. Don't over-generalize the domain model, don't re-introduce multi-path overlay, and don't add features beyond what's asked.
