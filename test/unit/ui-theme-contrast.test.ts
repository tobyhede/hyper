import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRAPH_PALETTE } from '@project/graph';
import { buttonVariants, FALLBACK_GRAPH_COLOR } from '@project/ui';

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
  { theme: 'Neon Glitch', variables: variablesOf(`${theme}\n${darkTheme}`) },
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

// A Graph's colour is stored with the Graph, chosen against sand, and is drawn
// unchanged on the dark canvas. WCAG 2.2 1.4.11 asks 3:1 of a graphical object
// against what is next to it; on sand most light slots sit far below that,
// which is why this is asked of the dark canvas alone.
describe('Graph colours on the Neon Glitch canvas', () => {
  const darkVariables = THEMES[1].variables;

  it.each([...GRAPH_PALETTE, FALLBACK_GRAPH_COLOR])('%s reaches 3:1 on the canvas', (color) => {
    expect(contrast(color, resolveColor(darkVariables, '--background'))).toBeGreaterThanOrEqual(3);
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
