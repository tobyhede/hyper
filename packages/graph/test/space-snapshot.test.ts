import { describe, expect, it } from 'vitest';
import type { SpaceSnapshot } from '@project/core';
import { getCard, getRoute, loadSpaceSnapshot } from '../src/index';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const CARD_A = '00000000-0000-4000-8000-000000000002';
const CARD_B = '00000000-0000-4000-8000-000000000003';
const ROUTE_ID = '00000000-0000-4000-8000-000000000004';

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Snapshot space',
    routes: [{ id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] }],
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'Body A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'Body B' } },
  ],
};

describe('loadSpaceSnapshot', () => {
  it('reports an invalid persistence shape without constructing a Space', () => {
    const result = loadSpaceSnapshot({ ...snapshot, id: 'space' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.kind).toBe('invalid-shape');
    expect(result.errors[0]?.message).toContain('id');
  });

  it('builds the validated indexed Space consumed by graph logic', () => {
    const result = loadSpaceSnapshot(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.id).toBe(SPACE_ID);
    const card = getCard(result.space, CARD_A);
    expect(card?.kind === 'markdown' && card.body).toBe('Body A');
    expect(getRoute(result.space, ROUTE_ID)?.title).toBe('Main');
  });

  it('canonicalizes backend card order by title and id', () => {
    const reversed = { ...snapshot, cards: [...snapshot.cards].reverse() };
    const fromOriginal = loadSpaceSnapshot(snapshot);
    const fromReversed = loadSpaceSnapshot(reversed);
    expect(fromOriginal.ok).toBe(true);
    expect(fromReversed.ok).toBe(true);
    if (!fromOriginal.ok || !fromReversed.ok) return;

    expect(fromReversed.space.cards.map((card) => card.id)).toEqual(
      fromOriginal.space.cards.map((card) => card.id),
    );
    expect(fromReversed.space.cards.map((card) => card.id)).toEqual([CARD_A, CARD_B]);
  });
});
