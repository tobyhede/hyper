/**
 * Ladle drives the **surface inventory**: a static catalogue of every surface
 * Hyper draws, in the locked card design (option `8a`), over fixture data and
 * with no live mutations. Its purpose is to settle spacing, hierarchy and
 * component variants, and to answer which components need to exist.
 *
 * Ladle rather than a route in the app, which is what the design handoff first
 * proposed. Three reasons, and the third is the one that decided it:
 *
 *  - The states matrix the second pass asks for *is* what stories are. A route
 *    would hand-roll a grid of forced states that a story file expresses as
 *    named exports.
 *  - The `control` addon gives the live graph-colour tweak the design prototype
 *    had, without wiring a control panel by hand.
 *  - Dark mode is **undecided** (candidates `8d`/`8e`/`8f`). The `theme` addon
 *    is where those candidates can sit side by side and be chosen, rather than
 *    one of them being hardcoded into the app to be looked at.
 *
 * It also leaves nothing behind in the shipped app: no route, no dead component,
 * nothing for a reader to mistake for product code.
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

  // The build order of the inventory, which is also the order the handoff asks
  // for it to be reviewed in: shell first, then the chooser, then the canvas.
  storyOrder: [
    'shell--*',
    'workspace-chooser--*',
    'cards--*',
    'canvas--*',
    'design-system--*',
    'tokens--*',
  ],

  addons: {
    // Off by default in Ladle. On here because the card's affordances are
    // glyph-only by design, so accessible naming is load-bearing rather than
    // incidental — the handoff's own manifest says tooltips carry the labels
    // that were deliberately removed.
    a11y: { enabled: true },
    // The design is light. Dark is a live question, and the toggle is where it
    // gets answered — see `.ladle/components.tsx`, which refuses to invent one.
    theme: { enabled: true, defaultState: 'light' },
    // No RTL requirement has been stated, and an untested direction in the
    // switcher reads as a supported one.
    rtl: { enabled: false },
    msw: { enabled: false },
  },
};
