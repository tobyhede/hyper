/**
 * The Playwright project whose Vite host starts from an empty catalog, so
 * server-side database startup mints the one-card new Space (ADR 0018).
 *
 * Shared because two files have to agree on it: `playwright.config.ts` declares
 * the project, and `fixtures.ts` selects the `e2e-empty` Vite mode by comparing
 * against it. Renaming one alone would quietly serve the tracked fixture to the
 * new-space spec — a green run asserting the wrong catalog.
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

/** The opt-in PostgreSQL project's fixed Vite host port. */
export const POSTGRES_E2E_PORT = 5280;
