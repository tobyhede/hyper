import { createBrowserColorScheme } from '#src/browser-color-scheme';
import type { ColorSchemeTheme } from '#src/color-scheme';

/**
 * The catalogue's one theme, composed as the application's entries compose
 * theirs, so every story draws under the `data-theme` the reader's system or
 * the theme story's own toggle asks for.
 */
export const catalogueColorScheme = createBrowserColorScheme(window);

/**
 * Ladle writes its own `data-theme` on the root once its app mounts, after
 * this module has run, and its theme addon is off here, so the catalogue puts
 * back the theme the composed scheme decided whenever Ladle overwrites it.
 */
const root = window.document.documentElement;
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const decided = (): ColorSchemeTheme => {
  const preference = catalogueColorScheme.getPreference();
  if (preference !== 'system') return preference;
  return systemDark.matches ? 'dark' : 'light';
};
new MutationObserver(() => {
  const theme = decided();
  if (root.dataset['theme'] !== theme) root.dataset['theme'] = theme;
}).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
