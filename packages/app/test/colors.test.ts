import { describe, expect, it } from 'vitest';
import { uuidSchema, type Graph } from '@project/core';
import { GRAPH_PALETTE } from '@project/graph';
import { connectionAppearance } from '../src/colors';

const PLAIN = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const DOTTED = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const graphs: readonly Graph[] = [
  { id: PLAIN, title: 'Plain', edges: [] },
  { id: DOTTED, title: 'Dotted', headShape: 'dot', edges: [] },
];
const colors = { [PLAIN]: '#1f77b4', [DOTTED]: '#ff7f0e' };

describe('connectionAppearance', () => {
  it('draws a connection in the joined Graph’s colour and stored head shape', () => {
    expect(connectionAppearance(graphs, colors, DOTTED)).toEqual({
      color: '#ff7f0e',
      headShape: 'dot',
    });
  });

  it('carries no head shape for a Graph that stores none, or before any Graph is joined', () => {
    expect(connectionAppearance(graphs, colors, PLAIN)).toEqual({
      color: '#1f77b4',
      headShape: undefined,
    });
    expect(connectionAppearance(graphs, colors, null)).toEqual({
      color: GRAPH_PALETTE[0],
      headShape: undefined,
    });
  });
});
