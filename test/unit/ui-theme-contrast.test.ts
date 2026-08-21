import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buttonVariants } from '@project/ui';

const theme = readFileSync(new URL('../../packages/app/src/tailwind.css', import.meta.url), 'utf8');

const variables = new Map(
  [...theme.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [match[1]!, match[2]!]),
);

const resolveColor = (name: string): string => {
  const value = variables.get(name);
  if (value === undefined) throw new Error(`Missing theme variable ${name}`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  return reference === undefined ? value : resolveColor(reference);
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

describe('semantic theme contrast', () => {
  it('background supports normal text at WCAG AA contrast', () => {
    expect(
      contrast(resolveColor('--background'), resolveColor('--foreground')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(rolesWithForeground)('%s supports normal text at WCAG AA contrast', (role) => {
    expect(
      contrast(resolveColor(`--${role}`), resolveColor(`--${role}-foreground`)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  // Asked of the classes `Button` actually resolves rather than of any file's
  // text. It used to read a `.btn--primary` rule out of the app stylesheet,
  // which no module had emitted since the toolbar was replaced — so the only
  // thing keeping that rule alive was this assertion about it.
  it('uses the semantic foreground token for primary buttons', () => {
    const classes = buttonVariants({ variant: 'default' }).split(/\s+/);

    expect(classes).toContain('bg-primary');
    expect(classes).toContain('text-primary-foreground');
  });
});
