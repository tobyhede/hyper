import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadSpace, type Space } from '../src/index';
import { cardFile, uuid } from './card-files';

/**
 * The aggregate properties of intake, stated over generated documents and
 * proved through the one public entry point.
 *
 * They were once stated over `validateReferences`, which is internal and takes a
 * shape no caller holds. Through `loadSpace` they say something stronger: not
 * merely that the check answers, but that what comes out the far side — the
 * flatten, the lookup, the resolved Active Graph — agrees with what went in.
 */

const cardId = (value: number) =>
  uuid(`00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`);
const graphId = (value: number) =>
  uuid(`00000000-0000-4000-8000-${(value + 0x100000).toString(16).padStart(12, '0')}`);
const layoutId = (value: number) =>
  uuid(`00000000-0000-4000-8000-${(value + 0x200000).toString(16).padStart(12, '0')}`);

const SPACE = uuid('00000000-0000-4000-8000-000000000001');

/** A Layout over the given Cards, owning graphs that chain them. */
function layoutOver(index: number, ids: number[], graphCount: number) {
  return {
    id: layoutId(index),
    title: `Layout ${index}`,
    kind: 'positioned' as const,
    positions: Object.fromEntries(ids.map((id, i) => [cardId(id), { x: i * 320, y: index * 200 }])),
    graphs: Array.from({ length: graphCount }, (_, g) => ({
      id: graphId(index * 100 + g),
      title: `Graph ${index}.${g}`,
      // Each graph chains the members in a rotation of their order, so several
      // graphs over one Layout are distinct without ever leaving it.
      edges: ids.slice(0, -1).map((id, i) => ({
        from: cardId(g % 2 === 0 ? id : ids[i + 1]!),
        to: cardId(g % 2 === 0 ? ids[i + 1]! : id),
      })),
    })),
  };
}

function documentFrom(layouts: { ids: number[]; graphs: number }[]) {
  const cards = [...new Set(layouts.flatMap((entry) => entry.ids))];
  return {
    file: {
      version: 1 as const,
      id: SPACE,
      title: 'Generated',
      layouts: layouts.map((entry, index) => layoutOver(index, entry.ids, entry.graphs)),
    },
    cards: cards.map((id) => cardFile(cardId(id), `Card ${id}`)),
  };
}

const load = (layouts: { ids: number[]; graphs: number }[]) => {
  const { file, cards } = documentFrom(layouts);
  return loadSpace(file, cards);
};

const accepted = (layouts: { ids: number[]; graphs: number }[]): Space => {
  const result = load(layouts);
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
  return result.space;
};

/** At least two members, so a chain has an edge; several layouts, so the flatten crosses one. */
const layoutsArb = fc.array(
  fc.record({
    ids: fc.uniqueArray(fc.integer({ min: 0, max: 400 }), { minLength: 2, maxLength: 6 }),
    graphs: fc.integer({ min: 1, max: 3 }),
  }),
  { minLength: 1, maxLength: 4 },
);

