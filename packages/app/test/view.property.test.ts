import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Graph, type GraphId } from '@project/core';
import { Placement } from '@project/graph';
import { convertView, type ConvertedLayout, type ViewSubject } from '../src/view';

/**
 * ADR 0045's two obligations, over every view that could ever be written.
 *
 * The point is not that Flow and Grid satisfy them — they are three lines each
 * and could be read. It is that the obligations hold at the *boundary*, so a
 * view nobody has designed yet cannot get past it having broken one. So the
 * generator here produces deliberately hostile conversions: ones that keep a
 * source graph's identity, ones that prune a card and keep the edge into it,
 * ones that reuse one identity twice. Whatever a view returns, what leaves
 * `convertView` is either an exception or a value satisfying both rules.
 */

const uuid = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const cardId = fc.integer({ min: 1, max: 12 }).map((n) => uuidSchema.parse(uuid(n)));
const graphId = fc.integer({ min: 100, max: 112 }).map((n) => uuidSchema.parse(uuid(n)));

const point = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -1000, max: 1000 }),
});

const placement = fc
  .uniqueArray(fc.tuple(cardId, point), {
    selector: ([id]) => id,
    minLength: 1,
    maxLength: 6,
  })
  .map((entries) => Placement.fromEntries(entries));

const graph = (ids: fc.Arbitrary<GraphId>): fc.Arbitrary<Graph> =>
  fc.record({
    id: ids,
    title: fc.string({ minLength: 1, maxLength: 8 }),
    edges: fc.array(fc.record({ from: cardId, to: cardId }), { maxLength: 4 }),
  });

const subject: fc.Arbitrary<ViewSubject> = fc.record({
  cardIds: fc.uniqueArray(cardId, { maxLength: 6 }),
  graphs: fc.uniqueArray(graph(graphId), { selector: (g) => g.id, maxLength: 3 }),
});

/**
 * A view's answer, drawn from the whole space of them rather than the legal
 * part: its graph identities may collide with the subject's or with each other,
 * and its edges may name cards it did not return.
 */
const conversion = (source: ViewSubject, onScreen: Placement): fc.Arbitrary<ConvertedLayout> => {
  const anyGraphId = fc.oneof(
    graphId,
    ...(source.graphs.length > 0 ? [fc.constantFrom(...source.graphs.map((g) => g.id))] : []),
  );
  return fc.record({
    positions: fc.oneof(fc.constant(onScreen), placement),
    // Built as head-and-tail rather than as an array with a minimum length, so
    // the non-empty tuple the interface asks for is what the generator produces
    // rather than something a cast asserts about it.
    graphs: fc
      .tuple(graph(anyGraphId), fc.array(graph(anyGraphId), { maxLength: 2 }))
      .map(([first, rest]): readonly [Graph, ...Graph[]] => [first, ...rest]),
  });
};

const violatesClosure = (converted: ConvertedLayout): boolean =>
  converted.graphs.some((g) =>
    g.edges.some(
      (edge) => !converted.positions.has(edge.from) || !converted.positions.has(edge.to),
    ),
  );

const violatesFreshIdentity = (source: ViewSubject, converted: ConvertedLayout): boolean => {
  const taken = new Set<GraphId>(source.graphs.map((g) => g.id));
  return converted.graphs.some((g) => {
    if (taken.has(g.id)) return true;
    taken.add(g.id);
    return false;
  });
};

/**
 * A subject, the placement on screen, and one answer a view could give for
 * them — drawn as one arbitrary rather than sampled inside the property.
 *
 * `conversion` depends on both, which is what `chain` is for. Sampling it from
 * a generated seed instead put the answer outside the arbitrary, so fast-check
 * could shrink the seed but not the conversion, and a counterexample shrank to
 * an unrelated answer rather than a smaller one.
 */
const scenario = fc.tuple(subject, placement).chain(([source, onScreen]) =>
  fc.record({
    source: fc.constant(source),
    onScreen: fc.constant(onScreen),
    answer: conversion(source, onScreen),
  }),
);

/**
 * Every generated view answers with an output fixed in advance, so none of them
 * mints. Throwing rather than returning a spare id keeps that true: a generated
 * view that reached for the minter would be answering with something the
 * scenario did not generate, and the case would stop being about the output
 * under test.
 */
const mintUnused = (): never => {
  throw new Error('A generated View mints nothing.');
};

describe('the conversion boundary, over every view that could be written', () => {
  it('lets through no output that breaks closure or reuses a source identity', () => {
    fc.assert(
      fc.property(scenario, ({ source, onScreen, answer }) => {
        let returned: ConvertedLayout;
        try {
          returned = convertView(() => answer, source, onScreen, mintUnused);
        } catch {
          // A refusal is always a correct outcome: the boundary throws rather
          // than repairing, because a view that broke an obligation is wrong
          // and the Edit calling it has nothing to fall back to.
          expect(violatesClosure(answer) || violatesFreshIdentity(source, answer)).toBe(true);
          return;
        }

        expect(violatesClosure(returned)).toBe(false);
        expect(violatesFreshIdentity(source, returned)).toBe(false);
      }),
    );
  });

  it('refuses every output that breaks one, rather than only some of them', () => {
    fc.assert(
      fc.property(scenario, ({ source, onScreen, answer }) => {
        fc.pre(violatesClosure(answer) || violatesFreshIdentity(source, answer));

        expect(() => convertView(() => answer, source, onScreen, mintUnused)).toThrow();
      }),
    );
  });
});
