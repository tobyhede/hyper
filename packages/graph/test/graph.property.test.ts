import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
// The whole module is internal: `loadSpace` is the one intake that runs it.
import { validateReferences } from '../src/validate';
import { card, uuid } from './card-files';

const cardId = (value: number) =>
  uuid(`00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`);

const LAYOUT = uuid('00000000-0000-4000-8000-000000000022');
const GRAPH = uuid('00000000-0000-4000-8000-000000000004');

/**
 * Build a structurally-consistent space file: one layout holding every card as
 * a member, owning one graph that chains them (ADR 0040).
 */
function spaceFileFromIds(ids: number[]) {
  return {
    title: 'Generated',
    cards: ids.map((id) => card(cardId(id), String(id))),
    layouts: [
      {
        id: LAYOUT,
        title: 'Working',
        kind: 'positioned' as const,
        positions: Object.fromEntries(ids.map((id, i) => [cardId(id), { x: i * 320, y: 0 }])),
        graphs: [
          {
            id: GRAPH,
            title: 'Main',
            edges: ids.slice(0, -1).map((id, i) => ({ from: cardId(id), to: cardId(ids[i + 1]!) })),
          },
        ],
      },
    ],
  };
}

/** The one graph that layout owns. */
const graphOf = (file: ReturnType<typeof spaceFileFromIds>) => file.layouts[0]!.graphs[0]!;

// Distinct, non-empty ids keep the generated graph structurally valid. At least
// two, so the chain has an edge to break.
const idsArb = fc.uniqueArray(fc.integer({ min: 0, max: 10_000 }), {
  minLength: 2,
  maxLength: 12,
});

describe('graph validation properties', () => {
  it('a consistently-built space always validates', () => {
    fc.assert(
      fc.property(idsArb, (ids) => {
        expect(validateReferences(spaceFileFromIds(ids))).toEqual([]);
      }),
    );
  });

  it('breaking any single edge endpoint is always detected', () => {
    fc.assert(
      fc.property(idsArb, fc.nat(), (ids, raw) => {
        const file = spaceFileFromIds(ids);
        const edges = graphOf(file).edges;
        edges[raw % edges.length]!.to = uuid('00000000-0000-4000-8000-ffffffffffff');
        const errors = validateReferences(file);
        expect(errors.some((e) => e.kind === 'unresolved-graph-edge')).toBe(true);
      }),
    );
  });

  it('an endpoint the owning layout does not hold is always detected', () => {
    // The closure rule ADR 0040 adds, and the reason it cannot be checked
    // against the space: every id here names a real card, so the only thing
    // wrong is *where* it is. Dropping any one card's position drops it from the
    // layout's membership, and every edge that touched it is then unclosed.
    fc.assert(
      fc.property(idsArb, fc.nat(), (ids, raw) => {
        const file = spaceFileFromIds(ids);
        const evicted = cardId(ids[raw % ids.length]!);
        const positions = file.layouts[0]!.positions;
        delete positions[evicted];

        const errors = validateReferences(file);
        expect(errors.some((e) => e.kind === 'unresolved-graph-edge' && e.ref === evicted)).toBe(
          true,
        );
        // Still a card of the space — nothing about it went missing.
        expect(file.cards.some((c) => c.id === evicted)).toBe(true);
        expect(errors.some((e) => e.kind === 'layout-position-unknown-card')).toBe(false);
      }),
    );
  });
});

describe('Graph shape properties (ADR 0032)', () => {
  it('a cycle through any earlier card is accepted', () => {
    fc.assert(
      fc.property(idsArb, fc.nat(), fc.nat(), (ids, rawFrom, rawTo) => {
        const to = rawTo % ids.length;
        const from = to + (rawFrom % (ids.length - to));
        const file = spaceFileFromIds(ids);
        graphOf(file).edges.push({ from: cardId(ids[from]!), to: cardId(ids[to]!) });
        expect(validateReferences(file)).toEqual([]);
      }),
    );
  });

  it('adding an exact duplicate Edge is always rejected', () => {
    fc.assert(
      fc.property(idsArb, fc.nat(), (ids, raw) => {
        const file = spaceFileFromIds(ids);
        const edges = graphOf(file).edges;
        edges.push({ ...edges[raw % edges.length]! });
        expect(
          validateReferences(file).some((error) => error.kind === 'duplicate-graph-edge'),
        ).toBe(true);
      }),
    );
  });

  it('an arbitrary-width fork and merge is accepted', () => {
    // Every branch runs forward from one card to one card, so the union is a
    // diamond: many paths, no duplicate Edge. Forks and merges are legal.
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), (branches) => {
        const middles = Array.from({ length: branches }, (_, i) => cardId(i + 10));
        const members = [cardId(1), cardId(2), ...middles];
        const file = {
          title: 'Diamond',
          cards: members.map((id) => card(id)),
          layouts: [
            {
              id: LAYOUT,
              title: 'Working',
              kind: 'positioned' as const,
              positions: Object.fromEntries(members.map((id, i) => [id, { x: i * 320, y: 0 }])),
              graphs: [
                {
                  id: GRAPH,
                  title: 'Main',
                  edges: middles.flatMap((id) => [
                    { from: cardId(1), to: id },
                    { from: id, to: cardId(2) },
                  ]),
                },
              ],
            },
          ],
        };
        expect(validateReferences(file)).toEqual([]);
      }),
    );
  });
});
