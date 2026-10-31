import { createContext } from 'react';
import { createObservableState, type ObserverErrorReporter } from '@project/persistence';

/** What the reader asked for: a theme, or whatever their system says. */
export type ColorSchemePreference = 'light' | 'dark' | 'system';

/** The theme drawn, which is `data-theme` on the root element. */
export type ColorSchemeTheme = 'light' | 'dark';

const PREFERENCES: readonly ColorSchemePreference[] = ['light', 'dark', 'system'];

const isPreference = (value: string | null): value is ColorSchemePreference =>
  PREFERENCES.some((preference) => preference === value);

/** The key the preference is kept under in the reader's own browser. */
export const COLOR_SCHEME_STORAGE_KEY = 'infinity-cube:color-scheme';

/**
 * The theme toggle's state. Its subscription is the shape React's
 * `useSyncExternalStore` takes.
 */
export interface ColorScheme {
  readonly getPreference: () => ColorSchemePreference;
  readonly subscribe: (listener: () => void) => () => void;
  readonly choose: (preference: ColorSchemePreference) => void;
}

/** The parts of the browser the theme reads and writes, handed in by the entry. */
export interface ColorSchemeHost {
  /** The element whose `data-theme` the stylesheets key off: the document's root. */
  readonly root: Pick<HTMLElement, 'dataset'>;
  /** Where the preference survives a reload, when the browser offers it. */
  readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  /** `(prefers-color-scheme: dark)`, which `system` follows while it is chosen. */
  readonly systemDark: {
    readonly matches: boolean;
    readonly addEventListener: (type: 'change', listener: () => void) => void;
  };
  readonly reportObserverError: ObserverErrorReporter;
}

/**
 * Keep `data-theme` on the root element in step with the reader's preference.
 *
 * The theme stylesheets and Tailwind's `dark:` variant key off `data-theme`
 * alone, so this is the one place that decides it: the chosen theme, or for
 * `system` the operating system's, followed as it changes. The preference is
 * kept in the browser's own storage, which is a per-viewer convenience: where
 * storage is missing or refuses, the toggle still works for the page's
 * lifetime, and a fresh page starts at `system`.
 */
export function createColorScheme(host: ColorSchemeHost): ColorScheme {
  const read = (): ColorSchemePreference => {
    try {
      const stored = host.storage?.getItem(COLOR_SCHEME_STORAGE_KEY) ?? null;
      return isPreference(stored) ? stored : 'system';
    } catch {
      return 'system';
    }
  };
  const preference = createObservableState(read(), host.reportObserverError);

  const apply = (): void => {
    const chosen = preference.getState();
    const theme: ColorSchemeTheme =
      chosen === 'system' ? (host.systemDark.matches ? 'dark' : 'light') : chosen;
    host.root.dataset['theme'] = theme;
  };

  apply();
  host.systemDark.addEventListener('change', apply);

  return {
    getPreference: preference.getState,
    subscribe: preference.subscribe,
    choose: (next) => {
      if (next === preference.getState()) return;
      try {
        host.storage?.setItem(COLOR_SCHEME_STORAGE_KEY, next);
      } catch {
        // Kept for this page only: storage is a convenience, not the state.
      }
      preference.install(next);
      apply();
      preference.notify();
    },
  };
}

/**
 * The page's theme toggle, provided by the entry that composed it. Absent, the
 * Command Dock draws no toggle.
 */
export const ColorSchemeContext = createContext<ColorScheme | null>(null);
