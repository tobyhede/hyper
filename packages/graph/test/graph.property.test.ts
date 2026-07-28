import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateReferences } from '../src/index';
import { card } from './card-files';

const cardId = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;

/** Build a structurally-consistent space file: one route chaining every card. */
function spaceFileFromIds(ids: number[]) {
  return {
    title: 'Generated',
    cards: ids.map((id) => card(cardId(id), String(id))),
    routes: [
      {
        id: '00000000-0000-4000-8000-000000000004',
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
        edges[raw % edges.length]!.to = '__does_not_exist__';
        const errors = validateReferences(file);
        expect(errors.some((e) => e.kind === 'unresolved-route-edge')).toBe(true);
      }),
    );
  });
});

describe('acyclicity properties (ADR 0023)', () => {
  it('a chain of distinct cards is always acyclic', () => {
    fc.assert(
      fc.property(idsArb, (ids) => {
        const errors = validateReferences(spaceFileFromIds(ids));
        expect(errors.some((e) => e.kind === 'route-has-cycle')).toBe(false);
      }),
    );
  });

  it('an edge back to any earlier card always closes a cycle', () => {
    // The check has to catch a loop wherever it closes, not only one that
    // returns to the route's first card — which is what a duplicate scan over a
    // step list used to do for free and an edge list does not.
    fc.assert(
      fc.property(idsArb, fc.nat(), fc.nat(), (ids, rawFrom, rawTo) => {
        const to = rawTo % ids.length;
        const from = to + (rawFrom % (ids.length - to));
        const file = spaceFileFromIds(ids);
        file.routes[0]!.edges.push({ from: cardId(ids[from]!), to: cardId(ids[to]!) });
        const errors = validateReferences(file);
        expect(errors.some((e) => e.kind === 'route-has-cycle')).toBe(true);
      }),
    );
  });

  it('a fork that merges again is never a cycle, however wide', () => {
    // Every branch runs forward from one card to one card, so the union is a
    // diamond: many paths, no loop. Forks and merges are legal (ADR 0023) and
    // this is what stops the check reading "reached twice" as "cycle".
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), (branches) => {
        const middles = Array.from({ length: branches }, (_, i) => `m${i}`);
        const file = {
          title: 'Diamond',
          cards: [card('start'), card('end'), ...middles.map((id) => card(id))],
          routes: [
            {
              id: '00000000-0000-4000-8000-000000000004',
              title: 'Main',
              edges: middles.flatMap((id) => [
                { from: 'start', to: id },
                { from: id, to: 'end' },
              ]),
            },
          ],
        };
        expect(validateReferences(file)).toEqual([]);
      }),
    );
  });
});
