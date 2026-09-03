import { describe, expect, it } from 'vitest';
import type { SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '../src/index';
import { uuid } from './card-files';

const SPACE_ID = uuid('00000000-0000-4000-8000-000000000001');
const CARD_A = uuid('00000000-0000-4000-8000-000000000002');
const CARD_B = uuid('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuid('00000000-0000-4000-8000-000000000004');
const LAYOUT_ID = uuid('00000000-0000-4000-8000-000000000022');

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Snapshot space',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Working',
        kind: 'positioned',
        positions: {
          [CARD_A]: { x: 0, y: 0, open: false },
          [CARD_B]: { x: 320, y: 0, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] }],
      },
    ],
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'Body A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'Body B' } },
  ],
};

describe('loadSpaceSnapshot', () => {
  it('rejects a stored document that still carries a Space-level graphs array', () => {
    // The same pre-parse check `loadSpace` runs, reached through the other
    // intake — so a stale producer cannot commit one either. A commit validates
    // through here, so this is what stops it becoming stored state.
    const result = loadSpaceSnapshot({
      ...snapshot,
      document: {
        ...snapshot.document,
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.kind).toBe('retired-space-graphs');
  });

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
   * sentence — and reaches it with these instead, which is what `docs/agents/http.md` pins
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
    // SAFETY: `JSON.parse` returns `any`; narrowing to `unknown` only stops
    // that `any` from leaking into the assertion above — this call is
    // expected to throw regardless of what it would otherwise have returned.
    expect(() => JSON.parse(message) as unknown).toThrow();
  });

  it('builds the validated indexed Space consumed by graph logic', () => {
    const result = loadSpaceSnapshot(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.id).toBe(SPACE_ID);
    const card = result.space.lookup.card(CARD_A);
    expect(card?.kind === 'markdown' && card.body).toBe('Body A');
    expect(result.space.lookup.graph(GRAPH_ID)?.graph.title).toBe('Main');
  });

  it('returns the parsed snapshot accepted by intake', () => {
    // The parsed value and not the argument: a Layout written without its
    // `kind` is the shape `layoutSchema` fills in, so a snapshot carrying the
    // default back is the parse's own answer rather than the input echoed.
    const { kind: _kind, ...authoredLayout } = snapshot.document.layouts![0]!;
    const result = loadSpaceSnapshot({
      ...snapshot,
      document: { ...snapshot.document, layouts: [authoredLayout] },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot).toEqual(snapshot);
  });

  it('rejects a stored document carrying a key the shape does not declare', () => {
    // `spaceFileObjectSchema` is strict and `.omit()` carries the mode, so the
    // stored door answers an undeclared key the way the file door does — which
    // is what stops a stale producer committing one. The opening selection ADR
    // 0079 renamed is the case that asked for it; the key here is arbitrary,
    // because the refusal is by policy rather than by name (ADR 0056).
    const result = loadSpaceSnapshot({
      ...snapshot,
      document: { ...snapshot.document, undeclaredKey: LAYOUT_ID },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.kind).toBe('invalid-shape');
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
