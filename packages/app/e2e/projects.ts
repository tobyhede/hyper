/**
 * The Playwright project whose Vite host starts from an empty catalog, so
 * server-side database startup mints the one-card new Space (ADR 0018).
 *
 * Shared because two files have to agree on it: `playwright.config.ts` declares
 * the project, and `fixtures.ts` selects the `e2e-empty` Vite mode by comparing
 * against it. Renaming one alone would quietly serve the tracked fixture to the
 * new-space spec — a green run asserting the wrong catalog.
 *
 * Its sibling, the tracked-fixture project, is deliberately *not* here. This
 * constant exists because a name is compared; that one is only ever selected,
 * by `playwright.config.ts` declaring it and the `e2e:fixture` script asking
 * for it. An npm script cannot read a TypeScript constant, so exporting one
 * would leave the script's copy of the literal exactly as unlinked as it is now
 * while making the pair look shared. Renaming that project fails loudly —
 * Playwright reports the project as not found — and `fixtures.ts` reaches the
 * fixture mode by falling through this comparison rather than by matching a
 * name, so nothing can silently serve the wrong catalog from it.
 */
export const NEW_SPACE_PROJECT = 'new-space';

/**
 * The default suite's first Vite host port. Each worker takes
 * `E2E_PORT_BASE + workerIndex`, so the range is open-ended upward and its
 * width is whatever worker count Playwright picks.
 *
 * Shared for the same reason as the project name: `fixtures.ts` computes the
 * default suite's ports and `postgres-persistence.spec.ts` fixes its own, and
 * both run under `strictPort`. An overlap fails the host rather than retrying,
 * which reads as an unrelated startup fault. `POSTGRES_E2E_PORT` sits *below*
 * the base so no worker index can reach it — a rule arithmetic enforces, rather
 * than a gap that holds only until someone raises `--workers`.
 */
export const E2E_PORT_BASE = 5300;

/**
 * Vite's dependency optimizer mutates its cache while a cold host starts. The
 * E2E suite starts one host per test and runs workers concurrently, so sharing
 * Vite's default cache lets one worker invalidate another worker's first page.
 * Hosts are sequential within a worker and can safely reuse that worker's
 * cache, retaining the startup benefit without cross-worker mutation.
 */
export function workerScopedViteCacheDir(appRoot: string, workerIndex: number): string {
  return path.join(appRoot, 'node_modules', '.vite-e2e', String(workerIndex));
}

/** The opt-in PostgreSQL project's fixed Vite host port. */
export const POSTGRES_E2E_PORT = 5280;
import path from 'node:path';
