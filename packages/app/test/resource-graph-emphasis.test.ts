import { describe, expect, it } from 'vitest';
import { uuidSchema, type GraphId } from '@project/core';
import { loadSpace, type Space } from '@project/graph';
import { resourceGraphEmphasis } from '../src/resource-graph-emphasis';
import { resourceFile } from './resource-files';

const A = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const B = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');
const C = uuidSchema.parse('00000000-0000-4000-8000-00000000000c');
const LONE = uuidSchema.parse('00000000-0000-4000-8000-00000000000d');
const FIRST = uuidSchema.parse('00000000-0000-4000-8000-000000000101');
const SECOND = uuidSchema.parse('00000000-0000-4000-8000-000000000102');
const EMPTY = uuidSchema.parse('00000000-0000-4000-8000-000000000103');
const MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000201');

const COLORS = { [FIRST]: '#1f77b4', [SECOND]: '#d62728', [EMPTY]: '#2ca02c' };

/** A first Graph A → B, a second B → C, an empty third, and a Resource in none. */
function space(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'T',
      defaultMap: MAP,
      maps: [
        {
          id: MAP,
          title: 'Working',
          kind: 'positioned',
          positions: {
            [A]: { x: 0, y: 0 },
            [B]: { x: 400, y: 0 },
            [C]: { x: 800, y: 0 },
            [LONE]: { x: 0, y: 400 },
          },
          graphs: [
            { id: FIRST, title: 'First', edges: [{ from: A, to: B }] },
            { id: SECOND, title: 'Second', edges: [{ from: B, to: C }] },
            { id: EMPTY, title: 'Empty', edges: [] },
          ],
        },
      ],
    },
    [...resourceFile(A), ...resourceFile(B), ...resourceFile(C), ...resourceFile(LONE)],
  );
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(', '));
  return result.space;
}

function emphasisUnder(activeGraphId: GraphId | null) {
  const drawn = space();
  const graphs = drawn.maps[0]?.graphs ?? [];
  return resourceGraphEmphasis(drawn, graphs, COLORS)(activeGraphId);
}

describe('resourceGraphEmphasis (ADR 0135)', () => {
  it('draws a Resource the Active Graph reaches in its colour, at full strength', () => {
    const emphasis = emphasisUnder(SECOND);
    expect(emphasis(B)).toEqual({ borderColor: '#d62728', receding: false });
    expect(emphasis(C)).toEqual({ borderColor: '#d62728', receding: false });
  });

  it('recedes any other Resource, drawn in the first Graph it is in', () => {
    expect(emphasisUnder(SECOND)(A)).toEqual({ borderColor: '#1f77b4', receding: true });
  });

  it('draws a Resource in no Graph in ink, receding', () => {
    expect(emphasisUnder(FIRST)(LONE)).toEqual({ borderColor: null, receding: true });
  });

  it('recedes nothing while the Active Graph has no Edges', () => {
    const emphasis = emphasisUnder(EMPTY);
    expect(emphasis(A)).toEqual({ borderColor: '#1f77b4', receding: false });
    expect(emphasis(C)).toEqual({ borderColor: '#d62728', receding: false });
    expect(emphasis(LONE)).toEqual({ borderColor: null, receding: false });
  });

  it('recedes nothing with no Active Graph', () => {
    expect(emphasisUnder(null)(C)).toEqual({ borderColor: '#d62728', receding: false });
  });
});
