import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRAPH_PALETTE, nextGraphColor } from '@project/graph';
import { buttonVariants, FALLBACK_GRAPH_COLOR, graphPaint } from '@project/ui';

const theme = readFileSync(new URL('../../packages/app/src/tailwind.css', import.meta.url), 'utf8');

// The dark theme restates the semantic roles, so it is read after the sand
// theme and its declarations win, as they do in the browser.
const darkTheme = readFileSync(
  new URL('../../packages/app/src/theme-dark.css', import.meta.url),
  'utf8',
);

const variablesOf = (css: string): ReadonlyMap<string, string> =>
  new Map([...css.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [match[1]!, match[2]!]));

const variables = variablesOf(theme);

const THEMES = [
  { theme: 'sand', variables },
  { theme: 'dark', variables: variablesOf(`${theme}\n${darkTheme}`) },
] as const;

const resolveColor = (themeVariables: ReadonlyMap<string, string>, name: string): string => {
  const value = themeVariables.get(name);
  if (value === undefined) throw new Error(`Missing theme variable ${name}`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  return reference === undefined ? value : resolveColor(themeVariables, reference);
};

const luminance = (hex: string): number => {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  if (channels?.length !== 3) throw new Error(`Expected a six-digit hex color, received ${hex}`);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
};

const contrast = (first: string, second: string): number => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
};

// `@theme inline` re-declares every root token as `--color-X` for Tailwind's
// utility generator; only the root tokens themselves are the semantic roles.
const rolesWithForeground = [...variables.keys()]
  .filter(
    (name) =>
      !name.startsWith('--color-') &&
      !name.endsWith('-foreground') &&
      variables.has(`${name}-foreground`),
  )
  .map((name) => name.slice(2))
  .sort();

