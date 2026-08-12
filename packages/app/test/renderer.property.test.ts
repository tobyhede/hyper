import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type BuiltInViewId, type GraphId } from '@project/core';
import { loadSpace, Placement, type Space } from '@project/graph';
import {
  checkSubject,
  convertSubject,
  RendererInvariantError,
  type GraphWithoutId,
  type RendererSubject,
  type ViewGraphPolicy,
} from '../src/renderer';
import { cardFile } from './card-files';

/**
 * ADR 0045's obligations, over every View that could ever be written.
 *
 * The point is not that Flow and Grid satisfy them — they are three lines each
 * and could be read. It is that the obligations hold at the *boundary*, so a
 * View nobody has designed yet cannot get past it having broken one. So the
 * generator here produces deliberately hostile policies: ones that keep an Edge
 * whose Card was never in the Placement, ones that repeat an Edge, ones that
 * return nothing at all. Whatever a policy answers, what leaves
 * `convertSubject` is either a `RendererInvariantError` or a value satisfying
 * every rule.
 *
 * Source-identity reuse is **absent from this list on purpose**: a policy
 * returns `GraphWithoutId`, so it cannot name an identity at all. The obligation
 * ADR 0040 claimed is unrepresentable rather than checked, and what is left to
 * prove about identity is that the minting side is fresh.
 */

const uuid = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

/**
 * Which renderer a refusal below names. Nothing here turns on it — a message is
 * the only thing that reads it — but the boundary takes the closed vocabulary a
 * selection is written in, so a generated View borrows a built-in id rather than
 * inventing a spelling no selection could hold.
 */
const GENERATED_VIEW: BuiltInViewId = 'flow';

const cardId = fc.integer({ min: 2, max: 7 }).map((n) => uuidSchema.parse(uuid(n)));

const point = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -1000, max: 1000 }),
});

/**
 * A Space over the Cards the generators draw from, with one Layout owning one
 * Graph — so `space.graphs` is non-empty and freshness has something to be
 * fresh against.
 */
const SOURCE_GRAPH = uuidSchema.parse(uuid(0x400));

function sourceSpace(): Space {
  const ids = [2, 3, 4, 5, 6, 7].map((n) => uuid(n));
  const result = loadSpace(
    {
      version: 1,
      id: uuid(1),
      title: 'Generated',
      layouts: [
        {
          id: uuid(0x500),
          title: 'Working',
          kind: 'positioned',
          positions: Object.fromEntries(ids.map((id, index) => [id, { x: index * 320, y: 0 }])),
          graphs: [{ id: SOURCE_GRAPH, title: 'Main', edges: [{ from: ids[0], to: ids[1] }] }],
        },
      ],
    },
    ids.map((id) => cardFile(id)),
  );
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
  return result.space;
}

const SPACE = sourceSpace();

/** A subject drawn from the Space's own values, which is what `checkSubject` guarantees. */
const subjectArb: fc.Arbitrary<RendererSubject> = fc
  .uniqueArray(cardId, { minLength: 1, maxLength: 6 })
  .map((ids) => ({
    cards: SPACE.cards.filter((card) => ids.includes(card.id)),
    graphs: SPACE.graphs,
  }));

const graphContent: fc.Arbitrary<GraphWithoutId> = fc.record({
  title: fc.string({ minLength: 1, maxLength: 8 }),
  edges: fc.array(fc.record({ from: cardId, to: cardId }), { maxLength: 4 }),
});

/**
 * A policy's answer, drawn from the whole space of them rather than the legal
 * part: its Edges may name Cards the Placement does not hold, it may repeat one,
 * and it may be empty — which the type forbids and a JavaScript policy can still
 * do.
 */
const answerArb = fc.oneof(
  { weight: 9, arbitrary: fc.array(graphContent, { minLength: 1, maxLength: 3 }) },
  { weight: 1, arbitrary: fc.constant<GraphWithoutId[]>([]) },
);

