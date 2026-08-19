import { describe, expect, it } from 'vitest';
import type { Card } from '@project/core';
import { loadSpace, loadSpaceSnapshot, type LoadSpaceResult } from '../src/index';
import type { SpaceReferenceError } from '../src/validate';
import { aliasFile, cardFile, uuid } from './card-files';

/**
 * The Space intake contract, run against **both** loaders.
 *
 * `loadSpace` and `loadSpaceSnapshot` are two parsing adapters over one intake
 * core, and everything below is about that core: which aggregate relationships
 * are accepted, which are refused and what a refusal says. Running one list
 * twice is what stops the two from drifting — a rule proved through the file
 * loader alone would say nothing about the snapshot every commit goes through,
 * and the pair of them is exactly where a divergence would hide.
 *
 * The old `validate.test.ts` handed hand-built broken layouts straight to
 * `validateReferences`. That module is internal, its input shape is not a thing
 * any caller holds, and half of what it accepted was a shape the schema rejects
 * — so those cases are here instead, stated over documents a loader could
 * actually be given.
 */

const SPACE = uuid('00000000-0000-4000-8000-000000000001');
const A = uuid('00000000-0000-4000-8000-000000000002');
const B = uuid('00000000-0000-4000-8000-000000000003');
const C = uuid('00000000-0000-4000-8000-000000000005');
const WORKING = uuid('00000000-0000-4000-8000-000000000022');
const SECOND = uuid('00000000-0000-4000-8000-000000000023');
const MAIN = uuid('00000000-0000-4000-8000-000000000004');
const ASIDE = uuid('00000000-0000-4000-8000-000000000020');
/** A third graph, owned by a second layout, so the flatten crosses one. */
const THIRD = uuid('00000000-0000-4000-8000-000000000021');
/** Held back from every fixture: the id of something no space below holds. */
const ABSENT = uuid('00000000-0000-4000-8000-000000000099');

/** What both loaders are handed: a document's structure, and the cards under it. */
interface Document {
  readonly layouts?: readonly unknown[];
  readonly defaultRenderer?: string;
  readonly cards: readonly Card[];
}

type Loader = (document: Document) => LoadSpaceResult;

/**
 * The file loader: cards arrive as the markdown files an author wrote, so the
 * document under test is turned back into frontmatter on the way in.
 */
const viaFiles: Loader = ({ cards, ...structure }) =>
  loadSpace(
    { version: 1, id: SPACE, title: 'Test space', ...structure },
    cards.map((card) =>
      card.kind === 'alias'
        ? aliasFile(card.id, card.title, card.target)
        : cardFile(card.id, card.title, card.body),
    ),
  );

/** The persistence loader: the same aggregate, fully identified. */
const viaSnapshot: Loader = ({ cards, ...structure }) => {
  const result = loadSpaceSnapshot({
    id: SPACE,
    document: { version: 1, title: 'Test space', ...structure },
    cards: cards.map(({ id, ...document }) => ({ id, document })),
  });
  return result.ok ? { ok: true, space: result.space } : result;
};

const markdown = (id: string, title = id): Card => ({
  id: uuid(id),
  title,
  kind: 'markdown',
  body: '',
});

const aliasTo = (id: string, target: string): Card => ({
  id: uuid(id),
  title: `alias ${id}`,
  kind: 'alias',
  target: uuid(target),
});

const graph = (id: string, title: string, edges: { from: string; to: string }[] = []) => ({
  id,
  title,
  edges,
});

const layout = (
  id: string,
  positions: Record<string, { x: number; y: number }>,
  graphs: unknown[],
  extra: Record<string, unknown> = {},
) => ({ id, title: `Layout ${id}`, kind: 'positioned', positions, graphs, ...extra });

/** One Layout over A and B, owning one Graph that joins them. */
const simple = (defaultRenderer?: string): Document => ({
  cards: [markdown(A, 'A'), markdown(B, 'B')],
  layouts: [
    layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } }, [
      graph(MAIN, 'Main', [{ from: A, to: B }]),
    ]),
  ],
  ...(defaultRenderer === undefined ? {} : { defaultRenderer }),
});