describe('what intake builds, over generated documents', () => {
  it('flattens layouts in declared order, each layout’s graphs in authored order', () => {
    fc.assert(
      fc.property(layoutsArb, (layouts) => {
        const space = accepted(layouts);
        expect(space.graphs).toEqual(space.layouts.flatMap((layout) => layout.graphs));
      }),
    );
  });

  it('flattens the exact nested values rather than copies', () => {
    fc.assert(
      fc.property(layoutsArb, (layouts) => {
        const space = accepted(layouts);
        const nested = space.layouts.flatMap((layout) => layout.graphs);
        space.graphs.forEach((graph, index) => {
          expect(graph).toBe(nested[index]);
        });
      }),
    );
  });

  it('answers every graph with the one canonical layout that owns it', () => {
    fc.assert(
      fc.property(layoutsArb, (layouts) => {
        const space = accepted(layouts);
        for (const layout of space.layouts) {
          const owner = space.lookup.layout(layout.id);
          for (const graph of layout.graphs) {
            const owned = space.lookup.graph(graph.id);
            expect(owned?.graph).toBe(graph);
            expect(owned?.owner).toBe(owner);
          }
        }
      }),
    );
  });

  it('resolves every layout’s active graph to one it owns', () => {
    fc.assert(
      fc.property(layoutsArb, (layouts) => {
        const space = accepted(layouts);
        for (const layout of space.layouts) {
          const resolved = space.lookup.layout(layout.id);
          expect(resolved).toBeDefined();
          expect(layout.graphs).toContain(resolved?.activeGraph);
        }
      }),
    );
  });

  it('accepts only documents whose every edge endpoint is a member of its own layout', () => {
    fc.assert(
      fc.property(layoutsArb, (layouts) => {
        const space = accepted(layouts);
        for (const layout of space.layouts) {
          const members = new Set(Object.keys(layout.positions));
          for (const graph of layout.graphs) {
            for (const edge of graph.edges) {
              expect(members.has(edge.from)).toBe(true);
              expect(members.has(edge.to)).toBe(true);
            }
          }
        }
      }),
    );
  });

  it('never accepts a repeated graph id, wherever the repeat sits', () => {
    fc.assert(
      fc.property(layoutsArb, fc.nat(), fc.nat(), (layouts, rawTarget, rawHost) => {
        const { file, cards } = documentFrom(layouts);
        const all = file.layouts.flatMap((layout) =>
          layout.graphs.map((graph) => ({ layout, graph })),
        );
        const target = all[rawTarget % all.length]!;
        // The host layout is an independent draw, so the repeat lands in its own
        // owner and in another layout across the run. Deriving both from one
        // draw correlates them — with one graph per layout the two indices are
        // then always equal, and a cross-layout repeat is never generated.
        const host = file.layouts[rawHost % file.layouts.length]!;
        host.graphs.push({ ...target.graph, title: 'Repeat' });

        const result = loadSpace(file, cards);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.some((error) => error.kind === 'duplicate-graph-id')).toBe(true);
      }),
    );
  });

  it('keeps authored layout and graph order however the card files arrive', () => {
    fc.assert(
      fc.property(layoutsArb, (layouts) => {
        const { file, cards } = documentFrom(layouts);
        const forwards = loadSpace(file, cards);
        const backwards = loadSpace(file, [...cards].reverse());
        expect(forwards.ok && backwards.ok).toBe(true);
        if (!forwards.ok || !backwards.ok) return;
        expect(backwards.space.layouts.map((layout) => layout.id)).toEqual(
          forwards.space.layouts.map((layout) => layout.id),
        );
        expect(backwards.space.graphs.map((graph) => graph.id)).toEqual(
          forwards.space.graphs.map((graph) => graph.id),
        );
      }),
    );
  });
});

describe('what intake refuses, over generated documents', () => {
  it('detects any single broken edge endpoint', () => {
    fc.assert(
      fc.property(layoutsArb, fc.nat(), (layouts, raw) => {
        const { file, cards } = documentFrom(layouts);
        const edges = file.layouts.flatMap((layout) =>
          layout.graphs.flatMap((graph) => graph.edges),
        );
        edges[raw % edges.length]!.to = uuid('00000000-0000-4000-8000-ffffffffffff');

        const result = loadSpace(file, cards);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.some((error) => error.kind === 'graph-edge-missing-card')).toBe(true);
      }),
    );
  });

  it('detects an endpoint the owning layout does not hold, and says it is a space card', () => {
    // The closure rule ADR 0040 adds, and the reason it cannot be checked
    // against the space: every id here names a real card, so the only thing
    // wrong is *where* it is. Dropping any one card's position drops it from the
    // layout's membership, and every edge that touched it is then unclosed.
    fc.assert(
      fc.property(layoutsArb, fc.nat(), (layouts, raw) => {
        const { file, cards } = documentFrom(layouts);
        const layout = file.layouts[raw % file.layouts.length]!;
        const keys = Object.keys(layout.positions);
        const evicted = keys[raw % keys.length]!;
        layout.positions = Object.fromEntries(
          Object.entries(layout.positions).filter(([id]) => id !== evicted),
        );

        const result = loadSpace(file, cards);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(
          result.errors.some(
            (error) => error.kind === 'graph-edge-card-outside-layout' && error.ref === evicted,
          ),
        ).toBe(true);
        // Still a card of the space — nothing about it went missing, which is
        // exactly why the other kind must not be reported for it.
        expect(result.errors.some((error) => error.kind === 'layout-member-missing-card')).toBe(
          false,
        );
        expect(result.errors.some((error) => error.kind === 'graph-edge-missing-card')).toBe(false);
      }),
    );
  });

  it('detects an exact duplicate edge added to any graph', () => {
    fc.assert(
      fc.property(layoutsArb, fc.nat(), (layouts, raw) => {
        const { file, cards } = documentFrom(layouts);
        const graphs = file.layouts.flatMap((layout) => layout.graphs);
        const graph = graphs[raw % graphs.length]!;
        graph.edges.push({ ...graph.edges[raw % graph.edges.length]! });

        const result = loadSpace(file, cards);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.some((error) => error.kind === 'duplicate-graph-edge')).toBe(true);
      }),
    );
  });
});
