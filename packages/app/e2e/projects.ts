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