const loaded = (result: LoadSpaceResult) => {
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
  return result.space;
};

/**
 * The errors a refusal carries, narrowed to the reference kinds that carry a
 * `ref`. Everything below is about a named reference, so a shape or version
 * failure here is a broken fixture rather than a case — saying so at the
 * narrowing is what keeps `errors[0]?.ref` readable at every use.
 */
const refused = (result: LoadSpaceResult): SpaceReferenceError[] => {
  if (result.ok) throw new Error('expected the document to be refused');
  return result.errors.map((error) => {
    if (!('ref' in error)) throw new Error(`unexpected ${error.kind}: ${error.message}`);
    return error;
  });
};

describe.each([
  ['loadSpace', viaFiles],
  ['loadSpaceSnapshot', viaSnapshot],
])('Space intake through %s', (_name, load: Loader) => {
  describe('the aggregate it builds', () => {
    it('flattens the graphs its layouts own, in layout then authored order', () => {
      const space = loaded(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } }, [
              graph(MAIN, 'Main', [{ from: A, to: B }]),
              graph(ASIDE, 'Aside', [{ from: B, to: A }]),
            ]),
            layout(SECOND, { [A]: { x: 0, y: 200 } }, [graph(THIRD, 'Third')]),
          ],
        }),
      );

      expect(space.graphs.map((entry) => entry.title)).toEqual(['Main', 'Aside', 'Third']);
    });

    it('flattens the exact nested values, never copies of them', () => {
      const space = loaded(load(simple()));
      const [first] = space.graphs;
      expect(first).toBe(space.layouts[0]?.graphs[0]);
      expect(space.lookup.graph(MAIN)?.graph).toBe(first);
    });

    it('answers one canonical value per id, however often it is asked', () => {
      const space = loaded(load(simple()));
      expect(space.lookup.layout(WORKING)).toBe(space.lookup.layout(WORKING));
      expect(space.lookup.graph(MAIN)).toBe(space.lookup.graph(MAIN));
      expect(space.lookup.card(A)).toBe(space.lookup.card(A));
    });

    it('answers a graph with the very value its owner resolves to', () => {
      const space = loaded(load(simple()));
      expect(space.lookup.graph(MAIN)?.owner).toBe(space.lookup.layout(WORKING));
      expect(space.lookup.graph(MAIN)?.owner.layout.id).toBe(WORKING);
    });

    it('answers a layout with the exact owned graph it opens active on', () => {
      const space = loaded(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B')],
          layouts: [
            layout(
              WORKING,
              { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } },
              [graph(MAIN, 'Main', [{ from: A, to: B }]), graph(ASIDE, 'Aside')],
              { activeGraph: ASIDE },
            ),
          ],
        }),
      );

      const resolved = space.lookup.layout(WORKING);
      expect(resolved?.activeGraph).toBe(space.lookup.graph(ASIDE)?.graph);
    });

    it('falls back to a layout’s first graph when it names none', () => {
      const space = loaded(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } }, [
              graph(MAIN, 'Main', [{ from: A, to: B }]),
              graph(ASIDE, 'Aside'),
            ]),
          ],
        }),
      );

      expect(space.lookup.layout(WORKING)?.activeGraph.id).toBe(MAIN);
    });

    it('resolves the fallback without filling the authored optional', () => {
      // Resolution is a read. The authored value is what a snapshot and an export
      // are projected from, so writing the fallback into it would turn "the first
      // one, whichever that is" into a named choice the author never made.
      const space = loaded(load(simple()));
      expect(space.lookup.layout(WORKING)?.activeGraph.id).toBe(MAIN);
      expect(space.layouts[0]?.activeGraph).toBeUndefined();
    });

    it('answers nothing for an id the space does not hold', () => {
      const space = loaded(load(simple()));
      expect(space.lookup.card(ABSENT)).toBeUndefined();
      expect(space.lookup.layout(ABSENT)).toBeUndefined();
      expect(space.lookup.graph(ABSENT)).toBeUndefined();
    });

    it('builds a space with cards and no layouts, and so no graphs (ADR 0015)', () => {
      const space = loaded(load({ cards: [markdown(A, 'A')], layouts: [] }));
      expect(space.graphs).toEqual([]);
      expect(space.layouts).toEqual([]);
      expect(space.lookup.card(A)?.title).toBe('A');
    });

    it('loads a layout whose only graph holds no edges', () => {
      // Creating a Layout creates its initial empty Active Graph in the same Edit
      // (ADR 0040), and converting a View returns exactly that (ADR 0045), so
      // this is the first thing a conversion writes. Closure over an empty edge
      // set is vacuous, not exempt.
      const space = loaded(
        load({
          cards: [markdown(A, 'A')],
          layouts: [layout(WORKING, { [A]: { x: 0, y: 0 } }, [graph(MAIN, 'Graph 1')])],
        }),
      );
      expect(space.lookup.graph(MAIN)?.graph.edges).toEqual([]);
    });
  });

  describe('edge closure over the owning layout (ADR 0040)', () => {
    it('accepts a cycle, a self-edge, a fork and a merge (ADR 0032)', () => {
      const space = loaded(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B'), markdown(C, 'C')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 }, [C]: { x: 640, y: 0 } }, [
              graph(MAIN, 'Main', [
                { from: A, to: B },
                { from: B, to: A },
                { from: B, to: B },
                { from: A, to: C },
                { from: C, to: B },
              ]),
            ]),
          ],
        }),
      );
      expect(space.lookup.graph(MAIN)?.graph.edges).toHaveLength(5);
    });

    it('accepts the same edge in two graphs one layout owns', () => {
      const space = loaded(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } }, [
              graph(MAIN, 'Main', [{ from: A, to: B }]),
              graph(ASIDE, 'Alt', [{ from: A, to: B }]),
            ]),
          ],
        }),
      );
      expect(space.graphs).toHaveLength(2);
    });

    it('refuses an exact duplicate edge within one graph', () => {
      const errors = refused(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } }, [
              graph(MAIN, 'Main', [
                { from: A, to: B },
                { from: A, to: B },
              ]),
            ]),
          ],
        }),
      );
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'duplicate-graph-edge', ref: `${A} → ${B}` }),
      );
    });

    it('refuses an endpoint naming a card the space does not hold, and says only that', () => {
      const errors = refused(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } }, [
              graph(MAIN, 'Main', [{ from: A, to: ABSENT }]),
            ]),
          ],
        }),
      );

      expect(errors.map(({ kind }) => kind)).toEqual(['graph-edge-missing-card']);
      expect(errors[0]?.ref).toBe(ABSENT);
      expect(errors[0]?.message).toContain('as its to');
    });

    it('refuses an endpoint naming a space card outside its layout, and says only that', () => {
      // The failure a space-wide check could not see: `C` is a perfectly good
      // Space card, but this Layout does not position it, so it is not a member
      // and an Edge here cannot reach it. Told apart from the case above because
      // the two send an author to different places — add a member, or find a card
      // that is gone.
      const errors = refused(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B'), markdown(C, 'C')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } }, [
              graph(MAIN, 'Main', [{ from: B, to: C }]),
            ]),
          ],
        }),
      );

      expect(errors.map(({ kind }) => kind)).toEqual(['graph-edge-card-outside-layout']);
      expect(errors[0]?.ref).toBe(C);
      expect(errors[0]?.message).toContain(WORKING);
    });

    it('refuses an endpoint naming a card only a second layout holds', () => {
      const errors = refused(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B'), markdown(C, 'C')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } }, [
              graph(MAIN, 'Main', [{ from: A, to: C }]),
            ]),
            layout(SECOND, { [C]: { x: 0, y: 200 } }, [graph(ASIDE, 'Aside')]),
          ],
        }),
      );
      expect(errors.map(({ kind }) => kind)).toEqual(['graph-edge-card-outside-layout']);
    });

    it('says only that a position names a missing card, not that edges into it dangle', () => {
      // The position is the fault; an edge reaching that member is a consequence.
      // Diagnosing both would send an author looking for two problems.
      const errors = refused(
        load({
          cards: [markdown(A, 'A')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [ABSENT]: { x: 320, y: 0 } }, [
              graph(MAIN, 'Main', [{ from: A, to: ABSENT }]),
            ]),
          ],
        }),
      );

      expect(errors.map(({ kind }) => kind)).toEqual(['layout-member-missing-card']);
      expect(errors[0]?.ref).toBe(ABSENT);
    });

    it('accepts a layout that omits cards — a card it leaves out is not in it', () => {
      const space = loaded(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B'), markdown(C, 'C')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } }, [
              graph(MAIN, 'Main', [{ from: A, to: B }]),
            ]),
          ],
        }),
      );
      expect(space.cards).toHaveLength(3);
    });
  });

  describe('the graph a layout opens active on (ADR 0026)', () => {
    it('accepts any graph the layout owns', () => {
      const space = loaded(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B')],
          layouts: [
            layout(
              WORKING,
              { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } },
              [graph(MAIN, 'Main', [{ from: A, to: B }]), graph(ASIDE, 'Aside')],
              { activeGraph: ASIDE },
            ),
          ],
        }),
      );
      expect(space.lookup.layout(WORKING)?.activeGraph.id).toBe(ASIDE);
    });

    it('refuses one no layout in the space owns, and says only that', () => {
      const errors = refused(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B')],
          layouts: [
            layout(
              WORKING,
              { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } },
              [graph(MAIN, 'Main', [{ from: A, to: B }])],
              { activeGraph: ABSENT },
            ),
          ],
        }),
      );

      expect(errors.map(({ kind }) => kind)).toEqual(['layout-active-graph-missing']);
      expect(errors[0]?.ref).toBe(ABSENT);
      expect(errors[0]?.message).toContain(WORKING);
    });

    it('refuses one a second layout owns — ownership, not existence', () => {
      // The graph resolves in the space, so a space-wide check would pass it. It
      // is not this layout's to open on, which is what ownership makes checkable.
      const errors = refused(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B')],
          layouts: [
            layout(
              WORKING,
              { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } },
              [graph(MAIN, 'Main', [{ from: A, to: B }])],
              { activeGraph: ASIDE },
            ),
            layout(SECOND, { [A]: { x: 0, y: 200 } }, [graph(ASIDE, 'Aside')]),
          ],
        }),
      );

      expect(errors.map(({ kind }) => kind)).toEqual(['layout-active-graph-outside-layout']);
      expect(errors[0]?.ref).toBe(ASIDE);
    });
  });

  describe('duplicate identities', () => {
    it('reports one error per repeated graph id, naming every occurrence in order', () => {
      // Ownership is layout-scoped; the *id* is not (ADR 0045). The flatten keys
      // colour, `<graphId>::out`/`::in` handles and activation on the id alone,
      // and the lookup would drop one of a set in silence. One error, because one
      // id is one fault however many times it appears — and it names where each
      // occurrence is, since that is the only actionable part.
      const errors = refused(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } }, [
              graph(MAIN, 'Main', [{ from: A, to: B }]),
              graph(MAIN, 'Main again'),
            ]),
            layout(SECOND, { [A]: { x: 0, y: 200 } }, [graph(MAIN, 'Main a third time')]),
          ],
        }),
      );

      const duplicates = errors.filter(({ kind }) => kind === 'duplicate-graph-id');
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]?.ref).toBe(MAIN);
      expect(duplicates[0]?.message).toBe(
        `Duplicate graph id "${MAIN}" at layout "${WORKING}" graph 0, layout "${WORKING}" graph 1, layout "${SECOND}" graph 0`,
      );
    });

    it('accepts two layouts owning distinct graphs over the same cards', () => {
      const space = loaded(
        load({
          cards: [markdown(A, 'A'), markdown(B, 'B')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [B]: { x: 320, y: 0 } }, [
              graph(MAIN, 'Main', [{ from: A, to: B }]),
            ]),
            layout(SECOND, { [A]: { x: 0, y: 200 }, [B]: { x: 320, y: 200 } }, [
              graph(ASIDE, 'Aside', [{ from: B, to: A }]),
            ]),
          ],
        }),
      );
      expect(space.graphs.map(({ title }) => title)).toEqual(['Main', 'Aside']);
    });

    it('refuses duplicate layout ids, which the lookup would silently collapse', () => {
      const errors = refused(
        load({
          cards: [markdown(A, 'A')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 } }, [graph(MAIN, 'Main')]),
            layout(WORKING, { [A]: { x: 0, y: 200 } }, [graph(ASIDE, 'Aside')]),
          ],
        }),
      );
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'duplicate-layout-id', ref: WORKING }),
      );
    });
  });

  describe('aliases (ADR 0009)', () => {
    it('accepts a single-hop alias to a markdown card', () => {
      const space = loaded(
        load({
          cards: [markdown(A, 'A'), aliasTo(B, A)],
          layouts: [],
        }),
      );
      expect(space.cards).toHaveLength(2);
    });

    it('refuses an alias whose target resolves to no card', () => {
      const errors = refused(load({ cards: [aliasTo(A, ABSENT)], layouts: [] }));
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'unresolved-alias-target', ref: ABSENT }),
      );
    });

    it('refuses an alias that points at itself', () => {
      const errors = refused(load({ cards: [aliasTo(A, A)], layouts: [] }));
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'alias-self-reference', ref: A }),
      );
    });

    it('refuses an alias whose target is itself an alias', () => {
      const errors = refused(
        load({ cards: [markdown(A, 'A'), aliasTo(B, A), aliasTo(C, B)], layouts: [] }),
      );
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'alias-targets-alias', ref: B }),
      );
    });
  });

  describe('the view a space opens in', () => {
    it('accepts a defaultRenderer naming a declared layout', () => {
      expect(loaded(load(simple(WORKING))).defaultRenderer).toBe(WORKING);
    });

    it('accepts a defaultRenderer naming a built-in view', () => {
      for (const view of ['flow', 'grid'] as const) {
        expect(loaded(load(simple(view))).defaultRenderer).toBe(view);
      }
    });

    it('refuses a defaultRenderer naming neither', () => {
      const errors = refused(load(simple(ABSENT)));
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'unresolved-default-view', ref: ABSENT }),
      );
    });
  });

  describe('independent faults', () => {
    it('accumulates unrelated errors rather than reporting the first', () => {
      const errors = refused(
        load({
          cards: [markdown(A, 'A'), aliasTo(B, ABSENT)],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 } }, [graph(MAIN, 'Main')]),
            layout(WORKING, { [A]: { x: 0, y: 200 } }, [graph(ASIDE, 'Aside')]),
          ],
          defaultRenderer: ABSENT,
        }),
      );

      expect(new Set(errors.map(({ kind }) => kind))).toEqual(
        new Set(['duplicate-layout-id', 'unresolved-default-view', 'unresolved-alias-target']),
      );
    });

    it('is deterministic for one input', () => {
      const document = () =>
        load({
          cards: [markdown(A, 'A')],
          layouts: [
            layout(WORKING, { [A]: { x: 0, y: 0 }, [ABSENT]: { x: 1, y: 1 } }, [
              graph(MAIN, 'Main'),
              graph(MAIN, 'Main again'),
            ]),
          ],
        });
      expect(refused(document())).toEqual(refused(document()));
    });
  });
});