describe.each(THEMES)('semantic theme contrast ($theme)', ({ variables: themeVariables }) => {
  it('background supports normal text at WCAG AA contrast', () => {
    expect(
      contrast(
        resolveColor(themeVariables, '--background'),
        resolveColor(themeVariables, '--foreground'),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(rolesWithForeground)('%s supports normal text at WCAG AA contrast', (role) => {
    expect(
      contrast(
        resolveColor(themeVariables, `--${role}`),
        resolveColor(themeVariables, `--${role}-foreground`),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  // Status colours have no `-foreground` partner: they are drawn as text on
  // the chrome's paper.
  it.each(['destructive', 'success'])('%s reads at WCAG AA on chrome paper', (role) => {
    expect(
      contrast(resolveColor(themeVariables, `--${role}`), resolveColor(themeVariables, '--card')),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

// A Graph's colour is stored with the Graph as a Tableau slot, and each theme
// paints that slot through the custom property `graphPaint` names. What is
// asked here is the paint each theme draws. WCAG 2.2 1.4.11 asks 3:1 of a
// graphical object against what is next to it: the canvas under an Edge, and
// both Resource faces inside a Graph-coloured border.

/** A hex colour as an OKLab point, through Björn Ottosson's sRGB matrices. */
const oklab = (hex: string, simulate?: readonly (readonly number[])[]): readonly number[] => {
  const linear = [0, 2, 4].map((i) => {
    const channel = Number.parseInt(hex.slice(1 + i, 3 + i), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = (
    simulate === undefined
      ? linear
      : simulate.map((row) => row[0]! * linear[0]! + row[1]! * linear[1]! + row[2]! * linear[2]!)
  ).map((channel) => Math.min(1, Math.max(0, channel)));
  const l = Math.cbrt(0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!);
  const m = Math.cbrt(0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!);
  const s = Math.cbrt(0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

// Machado, Oliveira and Fernandes (2009) at severity 1.0, in linear sRGB.
const PROTANOPIA = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
] as const;
const DEUTERANOPIA = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
] as const;

/** OKLab distance ×100, the unit the colour-vision thresholds below are stated in. */
const deltaE = (
  first: string,
  second: string,
  simulate?: readonly (readonly number[])[],
): number => {
  const p = oklab(first, simulate);
  const q = oklab(second, simulate);
  return 100 * Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
};

// The first five Graphs Add Graph hands an empty Map, chosen as it chooses
// them: from the stored slots, by `nextGraphColor`.
const FIRST_FIVE = Array.from({ length: 5 }).reduce<string[]>(
  (chosen) => [...chosen, nextGraphColor(chosen)],
  [],
);

/** A hex colour's OKLCH chroma and hue in degrees, from its OKLab point. */
const chromaHue = (hex: string): { readonly chroma: number; readonly hue: number } => {
  const [, a, b] = oklab(hex);
  return {
    chroma: Math.hypot(a!, b!),
    hue: ((Math.atan2(b!, a!) * 180) / Math.PI + 360) % 360,
  };
};

// OKLCH hues from yellow-orange to yellow-green, the band the dark theme keeps
// out of every colour it paints: yellow on its near-black ground reads as
// glare whatever its contrast ratio.
const YELLOW_HUES = { from: 78, to: 120 } as const;

describe.each([THEMES[1]])('Graph colours ($theme)', ({ variables: themeVariables }) => {
  const drawn = (color: string): string => {
    const property = /^var\((--[\w-]+), #[0-9a-f]{6}\)$/i.exec(graphPaint(color))?.[1];
    return property === undefined || !themeVariables.has(property)
      ? color
      : resolveColor(themeVariables, property);
  };

  it.each([...GRAPH_PALETTE])('%s has a paint of its own', (color) => {
    expect(drawn(color)).not.toBe(color);
  });

  const grounds = [
    '--background',
    '--canvas-resource-face-rest',
    '--canvas-resource-face-active',
  ] as const;

  it.each(GRAPH_PALETTE.flatMap((color) => grounds.map((ground) => ({ color, ground }))))(
    '$color reaches 3:1 on $ground',
    ({ color, ground }) => {
      expect(contrast(drawn(color), resolveColor(themeVariables, ground))).toBeGreaterThanOrEqual(
        3,
      );
    },
  );

  // Any two of them can cross on a Map, so every pair is asked. 8 is the
  // separation a reader with protanopia or deuteranopia needs to tell two
  // marks apart, and 15 the floor for everyone else.
  const pairs = FIRST_FIVE.flatMap((first, index) =>
    FIRST_FIVE.slice(index + 1).map((second) => ({ first, second })),
  );

  it.each(pairs)('the first five Graphs keep $first and $second apart', ({ first, second }) => {
    const [a, b] = [drawn(first), drawn(second)];
    expect(deltaE(a, b)).toBeGreaterThanOrEqual(15);
    expect(deltaE(a, b, PROTANOPIA)).toBeGreaterThanOrEqual(8);
    expect(deltaE(a, b, DEUTERANOPIA)).toBeGreaterThanOrEqual(8);
  });
});

describe('the dark theme keeps its colours to their jobs', () => {
  const darkVariables = THEMES[1].variables;
  const drawn = (color: string): string => {
    const property = /^var\((--[\w-]+), #[0-9a-f]{6}\)$/i.exec(graphPaint(color))?.[1];
    return property === undefined ? color : resolveColor(darkVariables, property);
  };

  const painted = [
    ...GRAPH_PALETTE.map((color) => ({ name: `Graph ${color}`, hex: drawn(color) })),
    ...['--primary', '--ring', '--destructive', '--success'].map((name) => ({
      name,
      hex: resolveColor(darkVariables, name),
    })),
  ];

  it.each(painted)('$name ($hex) is not yellow', ({ hex }) => {
    const { chroma, hue } = chromaHue(hex);
    expect(chroma < 0.04 || hue < YELLOW_HUES.from || hue > YELLOW_HUES.to).toBe(true);
  });

  // A Resource in no Graph is lined in the ink, so any colour there would read
  // as a Graph's.
  it('lines a Resource in no Graph in a neutral', () => {
    expect(
      chromaHue(resolveColor(darkVariables, '--canvas-resource-ink-color')).chroma,
    ).toBeLessThan(0.03);
  });

  // The selection ring is the chrome's magenta on every Resource (ADR 0135), so
  // no Graph may be painted near it or selecting that Graph's Resource would
  // not show.
  it.each([...GRAPH_PALETTE])('keeps %s clear of the selection colour', (color) => {
    expect(deltaE(drawn(color), resolveColor(darkVariables, '--primary'))).toBeGreaterThanOrEqual(
      10,
    );
  });
});

describe('the fallback Graph colour on the dark canvas', () => {
  it('reaches 3:1', () => {
    const darkVariables = THEMES[1].variables;
    expect(
      contrast(FALLBACK_GRAPH_COLOR, resolveColor(darkVariables, '--background')),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe('semantic theme', () => {
  // Asked of the classes `Button` actually resolves rather than of any file's
  // text, so the assertion cannot keep alive a stylesheet rule no module emits.
  it('uses the semantic foreground token for primary buttons', () => {
    const classes = buttonVariants({ variant: 'default' }).split(/\s+/);

    expect(classes).toContain('bg-primary');
    expect(classes).toContain('text-primary-foreground');
  });
});
