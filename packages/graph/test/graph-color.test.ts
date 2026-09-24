import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  GRAPH_PALETTE,
  GRAPH_PALETTE_ENTRIES,
  graphColorDistance,
  nextGraphColor,
} from '../src/graph-color';

/** The dark slot of each hue — the even slots, by the layout the palette tests below hold. */
const DARK_SLOTS = GRAPH_PALETTE.filter((_, index) => index % 2 === 0);
const LIGHT_SLOTS = GRAPH_PALETTE.filter((_, index) => index % 2 === 1);

/** Each slot's label, read back through the entries the swatch picker draws. */
const labelOf = (color: string): string | undefined =>
  GRAPH_PALETTE_ENTRIES.find((entry) => entry.color === color)?.label;

/** The closest `existing` colour to `candidate`, ignoring what cannot be read as a colour. */
const minimumDistance = (candidate: string, existing: readonly string[]): number =>
  existing.reduce((nearest, color) => {
    const distance = graphColorDistance(candidate, color);
    return distance === null ? nearest : Math.min(nearest, distance);
  }, Number.POSITIVE_INFINITY);

describe('GRAPH_PALETTE', () => {
  it('holds twenty Tableau 20 slots with a label for each', () => {
    expect(GRAPH_PALETTE).toHaveLength(20);
    expect(GRAPH_PALETTE_ENTRIES.map((entry) => entry.color)).toEqual(GRAPH_PALETTE);
    for (const { label } of GRAPH_PALETTE_ENTRIES) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('lays hue pairs out as dark then light in colour-wheel order for the swatch picker', () => {
    expect(GRAPH_PALETTE.slice(0, 4)).toEqual(['#1f77b4', '#aec7e8', '#17becf', '#9edae5']);
    expect(GRAPH_PALETTE.slice(-4)).toEqual(['#8c564b', '#c49c94', '#7f7f7f', '#c7c7c7']);
    for (const light of LIGHT_SLOTS) {
      expect(labelOf(light)).toMatch(/ light$/);
    }
    for (const dark of DARK_SLOTS) {
      expect(labelOf(dark)).not.toMatch(/ light$/);
    }
  });
});

describe('graphColorDistance', () => {
  it('is zero for a colour and itself, whatever its case', () => {
    expect(graphColorDistance('#1f77b4', '#1F77B4')).toBe(0);
  });

  it('separates a hue from its light partner', () => {
    expect(graphColorDistance('#1f77b4', '#aec7e8')).toBeGreaterThan(0.1);
  });

  it('reads #rgb shorthand as its six-digit spelling', () => {
    expect(graphColorDistance('#fff', '#ffffff')).toBe(0);
  });

  it('answers null for a colour it cannot read', () => {
    expect(graphColorDistance('#1f77b4', 'rebeccapurple')).toBeNull();
    expect(graphColorDistance('var(--x)', '#1f77b4')).toBeNull();
  });
});

describe('nextGraphColor', () => {
  it('gives an empty Map the first slot', () => {
    expect(nextGraphColor([])).toBe(GRAPH_PALETTE[0]);
  });

  it('gives a Map carrying blue a strong colour that is not blue', () => {
    const chosen = nextGraphColor([GRAPH_PALETTE[0]]);
    expect(DARK_SLOTS).toContain(chosen);
    expect(chosen).not.toBe(GRAPH_PALETTE[0]);
  });

  it('never gives a Map carrying blue its light partner', () => {
    expect(nextGraphColor([GRAPH_PALETTE[0]])).not.toBe(GRAPH_PALETTE[1]);
  });

  it('offers the light slots only once all ten strong colours are in use', () => {
    expect(DARK_SLOTS).toContain(nextGraphColor(DARK_SLOTS.slice(1)));
    expect(LIGHT_SLOTS).toContain(nextGraphColor(DARK_SLOTS));
  });

  it('breaks ties by palette order', () => {
    // Every slot already in use puts every candidate at distance zero.
    expect(nextGraphColor(GRAPH_PALETTE)).toBe(GRAPH_PALETTE[0]);
    // Nothing readable puts every candidate at infinity.
    expect(nextGraphColor(['rebeccapurple'])).toBe(GRAPH_PALETTE[0]);
  });

  it('meets no tie at a nonzero finite distance while the Map carries only palette colours', () => {
    // Two candidates tie at a nonzero minimum only if two different palette
    // pairs lie at exactly the same distance. None do, so the palette-order
    // tie-break is reached from palette colours only at zero or at infinity,
    // which the example above covers.
    const distances = GRAPH_PALETTE.flatMap((first, index) =>
      GRAPH_PALETTE.slice(index + 1).map((second) => graphColorDistance(first, second)),
    );
    expect(new Set(distances).size).toBe(distances.length);
  });

  it('ignores a colour it cannot read', () => {
    expect(nextGraphColor(['rebeccapurple'])).toBe(GRAPH_PALETTE[0]);
    expect(nextGraphColor(['rebeccapurple', GRAPH_PALETTE[0]])).toBe(
      nextGraphColor([GRAPH_PALETTE[0]]),
    );
  });

  it('reads a stored colour in any case as the slot it spells', () => {
    expect(nextGraphColor(['#1F77B4'])).toBe(nextGraphColor([GRAPH_PALETTE[0]]));
    expect(LIGHT_SLOTS).toContain(nextGraphColor(DARK_SLOTS.map((color) => color.toUpperCase())));
  });

  it('keeps its distance from a colour outside the palette', () => {
    // Nearly blue, so blue is never the farthest while another strong slot is free.
    expect(nextGraphColor(['#1f77b5'])).not.toBe(GRAPH_PALETTE[0]);
  });

  it('chooses the eligible slot whose nearest existing colour is farthest, first in palette order', () => {
    const hex = fc
      .array(fc.integer({ min: 0, max: 15 }), { minLength: 6, maxLength: 6 })
      .map((digits) => `#${digits.map((digit) => digit.toString(16)).join('')}`);
    const existingColor = fc.oneof(fc.constantFrom(...GRAPH_PALETTE), hex, fc.string());
    fc.assert(
      fc.property(fc.array(existingColor, { maxLength: 24 }), (existing) => {
        const used = new Set(existing.map((color) => color.toLowerCase()));
        const eligible = DARK_SLOTS.some((slot) => !used.has(slot)) ? DARK_SLOTS : GRAPH_PALETTE;
        const chosen = nextGraphColor(existing);
        expect(eligible).toContain(chosen);
        const chosenDistance = minimumDistance(chosen, existing);
        const chosenIndex = eligible.findIndex((candidate) => candidate === chosen);
        eligible.forEach((candidate, index) => {
          const distance = minimumDistance(candidate, existing);
          expect(distance).toBeLessThanOrEqual(chosenDistance);
          if (index < chosenIndex) expect(distance).toBeLessThan(chosenDistance);
        });
      }),
    );
  });
});
