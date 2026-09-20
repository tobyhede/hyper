import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadSpace, type Space } from '../src/index';
import { resourceFile, uuid } from './resource-files';

/**
 * The aggregate properties of intake, stated over generated documents and
 * proved through the one public entry point.
 *
 * They were once stated over `validateReferences`, which is internal and takes a
 * shape no caller holds. Through `loadSpace` they say something stronger: not
 * merely that the check answers, but that what comes out the far side — the
 * flatten, the lookup, the resolved Active Graph — agrees with what went in.
 */

const resourceId = (value: number) =>
  uuid(`00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`);
const graphId = (value: number) =>
  uuid(`00000000-0000-4000-8000-${(value + 0x100000).toString(16).padStart(12, '0')}`);
const mapId = (value: number) =>
  uuid(`00000000-0000-4000-8000-${(value + 0x200000).toString(16).padStart(12, '0')}`);

const SPACE = uuid('00000000-0000-4000-8000-000000000001');

/** A Map over the given Resources, owning graphs that chain them. */
function mapOver(index: number, ids: number[], graphCount: number) {
  return {
    id: mapId(index),
    title: `Map ${index}`,
    kind: 'positioned' as const,
    positions: Object.fromEntries(
      ids.map((id, i) => [resourceId(id), { x: i * 320, y: index * 200, open: false }]),
    ),
    graphs: Array.from({ length: graphCount }, (_, g) => ({
      id: graphId(index * 100 + g),
      title: `Graph ${index}.${g}`,
      // Each graph chains the members in a rotation of their order, so several
      // graphs over one Map are distinct without ever leaving it.
      edges: ids.slice(0, -1).map((id, i) => ({
        from: resourceId(g % 2 === 0 ? id : ids[i + 1]!),
        to: resourceId(g % 2 === 0 ? ids[i + 1]! : id),
      })),
    })),
  };
}

function documentFrom(maps: { ids: number[]; graphs: number }[]) {
  const resources = [...new Set(maps.flatMap((entry) => entry.ids))];
  return {
    file: {
      version: 1 as const,
      id: SPACE,
      title: 'Generated',
      maps: maps.map((entry, index) => mapOver(index, entry.ids, entry.graphs)),
    },
    resources: resources.map((id) => resourceFile(resourceId(id), `Resource ${id}`)),
  };
}

const load = (maps: { ids: number[]; graphs: number }[]) => {
  const { file, resources } = documentFrom(maps);
  return loadSpace(file, resources);
};

const accepted = (maps: { ids: number[]; graphs: number }[]): Space => {
  const result = load(maps);
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
  return result.space;
};

/** At least two members, so a chain has an edge; several maps, so the flatten crosses one. */
const mapsArb = fc.array(
  fc.record({
    ids: fc.uniqueArray(fc.integer({ min: 0, max: 400 }), { minLength: 2, maxLength: 6 }),
    graphs: fc.integer({ min: 1, max: 3 }),
  }),
  { minLength: 1, maxLength: 4 },
);

