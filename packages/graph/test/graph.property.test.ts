import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
// The whole module is internal: `loadSpace` is the one intake that runs it.
import { validateReferences } from '../src/validate';
import { card, uuid } from './card-files';

const cardId = (value: number) =>
  uuid(`00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`);

/** Build a structurally-consistent space file: one route chaining every card. */
function spaceFileFromIds(ids: number[]) {
  return {
    title: 'Generated',
    cards: ids.map((id) => card(cardId(id), String(id))),
    routes: [
      {
        id: uuid('00000000-0000-4000-8000-000000000004'),
        title: 'Main',
        edges: ids.slice(0, -1).map((id, i) => ({ from: cardId(id), to: cardId(ids[i + 1]!) })),
      },
    ],
  };
}

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
        const edges = file.routes[0]!.edges;
        edges[raw % edges.length]!.to = uuid('00000000-0000-4000-8000-ffffffffffff');
        const errors = validateReferences(file);
        expect(errors.some((e) => e.kind === 'unresolved-route-edge')).toBe(true);
      }),
    );
  });
});

describe('Route shape properties (ADR 0032)', () => {
  it('a cycle through any earlier card is accepted', () => {
    fc.assert(
      fc.property(idsArb, fc.nat(), fc.nat(), (ids, rawFrom, rawTo) => {
        const to = rawTo % ids.length;
        const from = to + (rawFrom % (ids.length - to));
        const file = spaceFileFromIds(ids);
        file.routes[0]!.edges.push({ from: cardId(ids[from]!), to: cardId(ids[to]!) });
        expect(validateReferences(file)).toEqual([]);
      }),
    );
  });

  it('adding an exact duplicate Edge is always rejected', () => {
    fc.assert(
      fc.property(idsArb, fc.nat(), (ids, raw) => {
        const file = spaceFileFromIds(ids);
        const edges = file.routes[0]!.edges;
        edges.push({ ...edges[raw % edges.length]! });
        expect(
          validateReferences(file).some((error) => error.kind === 'duplicate-route-edge'),
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
        const file = {
          title: 'Diamond',
          cards: [card(cardId(1)), card(cardId(2)), ...middles.map((id) => card(id))],
          routes: [
            {
              id: uuid('00000000-0000-4000-8000-000000000004'),
              title: 'Main',
              edges: middles.flatMap((id) => [
                { from: cardId(1), to: id },
                { from: id, to: cardId(2) },
              ]),
            },
          ],
        };
        expect(validateReferences(file)).toEqual([]);
      }),
    );
  });
});
