import { describe, expect, it } from 'vitest';
import { buildGraphRenderEdges, getGraph, graphStartCard, loadSpace } from '../src/index';
import { cardFile, uuid } from './card-files';

const CARD_A = uuid('00000000-0000-4000-8000-000000000001');
const CARD_B = uuid('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuid('00000000-0000-4000-8000-000000000003');

describe('the graph package Graph vocabulary', () => {
  it('loads, indexes, traverses, and renders an authored Graph through public names', () => {
    const loaded = loadSpace(
      {
        version: 2,
        id: uuid('00000000-0000-4000-8000-000000000004'),
        title: 'Example',
        graphs: [
          {
            id: GRAPH_ID,
            title: 'Main Graph',
            edges: [{ from: CARD_A, to: CARD_B }],
          },
        ],
      },
      [cardFile(CARD_A, 'A'), cardFile(CARD_B, 'B')],
    );

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(getGraph(loaded.space, GRAPH_ID)?.title).toBe('Main Graph');
    expect(graphStartCard(loaded.space.graphs[0]!)).toBe(CARD_A);
    expect(buildGraphRenderEdges(loaded.space)).toEqual([
      expect.objectContaining({ graphId: GRAPH_ID, source: CARD_A, target: CARD_B }),
    ]);
  });
});
