import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const theme = readFileSync(new URL('../../packages/app/src/tailwind.css', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../packages/app/src/styles.css', import.meta.url), 'utf8');

const variables = new Map(
  [...theme.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [match[1], match[2]]),
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

describe('semantic theme contrast', () => {
  it.each(['primary', 'accent'])('%s supports normal text at WCAG AA contrast', (role) => {
    expect(
      contrast(resolveColor(`--${role}`), resolveColor(`--${role}-foreground`)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the semantic foreground token for primary buttons', () => {
    expect(styles).toMatch(/\.btn--primary\s*{[^}]*color:\s*var\(--primary-foreground\)/s);
  });
});
