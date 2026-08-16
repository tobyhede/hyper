/**
 * Ladle is the static catalogue for Hyper's production components and surfaces.
 * Stories render exported production components over fixture data and perform
 * no live mutations.
 *
 * Stories live in `stories/` rather than `src/`, deliberately. Lint scopes
 * `react-refresh/only-export-components` to `packages/app/src/**\/*.tsx` and
 * `pnpm lint` runs at `--max-warnings=0`, so a story module — which exports a
 * meta object beside its components — fails the build from inside `src`. Out
 * here it does not, and design exploration stays out of the source tree the app
 * is built from.
 */
export default {
  stories: 'stories/**/*.stories.tsx',

  // Only Tailwind is added; Ladle brings its own React pipeline (SWC). The
  // app's own `vite.config.ts` must NOT be reused — it mounts the space HTTP
  // plugin, which would boot a repository behind a static catalogue.
  viteConfig: import.meta.dirname + '/../ladle-vite.config.ts',

  // Ladle's default. Stated rather than inherited because the repo reserves
  // 5173–5175 for the human's dev servers and 5300+ for Playwright workers, and
  // a future default change must not walk into either.
  port: 61000,
  previewPort: 61001,

  // Inter Tight and IBM Plex Mono are the design's type. Loaded here rather
  // than through a CSS `@import` so the preconnect can go with them.
  appendToHead: [
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">',
  ].join(''),

  // Component contracts first, then composed product surfaces and finally the
  // unresolved visual questions that must not leak into stable stories.
  storyOrder: ['components-*', 'surfaces-*', 'review-*'],

  addons: {
    // Off by default in Ladle. On here because the card's affordances are
    // glyph-only by design, so accessible naming is load-bearing rather than
    // incidental.
    a11y: { enabled: true },
    // Ladle exposes only the production theme; proposals belong in explicit
    // review stories with an owner and rendered alternatives.
    theme: { enabled: false, defaultState: 'light' },
    // No RTL requirement has been stated, and an untested direction in the
    // switcher reads as a supported one.
    rtl: { enabled: false },
    msw: { enabled: false },
  },
};
