import { describe, expect, it } from 'vitest';
import type { SpaceSnapshot } from '@project/core';
import { getCard, getRoute, loadSpaceSnapshot } from '../src/index';
import { uuid } from './card-files';

const SPACE_ID = uuid('00000000-0000-4000-8000-000000000001');
const CARD_A = uuid('00000000-0000-4000-8000-000000000002');
const CARD_B = uuid('00000000-0000-4000-8000-000000000003');
const ROUTE_ID = uuid('00000000-0000-4000-8000-000000000004');

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

  /**
   * The format the callers that deleted their own outer `safeParse` now report
   * with. `parseSnapshot` in the PostgreSQL repository used to reach a client
   * with `parsed.error.message` — Zod's entire serialized issue array as one
   * string, a JSON document nested inside a field the client renders as a
   * sentence — and reaches it with these instead, which is what `AGENTS.md` pins
   * under "A wire codec throws prose, not Zod".
   *
   * The *shape* is pinned, not the sentence: a located field path, then Zod's
   * own reason, whatever wording a version of Zod gives it.
   */
  it('locates an invalid shape in prose rather than dumping Zod', () => {
    const result = loadSpaceSnapshot({
      ...snapshot,
      cards: [{ id: CARD_A, document: { kind: 'markdown', body: 'Body A' } }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map(({ kind }) => kind)).toEqual(['invalid-shape']);

    const message = result.errors.map((error) => error.message).join('\n');
    expect(message).toMatch(/^cards\.0\.document\.title: \S/);
    expect(message.startsWith('[')).toBe(false);
    expect(() => JSON.parse(message) as unknown).toThrow();
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

  it('returns the parsed snapshot accepted by intake', () => {
    const result = loadSpaceSnapshot({
      ...snapshot,
      ignored: 'not part of a snapshot',
      document: { ...snapshot.document, ignored: 'not part of a document' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot).toEqual(snapshot);
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
