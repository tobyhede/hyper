import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

/**
 * The inventory's Vite config, kept separate from `vite.config.ts` on purpose.
 *
 * The app's config mounts `spaceHttpPlugin`, which loads a server runtime and
 * opens a repository. The inventory is fixture data and no live mutations, so
 * inheriting that would boot a database behind a static catalogue.
 *
 * Only Tailwind is added. Ladle supplies its own React pipeline, and adding a
 * second React plugin beside it double-transforms every component.
 *
 * No `resolve.alias`: `@project/*` resolves through the workspace `exports` the
 * app already depends on, exactly as it does in the browser build.
 * `workspace-aliases.ts` exists for the SSR runtime that starts above this
 * package, and nothing here starts there.
 */
export default defineConfig({
  plugins: [tailwindcss()],
});
