import { describe, expect, it } from 'vitest';
import {
  COLOR_SCHEME_STORAGE_KEY,
  createColorScheme,
  type ColorSchemeHost,
} from '../src/color-scheme';

/** A system preference the test can turn over, as the operating system would. */
function systemDark(matches: boolean) {
  const listeners: (() => void)[] = [];
  return {
    matches,
    addEventListener: (_type: 'change', listener: () => void) => {
      listeners.push(listener);
    },
    turn(next: boolean) {
      this.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

function host({
  stored,
  ...overrides
}: Partial<ColorSchemeHost> & { readonly stored?: string } = {}) {
  const values = new Map<string, string>();
  if (stored !== undefined) values.set(COLOR_SCHEME_STORAGE_KEY, stored);
  const system = systemDark(false);
  const dataset: DOMStringMap = {};
  const reported: unknown[] = [];
  const parts = {
    root: { dataset },
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    },
    systemDark: system,
    reportObserverError: (error) => reported.push(error),
    ...overrides,
  } satisfies ColorSchemeHost;
  return { parts, values, system, reported };
}

describe('createColorScheme', () => {
  it('starts at System and draws what the system asks for, following it as it turns', () => {
    const { parts, system } = host();
    const scheme = createColorScheme(parts);

    expect(scheme.getPreference()).toBe('system');
    expect(parts.root.dataset['theme']).toBe('light');
    system.turn(true);
    expect(parts.root.dataset['theme']).toBe('dark');
  });

  it('draws a chosen theme whatever the system says, keeps it, and tells subscribers', () => {
    const { parts, values, system } = host();
    const scheme = createColorScheme(parts);
    let told = 0;
    scheme.subscribe(() => {
      told += 1;
    });

    scheme.choose('dark');

    expect(parts.root.dataset['theme']).toBe('dark');
    expect(values.get(COLOR_SCHEME_STORAGE_KEY)).toBe('dark');
    expect(told).toBe(1);
    system.turn(false);
    expect(parts.root.dataset['theme']).toBe('dark');
  });

  it('starts from the kept choice, and from System when what is kept is not one', () => {
    expect(createColorScheme(host({ stored: 'light' }).parts).getPreference()).toBe('light');
    expect(createColorScheme(host({ stored: 'sepia' }).parts).getPreference()).toBe('system');
  });

  it('still chooses for the page when storage refuses', () => {
    const refusing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const { parts } = host({ storage: refusing });
    const scheme = createColorScheme(parts);

    expect(scheme.getPreference()).toBe('system');
    scheme.choose('dark');
    expect(scheme.getPreference()).toBe('dark');
    expect(parts.root.dataset['theme']).toBe('dark');
  });
});
