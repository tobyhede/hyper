import { createColorScheme, type ColorScheme } from './color-scheme';

/**
 * The page's theme over the real browser: the document's root element, its
 * `localStorage` where the browser lets the page reach it, and the system's
 * `(prefers-color-scheme: dark)`. Every entry that draws the application
 * composes one, so `data-theme` is set before the first frame.
 */
export function createBrowserColorScheme(window: Window): ColorScheme {
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  })();
  return createColorScheme({
    root: window.document.documentElement,
    storage,
    systemDark: window.matchMedia('(prefers-color-scheme: dark)'),
    reportObserverError: (error) => console.error('Theme observer failed', error),
  });
}
