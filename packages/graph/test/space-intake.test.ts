import { describe, expect, it } from 'vitest';

import { type Resource, type ResourcePlacement } from '@project/core';
import { loadSpace, loadSpaceSnapshot, type LoadSpaceResult } from '../src/index';
import type { SpaceReferenceError } from '../src/validate';
import { referenceFile, resourceFile, uuid } from './resource-files';

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
 * Every case is stated over a document a loader could actually be given, never
 * over the internal reference check's input shape, which no caller holds.
 */

const SPACE = uuid('00000000-0000-4000-8000-000000000001');
const A = uuid('00000000-0000-4000-8000-000000000002');
const B = uuid('00000000-0000-4000-8000-000000000003');
const C = uuid('00000000-0000-4000-8000-000000000005');
const WORKING = uuid('00000000-0000-4000-8000-000000000022');
const SECOND = uuid('00000000-0000-4000-8000-000000000023');
const MAIN = uuid('00000000-0000-4000-8000-000000000004');
const ASIDE = uuid('00000000-0000-4000-8000-000000000020');
/** A third graph, owned by a second map, so the flatten crosses one. */
const THIRD = uuid('00000000-0000-4000-8000-000000000021');
/** Held back from every fixture: the id of something no space below holds. */
const ABSENT = uuid('00000000-0000-4000-8000-000000000099');

/** What both loaders are handed: a document's structure, and the resources under it. */
interface Document {
  readonly maps?: readonly unknown[];
  readonly defaultMap?: string;
  readonly resources: readonly Resource[];
}

type Loader = (document: Document) => LoadSpaceResult;

/**
 * The file loader: resources arrive as the markdown files an author wrote, so the
 * document under test is turned back into frontmatter on the way in.
 */
const viaFiles: Loader = ({ resources, ...structure }) =>
  loadSpace(
    { version: 1, id: SPACE, title: 'Test space', ...structure },
    resources.map((resource) =>
      resource.kind === 'reference'
        ? referenceFile(resource.id, resource.title, resource.target)
        : resource.kind === 'space'
          ? {
              path: `resources/${resource.id}.md`,
              text: `---\nid: ${resource.id}\ntitle: ${resource.title}\nkind: space\nspaceId: ${resource.spaceId}\nmap: ${resource.map}\ngraph: ${resource.graph}\n---\n`,
            }
          : resourceFile(resource.id, resource.title, resource.body),
    ),
  );

/** The persistence loader: the same aggregate, fully identified. */
const viaSnapshot: Loader = ({ resources, ...structure }) => {
  const result = loadSpaceSnapshot({
    id: SPACE,
    document: { version: 1, title: 'Test space', ...structure },
    resources: resources.map(({ id, ...document }) => ({ id, document })),
  });
  return result.ok ? { ok: true, space: result.space } : result;
};

const markdown = (id: string, title = id): Resource => ({
  id: uuid(id),
  title,
  kind: 'markdown',
  body: '',
});

const referenceTo = (id: string, target: string): Resource => ({
  id: uuid(id),
  title: `reference ${id}`,
  kind: 'reference',
  target: uuid(target),
});

/**
 * The Map and Graph every Space Resource below selects. A Space Resource names
 * them in its **target** Space (ADR 0079), and single-Space intake never opens
 * a target — only the aggregate does — so one pair serves every Space Resource
 * here, and what these ids resolve to is the aggregate's question rather than
 * this file's.
 */
const TARGET_MAP = uuid('00000000-0000-4000-8000-000000000097');
const TARGET_GRAPH = uuid('00000000-0000-4000-8000-000000000098');

const spaceResource = (id: string, spaceId: string): Resource => ({
  id: uuid(id),
  title: `Space ${spaceId}`,
  kind: 'space',
  spaceId: uuid(spaceId),
  map: TARGET_MAP,
  graph: TARGET_GRAPH,
});

/** An Edge as a space file writes it. */
interface EdgeInput {
  readonly from: string;
  readonly to: string;
  readonly title?: string;
  readonly titleHidden?: true;
}

const graph = (id: string, title: string, edges: readonly EdgeInput[] = []) => ({
  id,
  title,
  edges,
});

