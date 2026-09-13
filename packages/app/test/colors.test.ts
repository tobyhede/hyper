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
});
