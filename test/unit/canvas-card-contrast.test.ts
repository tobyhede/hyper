import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The canvas Card draws on a light paper face while the rest of the app is
 * dark, so a colour carried over from the dark treatment can land on cream and
 * stay green through every other check — `canvas-card.spec.ts` asserts that the
 * refusal message says the right words, never that it can be read.
 *
 * The threshold is WCAG 2.2 AA for body text (1.4.3): 4.5:1. Both Card faces
 * are checked, because a state change swaps one for the other under text whose
 * own colour does not change.
 */

const theme = readFileSync(new URL('../../packages/app/src/tailwind.css', import.meta.url), 'utf8');
const cardCss = readFileSync(
  new URL('../../packages/ui/src/canvas-card.css', import.meta.url),
  'utf8',
);

const AA_BODY_TEXT = 4.5;

const tokens = new Map(
  [...`${theme}\n${cardCss}`.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [
    match[1]!,
    match[2]!.trim(),
  ]),
);

/** Follows a `var(--a)` chain to the literal colour it bottoms out in. */
function resolve(value: string, seen = new Set<string>()): string {
  const reference = /^var\((--[\w-]+)\)$/u.exec(value.trim());
  if (reference === null) return value.trim();
  const name = reference[1]!;
  if (seen.has(name)) throw new Error(`cyclic custom property: ${name}`);
  const next = tokens.get(name);
  if (next === undefined) throw new Error(`undefined custom property: ${name}`);
  return resolve(next, new Set(seen).add(name));
}

function channel(component: number): number {
  const c = component / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const digits = /^#([0-9a-f]{6})$/iu.exec(hex);
  if (digits === null) throw new Error(`expected a six-digit hex colour, got ${hex}`);
  const value = digits[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => channel(Number.parseInt(value.slice(i, i + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Every text role the Card draws on one of its own faces. */
const TEXT_ON_CARD = [
  { role: 'title', token: '--canvas-card-title-color' },
  { role: 'Alias Target line', token: '--canvas-card-muted-color' },
  { role: 'title refusal message', token: '--canvas-card-error-color' },
] as const;

const FACES = [
  { state: 'rest', token: '--canvas-card-face-rest' },
  { state: 'active', token: '--canvas-card-face-active' },
] as const;

describe('canvas Card text on its own faces', () => {
  const pairs = TEXT_ON_CARD.flatMap((text) =>
    FACES.map((face) => ({
      name: `${text.role} on the ${face.state} face`,
      ink: text.token,
      face: face.token,
    })),
  );

  it.each(pairs)('reads at AA: $name', ({ ink, face }) => {
    const ratio = contrast(resolve(`var(${ink})`), resolve(`var(${face})`));
    expect(ratio).toBeGreaterThanOrEqual(AA_BODY_TEXT);
  });
});

describe('canvas Card face paint', () => {
  it('stops at the inner edge of its border', () => {
    const cardRule = /^\.canvas-card \{(?<declarations>[\s\S]*?)^\}/mu.exec(cardCss);

    expect(cardRule?.groups?.['declarations']).toMatch(/background-clip:\s*padding-box;/u);
  });
});
