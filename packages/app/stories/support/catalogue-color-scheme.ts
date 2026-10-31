import { createBrowserColorScheme } from '#src/browser-color-scheme';

/**
 * The catalogue's one theme, composed as the application's entries compose
 * theirs, so every story draws under the `data-theme` the reader's system or
 * the theme story's own toggle asks for.
 */
export const catalogueColorScheme = createBrowserColorScheme(window);