const map = (
  id: string,
  positions: Record<string, ResourcePlacement>,
  graphs: unknown[],
  extra: { readonly activeGraph?: string } = {},
) => ({ id, title: `Map ${id}`, kind: 'positioned', positions, graphs, ...extra });

/** One Map over A and B, owning one Graph that joins them. */
const simple = (defaultMap?: string): Document => {
  const document: Document = {
    resources: [markdown(A, 'A'), markdown(B, 'B')],
    maps: [
      map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
        graph(MAIN, 'Main', [{ from: A, to: B }]),
      ]),
    ],
  };
  return defaultMap === undefined ? document : { ...document, defaultMap };
};

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
    it('flattens the graphs its maps own, in map then authored order', () => {
      const space = loaded(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
              graph(MAIN, 'Main', [{ from: A, to: B }]),
              graph(ASIDE, 'Aside', [{ from: B, to: A }]),
            ]),
            map(SECOND, { [A]: { x: 0, y: 200, open: false } }, [graph(THIRD, 'Third')]),
          ],
        }),
      );

      expect(space.graphs.map((entry) => entry.title)).toEqual(['Main', 'Aside', 'Third']);
    });

    it('flattens the exact nested values, never copies of them', () => {
      const space = loaded(load(simple()));
      const [first] = space.graphs;
      expect(first).toBe(space.maps[0]?.graphs[0]);
      expect(space.lookup.graph(MAIN)?.graph).toBe(first);
    });

    it('answers one canonical value per id, however often it is asked', () => {
      const space = loaded(load(simple()));
      expect(space.lookup.map(WORKING)).toBe(space.lookup.map(WORKING));
      expect(space.lookup.graph(MAIN)).toBe(space.lookup.graph(MAIN));
      expect(space.lookup.resource(A)).toBe(space.lookup.resource(A));
    });

    it('answers a graph with the very value its owner resolves to', () => {
      const space = loaded(load(simple()));
      expect(space.lookup.graph(MAIN)?.owner).toBe(space.lookup.map(WORKING));
      expect(space.lookup.graph(MAIN)?.owner.map.id).toBe(WORKING);
    });

    it('answers a map with the exact owned graph it opens active on', () => {
      const space = loaded(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(
              WORKING,
              { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } },
              [graph(MAIN, 'Main', [{ from: A, to: B }]), graph(ASIDE, 'Aside')],
              { activeGraph: ASIDE },
            ),
          ],
        }),
      );

      const resolved = space.lookup.map(WORKING);
      expect(resolved?.activeGraph).toBe(space.lookup.graph(ASIDE)?.graph);
    });

    it('falls back to a map’s first graph when it names none', () => {
      const space = loaded(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
              graph(MAIN, 'Main', [{ from: A, to: B }]),
              graph(ASIDE, 'Aside'),
            ]),
          ],
        }),
      );

      expect(space.lookup.map(WORKING)?.activeGraph.id).toBe(MAIN);
    });

    it('resolves the fallback without filling the authored optional', () => {
      // Resolution is a read. The authored value is what a snapshot and an export
      // are projected from, so writing the fallback into it would turn "the first
      // one, whichever that is" into a named choice the author never made.
      const space = loaded(load(simple()));
      expect(space.lookup.map(WORKING)?.activeGraph.id).toBe(MAIN);
      expect(space.maps[0]?.activeGraph).toBeUndefined();
    });

    it('answers nothing for an id the space does not hold', () => {
      const space = loaded(load(simple()));
      expect(space.lookup.resource(ABSENT)).toBeUndefined();
      expect(space.lookup.map(ABSENT)).toBeUndefined();
      expect(space.lookup.graph(ABSENT)).toBeUndefined();
    });

    it('builds a space with resources and no maps, and so no graphs (ADR 0015)', () => {
      const space = loaded(load({ resources: [markdown(A, 'A')], maps: [] }));
      expect(space.graphs).toEqual([]);
      expect(space.maps).toEqual([]);
      expect(space.lookup.resource(A)?.title).toBe('A');
    });

    it('loads a map whose only graph holds no edges', () => {
      // Creating a Map creates its initial empty Active Graph in the same Edit
      // (ADR 0040). Closure over an empty edge set is vacuous, not exempt.
      const space = loaded(
        load({
          resources: [markdown(A, 'A')],
          maps: [map(WORKING, { [A]: { x: 0, y: 0, open: false } }, [graph(MAIN, 'Graph 1')])],
        }),
      );
      expect(space.lookup.graph(MAIN)?.graph.edges).toEqual([]);
    });
  });

  describe('edge closure over the owning map (ADR 0040)', () => {
    it('accepts a cycle, a self-edge, a fork and a merge (ADR 0032)', () => {
      const space = loaded(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B'), markdown(C, 'C')],
          maps: [
            map(
              WORKING,
              {
                [A]: { x: 0, y: 0, open: false },
                [B]: { x: 320, y: 0, open: false },
                [C]: { x: 640, y: 0, open: false },
              },
              [
                graph(MAIN, 'Main', [
                  { from: A, to: B },
                  { from: B, to: A },
                  { from: B, to: B },
                  { from: A, to: C },
                  { from: C, to: B },
                ]),
              ],
            ),
          ],
        }),
      );
      expect(space.lookup.graph(MAIN)?.graph.edges).toHaveLength(5);
    });

    it('accepts the same edge in two graphs one map owns', () => {
      const space = loaded(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
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
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
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

    it('keys an Edge on its endpoints, so two with different Titles are still a duplicate', () => {
      const errors = refused(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
              graph(MAIN, 'Main', [
                { from: A, to: B, title: 'On success' },
                { from: A, to: B, title: 'On failure' },
              ]),
            ]),
          ],
        }),
      );
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'duplicate-graph-edge', ref: `${A} → ${B}` }),
      );
    });

    it('keeps a titled, hidden Edge whole through intake', () => {
      const edge = { from: A, to: B, title: 'On success', titleHidden: true } as const;
      const space = loaded(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
              graph(MAIN, 'Main', [edge]),
            ]),
          ],
        }),
      );
      expect(space.lookup.graph(MAIN)?.graph.edges).toEqual([edge]);
    });

    it('refuses an endpoint naming a resource the space does not hold, and says only that', () => {
      const errors = refused(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
              graph(MAIN, 'Main', [{ from: A, to: ABSENT }]),
            ]),
          ],
        }),
      );

      expect(errors.map(({ kind }) => kind)).toEqual(['graph-edge-missing-resource']);
      expect(errors[0]?.ref).toBe(ABSENT);
      expect(errors[0]?.message).toContain('as its to');
    });

    it('refuses an endpoint naming a space resource outside its map, and says only that', () => {
      // The failure a space-wide check could not see: `C` is a perfectly good
      // Space resource, but this Map does not position it, so it is not a member
      // and an Edge here cannot reach it. Told apart from the case above because
      // the two send an author to different places — add a member, or find a resource
      // that is gone.
      const errors = refused(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B'), markdown(C, 'C')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
              graph(MAIN, 'Main', [{ from: B, to: C }]),
            ]),
          ],
        }),
      );

      expect(errors.map(({ kind }) => kind)).toEqual(['graph-edge-resource-outside-map']);
      expect(errors[0]?.ref).toBe(C);
      expect(errors[0]?.message).toContain(WORKING);
    });

    it('refuses an endpoint naming a resource only a second map holds', () => {
      const errors = refused(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B'), markdown(C, 'C')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
              graph(MAIN, 'Main', [{ from: A, to: C }]),
            ]),
            map(SECOND, { [C]: { x: 0, y: 200, open: false } }, [graph(ASIDE, 'Aside')]),
          ],
        }),
      );
      expect(errors.map(({ kind }) => kind)).toEqual(['graph-edge-resource-outside-map']);
    });

    it('says only that a position names a missing resource, not that edges into it dangle', () => {
      // The position is the fault; an edge reaching that member is a consequence.
      // Diagnosing both would send an author looking for two problems.
      const errors = refused(
        load({
          resources: [markdown(A, 'A')],
          maps: [
            map(
              WORKING,
              { [A]: { x: 0, y: 0, open: false }, [ABSENT]: { x: 320, y: 0, open: false } },
              [graph(MAIN, 'Main', [{ from: A, to: ABSENT }])],
            ),
          ],
        }),
      );

      expect(errors.map(({ kind }) => kind)).toEqual(['map-member-missing-resource']);
      expect(errors[0]?.ref).toBe(ABSENT);
    });

    it('accepts a map that omits resources — a resource it leaves out is not in it', () => {
      const space = loaded(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B'), markdown(C, 'C')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
              graph(MAIN, 'Main', [{ from: A, to: B }]),
            ]),
          ],
        }),
      );
      expect(space.resources).toHaveLength(3);
    });
  });

  describe('the graph a map opens active on (ADR 0026)', () => {
    it('accepts any graph the map owns', () => {
      const space = loaded(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(
              WORKING,
              { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } },
              [graph(MAIN, 'Main', [{ from: A, to: B }]), graph(ASIDE, 'Aside')],
              { activeGraph: ASIDE },
            ),
          ],
        }),
      );
      expect(space.lookup.map(WORKING)?.activeGraph.id).toBe(ASIDE);
    });

    it('refuses one no map in the space owns, and says only that', () => {
      const errors = refused(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(
              WORKING,
              { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } },
              [graph(MAIN, 'Main', [{ from: A, to: B }])],
              { activeGraph: ABSENT },
            ),
          ],
        }),
      );

      expect(errors.map(({ kind }) => kind)).toEqual(['map-active-graph-missing']);
      expect(errors[0]?.ref).toBe(ABSENT);
      expect(errors[0]?.message).toContain(WORKING);
    });

    it('refuses one a second map owns — ownership, not existence', () => {
      // The graph resolves in the space, so a space-wide check would pass it. It
      // is not this map's to open on, which is what ownership makes checkable.
      const errors = refused(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(
              WORKING,
              { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } },
              [graph(MAIN, 'Main', [{ from: A, to: B }])],
              { activeGraph: ASIDE },
            ),
            map(SECOND, { [A]: { x: 0, y: 200, open: false } }, [graph(ASIDE, 'Aside')]),
          ],
        }),
      );

      expect(errors.map(({ kind }) => kind)).toEqual(['map-active-graph-outside-map']);
      expect(errors[0]?.ref).toBe(ASIDE);
    });
  });

  describe('duplicate identities', () => {
    it('reports one error per repeated graph id, naming every occurrence in order', () => {
      // Ownership is map-scoped; the *id* is not (ADR 0045). The flatten keys
      // colour, `<graphId>::out`/`::in` handles and activation on the id alone,
      // and the lookup would drop one of a set in silence. One error, because one
      // id is one fault however many times it appears — and it names where each
      // occurrence is, since that is the only actionable part.
      const errors = refused(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
              graph(MAIN, 'Main', [{ from: A, to: B }]),
              graph(MAIN, 'Main again'),
            ]),
            map(SECOND, { [A]: { x: 0, y: 200, open: false } }, [graph(MAIN, 'Main a third time')]),
          ],
        }),
      );

      const duplicates = errors.filter(({ kind }) => kind === 'duplicate-graph-id');
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]?.ref).toBe(MAIN);
      expect(duplicates[0]?.message).toBe(
        `Duplicate graph id "${MAIN}" at map "${WORKING}" graph 0, map "${WORKING}" graph 1, map "${SECOND}" graph 0`,
      );
    });

    it('accepts two maps owning distinct graphs over the same resources', () => {
      const space = loaded(
        load({
          resources: [markdown(A, 'A'), markdown(B, 'B')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false }, [B]: { x: 320, y: 0, open: false } }, [
              graph(MAIN, 'Main', [{ from: A, to: B }]),
            ]),
            map(
              SECOND,
              { [A]: { x: 0, y: 200, open: false }, [B]: { x: 320, y: 200, open: false } },
              [graph(ASIDE, 'Aside', [{ from: B, to: A }])],
            ),
          ],
        }),
      );
      expect(space.graphs.map(({ title }) => title)).toEqual(['Main', 'Aside']);
    });

    it('refuses duplicate map ids, which the lookup would silently collapse', () => {
      const errors = refused(
        load({
          resources: [markdown(A, 'A')],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false } }, [graph(MAIN, 'Main')]),
            map(WORKING, { [A]: { x: 0, y: 200, open: false } }, [graph(ASIDE, 'Aside')]),
          ],
        }),
      );
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'duplicate-map-id', ref: WORKING }),
      );
    });
  });

  describe('references (ADR 0009)', () => {
    it('accepts a single-hop reference to a markdown resource', () => {
      const space = loaded(
        load({
          resources: [markdown(A, 'A'), referenceTo(B, A)],
          maps: [],
        }),
      );
      expect(space.resources).toHaveLength(2);
    });

    it('refuses a reference resource whose target resolves to no resource', () => {
      const errors = refused(load({ resources: [referenceTo(A, ABSENT)], maps: [] }));
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'unresolved-reference-target', ref: ABSENT }),
      );
    });

    it('refuses a reference resource that points at itself', () => {
      const errors = refused(load({ resources: [referenceTo(A, A)], maps: [] }));
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'reference-targets-self', ref: A }),
      );
    });

    it('refuses a reference resource whose target is itself a reference resource', () => {
      const errors = refused(
        load({ resources: [markdown(A, 'A'), referenceTo(B, A), referenceTo(C, B)], maps: [] }),
      );
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'reference-targets-reference', ref: B }),
      );
    });

    it('accepts a reference resource whose target is a Space Resource', () => {
      expect(load({ resources: [spaceResource(A, ABSENT), referenceTo(B, A)], maps: [] }).ok).toBe(
        true,
      );
    });
  });

  describe('Space Resource reference cycles (ADR 0068)', () => {
    it('refuses a Space Resource that targets the Space containing it', () => {
      const errors = refused(load({ resources: [spaceResource(A, SPACE)], maps: [] }));

      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'space-resource-reference-cycle', ref: SPACE }),
      );
    });

    it('accepts several Space Resources that converge on one target', () => {
      const space = loaded(
        load({ resources: [spaceResource(A, C), spaceResource(B, C)], maps: [] }),
      );

      expect(space.resources).toHaveLength(2);
    });
  });

  describe('the view a space opens in', () => {
    it('accepts a defaultMap naming a declared map', () => {
      expect(loaded(load(simple(WORKING))).defaultMap).toBe(WORKING);
    });

    it('refuses a defaultMap naming no declared Map', () => {
      // The kind names the field the document actually has (ADR 0055): a kind
      // and the message beside it naming two different fields would send a
      // consumer matching on the kind to a field the document does not have.
      const errors = refused(load(simple(ABSENT)));
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: 'unresolved-default-map', ref: ABSENT }),
      );
      expect(errors.map(({ message }) => message).join('\n')).toContain('defaultMap');
    });
  });

  describe('independent faults', () => {
    it('accumulates unrelated errors rather than reporting the first', () => {
      const errors = refused(
        load({
          resources: [markdown(A, 'A'), referenceTo(B, ABSENT)],
          maps: [
            map(WORKING, { [A]: { x: 0, y: 0, open: false } }, [graph(MAIN, 'Main')]),
            map(WORKING, { [A]: { x: 0, y: 200, open: false } }, [graph(ASIDE, 'Aside')]),
          ],
          defaultMap: ABSENT,
        }),
      );

      expect(new Set(errors.map(({ kind }) => kind))).toEqual(
        new Set(['duplicate-map-id', 'unresolved-default-map', 'unresolved-reference-target']),
      );
    });

    it('is deterministic for one input', () => {
      const document = () =>
        load({
          resources: [markdown(A, 'A')],
          maps: [
            map(
              WORKING,
              { [A]: { x: 0, y: 0, open: false }, [ABSENT]: { x: 1, y: 1, open: false } },
              [graph(MAIN, 'Main'), graph(MAIN, 'Main again')],
            ),
          ],
        });
      expect(refused(document())).toEqual(refused(document()));
    });
  });
});
