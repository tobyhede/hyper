import { FLOW_SPACE_VIEW_ID, GRID_SPACE_VIEW_ID, uuidSchema } from '@project/core';
import { describe, expect, it } from 'vitest';
import { computedViewSubject, loadSpaceSnapshot } from '../src/index';

const SPACE = '00000000-0000-4000-8000-000000000001';
const CARD = '00000000-0000-4000-8000-000000000002';
const LAYOUT = '00000000-0000-4000-8000-000000000003';
const GRAPH = '00000000-0000-4000-8000-000000000004';
const UNKNOWN_VIEW = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

const loaded = loadSpaceSnapshot({
  id: SPACE,
  document: {
    version: 1,
    title: 'Subject',
    layouts: [
      {
        id: LAYOUT,
        title: 'Layout',
        kind: 'positioned',
        positions: { [CARD]: { x: 0, y: 0, open: false } },
        graphs: [{ id: GRAPH, title: 'Graph', edges: [] }],
      },
    ],
  },
  cards: [{ id: CARD, document: { title: 'Card', kind: 'markdown', body: '' } }],
});

if (!loaded.ok) throw new Error('fixture must load');

describe('computedViewSubject', () => {
  it.each([FLOW_SPACE_VIEW_ID, GRID_SPACE_VIEW_ID])(
    'selects every Card and Graph for Computed View %s',
    (viewId) => {
      const subject = computedViewSubject(loaded.space, viewId);

      expect(subject?.cards.map(({ id }) => id)).toEqual([CARD]);
      expect(subject?.graphs.map(({ id }) => id)).toEqual([GRAPH]);
    },
  );

  it('does not claim an authored or unknown Space View', () => {
    expect(computedViewSubject(loaded.space, uuidSchema.parse(LAYOUT))).toBeUndefined();
    expect(computedViewSubject(loaded.space, UNKNOWN_VIEW)).toBeUndefined();
  });
});