const placementArb = fc
  .uniqueArray(fc.tuple(cardId, point), { selector: ([id]) => id, minLength: 1, maxLength: 6 })
  .map((entries) => Placement.fromEntries(entries));

const asPolicy = (answer: readonly GraphWithoutId[]): ViewGraphPolicy =>
  (() => answer) as unknown as ViewGraphPolicy;

const matchesSubject = (subject: RendererSubject, placement: Placement): boolean =>
  placement.size === subject.cards.length && subject.cards.every((card) => placement.has(card.id));

const breaksClosure = (answer: readonly GraphWithoutId[], placement: Placement): boolean =>
  answer.some((graph) =>
    graph.edges.some((edge) => !placement.has(edge.from) || !placement.has(edge.to)),
  );

const repeatsAnEdge = (answer: readonly GraphWithoutId[]): boolean =>
  answer.some((graph) => {
    const seen = new Set<string>();
    return graph.edges.some((edge) => {
      const key = `${edge.from}\0${edge.to}`;
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
  });

/** An identity source that never repeats, so freshness is about the boundary. */
function counter(start = 0x900): { newGraphId: () => GraphId; used: () => number } {
  let next = start;
  let used = 0;
  return {
    newGraphId: () => {
      next += 1;
      used += 1;
      return uuidSchema.parse(uuid(next));
    },
    used: () => used,
  };
}

/** A Placement whose Cards are exactly a subject's — the shape conversion accepts. */
const placementOver = (subject: RendererSubject): fc.Arbitrary<Placement> =>
  fc
    .array(point, { minLength: subject.cards.length, maxLength: subject.cards.length })
    .map((points) =>
      Placement.fromEntries(subject.cards.map((card, index) => [card.id, points[index]!])),
    );

/**
 * A subject, a Placement and one answer a policy could give for them.
 *
 * The Placement is drawn half from the whole space of them and half from the
 * subject's own Cards. Left to chance alone the two almost never coincide, and
 * every case would be refused at the first check with the closure and duplicate
 * rules below it never reached.
 */
const scenario = subjectArb.chain((subject) =>
  fc.record({
    subject: fc.constant(subject),
    placement: fc.oneof(placementArb, placementOver(subject)),
    answer: answerArb,
  }),
);

/** The same, drawn only from what the boundary accepts. */
const legalScenario = subjectArb.chain((subject) => {
  const memberId = fc.constantFrom(...subject.cards.map((card) => card.id));
  return fc.record({
    subject: fc.constant(subject),
    placement: placementOver(subject),
    answer: fc.array(
      fc.record({
        title: fc.string({ minLength: 1, maxLength: 8 }),
        edges: fc.uniqueArray(fc.record({ from: memberId, to: memberId }), {
          selector: (edge) => `${edge.from}\0${edge.to}`,
          maxLength: 4,
        }),
      }),
      { minLength: 1, maxLength: 3 },
    ),
  });
});

describe('the subject check, over every selector that could be written', () => {
  /**
   * A subject drawn from the whole space of them: the Space's own values, clones
   * of them that compare equal and are not the same object, and repeats.
   */
  const hostileSubject = fc
    .record({
      cards: fc.array(
        fc.oneof(
          fc.constantFrom(...SPACE.cards),
          fc.constantFrom(...SPACE.cards).map((card) => ({ ...card })),
        ),
        { maxLength: 5 },
      ),
      graphs: fc.array(
        fc.oneof(
          fc.constantFrom(...SPACE.graphs),
          fc.constantFrom(...SPACE.graphs).map((graph) => ({ ...graph })),
        ),
        { maxLength: 3 },
      ),
    })
    .map((subject): RendererSubject => subject);

  const isSelection = (subject: RendererSubject): boolean => {
    const cardIds = new Set(subject.cards.map((card) => card.id));
    const graphIds = new Set(subject.graphs.map((graph) => graph.id));
    return (
      cardIds.size === subject.cards.length &&
      graphIds.size === subject.graphs.length &&
      subject.cards.every((card) => SPACE.lookup.card(card.id) === card) &&
      subject.graphs.every((graph) => SPACE.lookup.graph(graph.id)?.graph === graph)
    );
  };

  it('accepts a selection of the Space and refuses everything else', () => {
    fc.assert(
      fc.property(hostileSubject, (subject) => {
        if (!isSelection(subject)) {
          expect(() => checkSubject(SPACE, GENERATED_VIEW, subject)).toThrow(
            RendererInvariantError,
          );
          return;
        }
        expect(checkSubject(SPACE, GENERATED_VIEW, subject)).toBe(subject);
      }),
    );
  });
});

describe('the conversion boundary, over every View that could be written', () => {
  it('lets through no output that breaks a rule', () => {
    fc.assert(
      fc.property(scenario, ({ subject, placement, answer }) => {
        const identity = counter();
        let converted;
        try {
          converted = convertSubject({
            space: SPACE,
            subject,
            policy: asPolicy(answer),
            placement,
            newGraphId: identity.newGraphId,
            rendererId: GENERATED_VIEW,
          });
        } catch (error) {
          // A refusal is always a correct outcome: the boundary throws rather
          // than repairing, because a View that broke an obligation is wrong and
          // the Edit calling it has nothing to fall back to.
          expect(error).toBeInstanceOf(RendererInvariantError);
          expect(
            !matchesSubject(subject, placement) ||
              answer.length === 0 ||
              breaksClosure(answer, placement) ||
              repeatsAnEdge(answer),
          ).toBe(true);
          return;
        }

        expect(converted.graphs.length).toBeGreaterThan(0);
        expect(breaksClosure(converted.graphs, placement)).toBe(false);
        expect(repeatsAnEdge(converted.graphs)).toBe(false);
        const ids = converted.graphs.map((graph) => graph.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).not.toContain(SOURCE_GRAPH);
      }),
    );
  });

  it('refuses every output that breaks one, rather than only some of them', () => {
    fc.assert(
      fc.property(scenario, ({ subject, placement, answer }) => {
        fc.pre(
          !matchesSubject(subject, placement) ||
            answer.length === 0 ||
            breaksClosure(answer, placement) ||
            repeatsAnEdge(answer),
        );

        expect(() =>
          convertSubject({
            space: SPACE,
            subject,
            policy: asPolicy(answer),
            placement,
            newGraphId: counter().newGraphId,
            rendererId: GENERATED_VIEW,
          }),
        ).toThrow(RendererInvariantError);
      }),
    );
  });

  it('consumes no identity for an output it was going to refuse', () => {
    // Validation runs whole before the first id is minted, so a refused
    // conversion leaves the identity source exactly where it found it.
    fc.assert(
      fc.property(scenario, ({ subject, placement, answer }) => {
        fc.pre(
          !matchesSubject(subject, placement) ||
            answer.length === 0 ||
            breaksClosure(answer, placement) ||
            repeatsAnEdge(answer),
        );
        const identity = counter();
        expect(() =>
          convertSubject({
            space: SPACE,
            subject,
            policy: asPolicy(answer),
            placement,
            newGraphId: identity.newGraphId,
            rendererId: GENERATED_VIEW,
          }),
        ).toThrow();
        expect(identity.used()).toBe(0);
      }),
    );
  });

  it('mints exactly one identity per returned Graph when it accepts', () => {
    fc.assert(
      fc.property(legalScenario, ({ subject, placement, answer }) => {
        const identity = counter();
        const converted = convertSubject({
          space: SPACE,
          subject,
          policy: asPolicy(answer),
          placement,
          newGraphId: identity.newGraphId,
          rendererId: GENERATED_VIEW,
        });
        expect(identity.used()).toBe(converted.graphs.length);
      }),
    );
  });
});
