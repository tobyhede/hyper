import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { loadSpace, Placement } from '@project/graph';
import { createRendererResolver, defaultLayout, RendererInvariantError } from '../src/renderer';
import { cardFile } from './card-files';

const CARD = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const MISSING = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

const loaded = loadSpace(
  {
    version: 1,
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Space',
    defaultLayout: LAYOUT,
    layouts: [
      {
        id: LAYOUT,
        title: 'Layout 1',
        kind: 'positioned',
        positions: { [CARD]: { x: 12, y: 24, open: false } },
        graphs: [{ id: GRAPH, title: 'Graph 1', edges: [] }],
        activeGraph: GRAPH,
      },
    ],
  },
  [cardFile(CARD)],
);
if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));

const resolve = createRendererResolver();

describe('Layout renderer', () => {
  it('resolves the durable default Layout and only its authored subject', () => {
    expect(defaultLayout(loaded.space)).toBe(LAYOUT);
    const renderer = resolve(loaded.space);
    expect(renderer.resolvedLayout.layout.id).toBe(LAYOUT);
    expect(renderer.subject.cards.map(({ id }) => id)).toEqual([CARD]);
    expect(renderer.subject.graphs.map(({ id }) => id)).toEqual([GRAPH]);
    expect(Placement.fromLayout(renderer.resolvedLayout.layout).get(CARD)).toMatchObject({
      x: 12,
      y: 24,
    });
  });

  it('refuses an id that does not name an authored Layout', () => {
    expect(() => resolve(loaded.space, MISSING)).toThrow(RendererInvariantError);
  });
});
