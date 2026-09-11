import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadSpace, type Space } from '../src/index';
import { thingFile, uuid } from './thing-files';

/**
 * The aggregate properties of intake, stated over generated documents and
 * proved through the one public entry point.
 *
 * They were once stated over `validateReferences`, which is internal and takes a
 * shape no caller holds. Through `loadSpace` they say something stronger: not
 * merely that the check answers, but that what comes out the far side — the
 * flatten, the lookup, the resolved Active Graph — agrees with what went in.
 */

const thingId = (value: number) =>
  uuid(`00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`);
const graphId = (value: number) =>
  uuid(`00000000-0000-4000-8000-${(value + 0x100000).toString(16).padStart(12, '0')}`);
const diagramId = (value: number) =>
  uuid(`00000000-0000-4000-8000-${(value + 0x200000).toString(16).padStart(12, '0')}`);

const SPACE = uuid('00000000-0000-4000-8000-000000000001');

/** A Diagram over the given Things, owning graphs that chain them. */
function diagramOver(index: number, ids: number[], graphCount: number) {
  return {
    id: diagramId(index),
    title: `Diagram ${index}`,
    kind: 'positioned' as const,
    positions: Object.fromEntries(
      ids.map((id, i) => [thingId(id), { x: i * 320, y: index * 200, open: false }]),
    ),
    graphs: Array.from({ length: graphCount }, (_, g) => ({
      id: graphId(index * 100 + g),
      title: `Graph ${index}.${g}`,
      // Each graph chains the members in a rotation of their order, so several
      // graphs over one Diagram are distinct without ever leaving it.
      edges: ids.slice(0, -1).map((id, i) => ({
        from: thingId(g % 2 === 0 ? id : ids[i + 1]!),
        to: thingId(g % 2 === 0 ? ids[i + 1]! : id),
      })),
    })),
  };
}

function documentFrom(diagrams: { ids: number[]; graphs: number }[]) {
  const things = [...new Set(diagrams.flatMap((entry) => entry.ids))];
  return {
    file: {
      version: 1 as const,
      id: SPACE,
      title: 'Generated',
      diagrams: diagrams.map((entry, index) => diagramOver(index, entry.ids, entry.graphs)),
    },
    things: things.map((id) => thingFile(thingId(id), `Thing ${id}`)),
  };
}

const load = (diagrams: { ids: number[]; graphs: number }[]) => {
  const { file, things } = documentFrom(diagrams);
  return loadSpace(file, things);
};

const accepted = (diagrams: { ids: number[]; graphs: number }[]): Space => {
  const result = load(diagrams);
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
  return result.space;
};

/** At least two members, so a chain has an edge; several diagrams, so the flatten crosses one. */
const diagramsArb = fc.array(
  fc.record({
    ids: fc.uniqueArray(fc.integer({ min: 0, max: 400 }), { minLength: 2, maxLength: 6 }),
    graphs: fc.integer({ min: 1, max: 3 }),
  }),
  { minLength: 1, maxLength: 4 },
);