describe('what intake builds, over generated documents', () => {
  it('flattens maps in declared order, each map’s graphs in authored order', () => {
    fc.assert(
      fc.property(mapsArb, (maps) => {
        const space = accepted(maps);
        expect(space.graphs).toEqual(space.maps.flatMap((map) => map.graphs));
      }),
    );
  });

  it('flattens the exact nested values rather than copies', () => {
    fc.assert(
      fc.property(mapsArb, (maps) => {
        const space = accepted(maps);
        const nested = space.maps.flatMap((map) => map.graphs);
        space.graphs.forEach((graph, index) => {
          expect(graph).toBe(nested[index]);
        });
      }),
    );
  });

  it('answers every graph with the one canonical map that owns it', () => {
    fc.assert(
      fc.property(mapsArb, (maps) => {
        const space = accepted(maps);
        for (const map of space.maps) {
          const owner = space.lookup.map(map.id);
          for (const graph of map.graphs) {
            const owned = space.lookup.graph(graph.id);
            expect(owned?.graph).toBe(graph);
            expect(owned?.owner).toBe(owner);
          }
        }
      }),
    );
  });

  it('resolves every map’s active graph to one it owns', () => {
    fc.assert(
      fc.property(mapsArb, (maps) => {
        const space = accepted(maps);
        for (const map of space.maps) {
          const resolved = space.lookup.map(map.id);
          expect(resolved).toBeDefined();
          expect(map.graphs).toContain(resolved?.activeGraph);
        }
      }),
    );
  });

  it('accepts only documents whose every edge endpoint is a member of its own map', () => {
    fc.assert(
      fc.property(mapsArb, (maps) => {
        const space = accepted(maps);
        for (const map of space.maps) {
          const members = new Set(Object.keys(map.positions));
          for (const graph of map.graphs) {
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
      fc.property(mapsArb, fc.nat(), fc.nat(), (maps, rawTarget, rawHost) => {
        const { file, resources } = documentFrom(maps);
        const all = file.maps.flatMap((map) => map.graphs.map((graph) => ({ map, graph })));
        const target = all[rawTarget % all.length]!;
        // The host map is an independent draw, so the repeat lands in its own
        // owner and in another map across the run. Deriving both from one
        // draw correlates them — with one graph per map the two indices are
        // then always equal, and a cross-map repeat is never generated.
        const host = file.maps[rawHost % file.maps.length]!;
        host.graphs.push({ ...target.graph, title: 'Repeat' });

        const result = loadSpace(file, resources);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.some((error) => error.kind === 'duplicate-graph-id')).toBe(true);
      }),
    );
  });

  it('keeps authored map and graph order however the resource files arrive', () => {
    fc.assert(
      fc.property(mapsArb, (maps) => {
        const { file, resources } = documentFrom(maps);
        const forwards = loadSpace(file, resources);
        const backwards = loadSpace(file, [...resources].reverse());
        expect(forwards.ok && backwards.ok).toBe(true);
        if (!forwards.ok || !backwards.ok) return;
        expect(backwards.space.maps.map((map) => map.id)).toEqual(
          forwards.space.maps.map((map) => map.id),
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
      fc.property(mapsArb, fc.nat(), (maps, raw) => {
        const { file, resources } = documentFrom(maps);
        const edges = file.maps.flatMap((map) => map.graphs.flatMap((graph) => graph.edges));
        edges[raw % edges.length]!.to = uuid('00000000-0000-4000-8000-ffffffffffff');

        const result = loadSpace(file, resources);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.some((error) => error.kind === 'graph-edge-missing-resource')).toBe(
          true,
        );
      }),
    );
  });

  it('detects an endpoint the owning map does not hold, and says it is a space resource', () => {
    // The closure rule ADR 0040 adds, and the reason it cannot be checked
    // against the space: every id here names a real resource, so the only fault is
    // *where* it is. Dropping any one resource's position drops it from the
    // map's membership, and every edge that touched it is then unclosed.
    fc.assert(
      fc.property(mapsArb, fc.nat(), (maps, raw) => {
        const { file, resources } = documentFrom(maps);
        const map = file.maps[raw % file.maps.length]!;
        const keys = Object.keys(map.positions);
        const evicted = keys[raw % keys.length]!;
        map.positions = Object.fromEntries(
          Object.entries(map.positions).filter(([id]) => id !== evicted),
        );

        const result = loadSpace(file, resources);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(
          result.errors.some(
            (error) => error.kind === 'graph-edge-resource-outside-map' && error.ref === evicted,
          ),
        ).toBe(true);
        // Still a resource of the space — nothing about it went missing, which is
        // exactly why the other kind must not be reported for it.
        expect(result.errors.some((error) => error.kind === 'map-member-missing-resource')).toBe(
          false,
        );
        expect(result.errors.some((error) => error.kind === 'graph-edge-missing-resource')).toBe(
          false,
        );
      }),
    );
  });

  it('detects an exact duplicate edge added to any graph', () => {
    fc.assert(
      fc.property(mapsArb, fc.nat(), (maps, raw) => {
        const { file, resources } = documentFrom(maps);
        const graphs = file.maps.flatMap((map) => map.graphs);
        const graph = graphs[raw % graphs.length]!;
        graph.edges.push({ ...graph.edges[raw % graph.edges.length]! });

        const result = loadSpace(file, resources);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.some((error) => error.kind === 'duplicate-graph-edge')).toBe(true);
      }),
    );
  });
});
