import { describe, expect, it } from 'vitest';
import {
  GRAPH_PALETTE,
  GRAPH_PALETTE_ENTRIES,
  GRAPH_PALETTE_LABELS,
  nextGraphColor,
} from '../src/colors';

describe('GRAPH_PALETTE', () => {
  it('holds twenty Tableau 20 slots with a label for each', () => {
    expect(GRAPH_PALETTE).toHaveLength(20);
    expect(GRAPH_PALETTE_ENTRIES).toHaveLength(20);
    for (const { color, label } of GRAPH_PALETTE_ENTRIES) {
      expect(GRAPH_PALETTE_LABELS[color]).toBe(label);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('rotates nextGraphColor through every slot', () => {
    const seen = new Set<string>();
    for (let index = 0; index < GRAPH_PALETTE.length; index += 1) {
      seen.add(nextGraphColor(index));
    }
    expect(seen.size).toBe(GRAPH_PALETTE.length);
    expect(nextGraphColor(GRAPH_PALETTE.length)).toBe(nextGraphColor(0));
  });

  it('lays hue pairs out as dark then light in colour-wheel order for the swatch picker', () => {
    expect(GRAPH_PALETTE.slice(0, 4)).toEqual(['#1f77b4', '#aec7e8', '#17becf', '#9edae5']);
    expect(GRAPH_PALETTE.slice(-4)).toEqual(['#8c564b', '#c49c94', '#7f7f7f', '#c7c7c7']);
  });
});
