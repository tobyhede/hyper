import { describe, expect, it } from 'vitest';
import { DEFAULT_GRAPH_HEAD_SHAPE, GRAPH_HEAD_SHAPES, graphHeadShape } from '../src/index';

describe('graphHeadShape', () => {
  it('draws a Graph with no stored head shape as an arrow (ADR 0105)', () => {
    expect(DEFAULT_GRAPH_HEAD_SHAPE).toBe('arrow');
    expect(graphHeadShape({})).toBe('arrow');
  });

  it('draws a stored head shape as itself', () => {
    for (const headShape of GRAPH_HEAD_SHAPES) {
      expect(graphHeadShape({ headShape })).toBe(headShape);
    }
  });
});