describe('what intake builds, over generated documents', () => {
  it('flattens diagrams in declared order, each diagram’s graphs in authored order', () => {
    fc.assert(
      fc.property(diagramsArb, (diagrams) => {
        const space = accepted(diagrams);
        expect(space.graphs).toEqual(space.diagrams.flatMap((diagram) => diagram.graphs));
      }),
    );
  });

  it('flattens the exact nested values rather than copies', () => {
    fc.assert(
      fc.property(diagramsArb, (diagrams) => {
        const space = accepted(diagrams);
        const nested = space.diagrams.flatMap((diagram) => diagram.graphs);
        space.graphs.forEach((graph, index) => {
          expect(graph).toBe(nested[index]);
        });
      }),
    );
  });

  it('answers every graph with the one canonical diagram that owns it', () => {
    fc.assert(
      fc.property(diagramsArb, (diagrams) => {
        const space = accepted(diagrams);
        for (const diagram of space.diagrams) {
          const owner = space.lookup.diagram(diagram.id);
          for (const graph of diagram.graphs) {
            const owned = space.lookup.graph(graph.id);
            expect(owned?.graph).toBe(graph);
            expect(owned?.owner).toBe(owner);
          }
        }
      }),
    );
  });

  it('resolves every diagram’s active graph to one it owns', () => {
    fc.assert(
      fc.property(diagramsArb, (diagrams) => {
        const space = accepted(diagrams);
        for (const diagram of space.diagrams) {
          const resolved = space.lookup.diagram(diagram.id);
          expect(resolved).toBeDefined();
          expect(diagram.graphs).toContain(resolved?.activeGraph);
        }
      }),
    );
  });

  it('accepts only documents whose every edge endpoint is a member of its own diagram', () => {
    fc.assert(
      fc.property(diagramsArb, (diagrams) => {
        const space = accepted(diagrams);
        for (const diagram of space.diagrams) {
          const members = new Set(Object.keys(diagram.positions));
          for (const graph of diagram.graphs) {
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
      fc.property(diagramsArb, fc.nat(), fc.nat(), (diagrams, rawTarget, rawHost) => {
        const { file, things } = documentFrom(diagrams);
        const all = file.diagrams.flatMap((diagram) =>
          diagram.graphs.map((graph) => ({ diagram, graph })),
        );
        const target = all[rawTarget % all.length]!;
        // The host diagram is an independent draw, so the repeat lands in its own
        // owner and in another diagram across the run. Deriving both from one
        // draw correlates them — with one graph per diagram the two indices are
        // then always equal, and a cross-diagram repeat is never generated.
        const host = file.diagrams[rawHost % file.diagrams.length]!;
        host.graphs.push({ ...target.graph, title: 'Repeat' });

        const result = loadSpace(file, things);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.some((error) => error.kind === 'duplicate-graph-id')).toBe(true);
      }),
    );
  });

  it('keeps authored diagram and graph order however the thing files arrive', () => {
    fc.assert(
      fc.property(diagramsArb, (diagrams) => {
        const { file, things } = documentFrom(diagrams);
        const forwards = loadSpace(file, things);
        const backwards = loadSpace(file, [...things].reverse());
        expect(forwards.ok && backwards.ok).toBe(true);
        if (!forwards.ok || !backwards.ok) return;
        expect(backwards.space.diagrams.map((diagram) => diagram.id)).toEqual(
          forwards.space.diagrams.map((diagram) => diagram.id),
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
      fc.property(diagramsArb, fc.nat(), (diagrams, raw) => {
        const { file, things } = documentFrom(diagrams);
        const edges = file.diagrams.flatMap((diagram) =>
          diagram.graphs.flatMap((graph) => graph.edges),
        );
        edges[raw % edges.length]!.to = uuid('00000000-0000-4000-8000-ffffffffffff');

        const result = loadSpace(file, things);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.some((error) => error.kind === 'graph-edge-missing-thing')).toBe(true);
      }),
    );
  });

  it('detects an endpoint the owning diagram does not hold, and says it is a space thing', () => {
    // The closure rule ADR 0040 adds, and the reason it cannot be checked
    // against the space: every id here names a real thing, so the only thing
    // wrong is *where* it is. Dropping any one thing's position drops it from the
    // diagram's membership, and every edge that touched it is then unclosed.
    fc.assert(
      fc.property(diagramsArb, fc.nat(), (diagrams, raw) => {
        const { file, things } = documentFrom(diagrams);
        const diagram = file.diagrams[raw % file.diagrams.length]!;
        const keys = Object.keys(diagram.positions);
        const evicted = keys[raw % keys.length]!;
        diagram.positions = Object.fromEntries(
          Object.entries(diagram.positions).filter(([id]) => id !== evicted),
        );

        const result = loadSpace(file, things);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(
          result.errors.some(
            (error) => error.kind === 'graph-edge-thing-outside-diagram' && error.ref === evicted,
          ),
        ).toBe(true);
        // Still a thing of the space — nothing about it went missing, which is
        // exactly why the other kind must not be reported for it.
        expect(result.errors.some((error) => error.kind === 'diagram-member-missing-thing')).toBe(
          false,
        );
        expect(result.errors.some((error) => error.kind === 'graph-edge-missing-thing')).toBe(
          false,
        );
      }),
    );
  });

  it('detects an exact duplicate edge added to any graph', () => {
    fc.assert(
      fc.property(diagramsArb, fc.nat(), (diagrams, raw) => {
        const { file, things } = documentFrom(diagrams);
        const graphs = file.diagrams.flatMap((diagram) => diagram.graphs);
        const graph = graphs[raw % graphs.length]!;
        graph.edges.push({ ...graph.edges[raw % graph.edges.length]! });

        const result = loadSpace(file, things);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.some((error) => error.kind === 'duplicate-graph-edge')).toBe(true);
      }),
    );
  });
});
