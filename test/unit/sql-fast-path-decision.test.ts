import fc from 'fast-check';
import {
  COLLAPSED_RESOURCE_SIZE,
  uuidSchema,
  type PositionedMap,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { decideCommit, type LoadedSpace, type SpaceCommit } from '@project/persistence';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { decideTopologyPreservingUpdate } from '../../src/persistence/sql-space-repository';

/*
 * The SQL repository's fast path decides a single update against the one
 * stored Space it names. It is an optimisation of `decideCommit`, so over a
 * valid stored aggregate every answer it gives must be the answer
 * `decideCommit` gives over the whole aggregate, and every Edit that changes
 * what another Space's Space Resource can select must be handed to
 * `decideCommit` instead.
 *
 * The aggregate: Meta references T and S; S also references T. T is the Space
 * other Spaces select into, with two Maps and three Graphs.
 */

const idAt = (offset: number): UUID =>
  uuidSchema.parse(`21000000-0000-4000-8000-${offset.toString(16).padStart(12, '0')}`);

const META = idAt(1);
const T = idAt(2);
const S = idAt(3);
const T_MAP_1 = idAt(10);
const T_MAP_2 = idAt(11);
const T_GRAPH_1A = idAt(12);
const T_GRAPH_1B = idAt(13);
const T_GRAPH_2A = idAt(14);
const S_MAP = idAt(20);
const S_GRAPH = idAt(21);
const META_MAP = idAt(30);
const META_GRAPH = idAt(31);
const T_RESOURCES = [idAt(40), idAt(41), idAt(42), idAt(43)] as const;
const S_NOTE = idAt(50);
const S_LINK_TO_T = idAt(51);
const META_LINK_TO_T = idAt(60);
const META_LINK_TO_S = idAt(61);

const closed = (x: number, y: number) => ({ x, y, open: false as const });

const markdown = (id: UUID, title: string) => ({
  id,
  document: { title, kind: 'markdown' as const, body: `# ${title}` },
});

const spaceLink = (id: UUID, spaceId: UUID, map: UUID, graph: UUID) => ({
  id,
  document: { title: 'Link', kind: 'space' as const, spaceId, map, graph },
});

const [R0, R1, R2, R3] = T_RESOURCES;

const target: SpaceSnapshot = {
  id: T,
  document: {
    version: 1,
    title: 'Target',
    defaultMap: T_MAP_1,
    maps: [
      {
        id: T_MAP_1,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [R0]: closed(0, 0),
          [R1]: closed(300, 0),
          [R2]: closed(0, 300),
          [R3]: closed(300, 300),
        },
        graphs: [
          { id: T_GRAPH_1A, title: 'Graph 1a', edges: [{ from: R0, to: R1 }] },
          { id: T_GRAPH_1B, title: 'Graph 1b', edges: [] },
        ],
        activeGraph: T_GRAPH_1A,
      },
      {
        id: T_MAP_2,
        title: 'Map 2',
        kind: 'positioned',
        positions: { [R0]: closed(0, 0), [R1]: closed(300, 0) },
        graphs: [{ id: T_GRAPH_2A, title: 'Graph 2a', edges: [] }],
      },
    ],
  },
  resources: T_RESOURCES.map((id, index) => markdown(id, `Resource ${index}`)),
};

const selector: SpaceSnapshot = {
  id: S,
  document: {
    version: 1,
    title: 'Selector',
    defaultMap: S_MAP,
    maps: [
      {
        id: S_MAP,
        title: 'Map',
        kind: 'positioned',
        positions: { [S_NOTE]: closed(0, 0), [S_LINK_TO_T]: closed(300, 0) },
        graphs: [{ id: S_GRAPH, title: 'Graph', edges: [{ from: S_NOTE, to: S_LINK_TO_T }] }],
      },
    ],
  },
  resources: [markdown(S_NOTE, 'Note'), spaceLink(S_LINK_TO_T, T, T_MAP_1, T_GRAPH_1B)],
};

const meta: SpaceSnapshot = {
  id: META,
  document: {
    version: 1,
    title: 'Meta',
    defaultMap: META_MAP,
    maps: [
      {
        id: META_MAP,
        title: 'Map',
        kind: 'positioned',
        positions: { [META_LINK_TO_T]: closed(0, 0) },
        graphs: [{ id: META_GRAPH, title: 'Graph', edges: [] }],
      },
    ],
  },
  resources: [
    spaceLink(META_LINK_TO_T, T, T_MAP_1, T_GRAPH_1A),
    spaceLink(META_LINK_TO_S, S, S_MAP, S_GRAPH),
  ],
};

const SNAPSHOTS = [meta, target, selector] as const;

type Maps = readonly PositionedMap[];

/**
 * One generated change to a Space's Maps. The first thirteen change only what
 * lies inside a Map; the rest change a Map id, a Graph id, which Map owns a
 * Graph, or `defaultMap`, unless they have nothing to act on or a later op
 * undoes them.
 */
type Op =
  | {
      readonly kind: 'move';
      readonly map: number;
      readonly resource: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'open';
      readonly map: number;
      readonly resource: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: 'close'; readonly map: number; readonly resource: number }
  | {
      readonly kind: 'place';
      readonly map: number;
      readonly resource: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: 'unplace'; readonly map: number; readonly resource: number }
  | {
      readonly kind: 'add-edge';
      readonly map: number;
      readonly graph: number;
      readonly from: number;
      readonly to: number;
    }
  | { readonly kind: 'remove-edge'; readonly map: number; readonly graph: number }
  | {
      readonly kind: 'retitle-graph';
      readonly map: number;
      readonly graph: number;
      readonly title: string;
    }
  | {
      readonly kind: 'recolor-graph';
      readonly map: number;
      readonly graph: number;
      readonly color: string;
    }
  | { readonly kind: 'retitle-map'; readonly map: number; readonly title: string }
  | { readonly kind: 'activate-graph'; readonly map: number; readonly graph: number }
  | { readonly kind: 'reverse-graphs'; readonly map: number }
  | { readonly kind: 'reverse-maps' }
  | { readonly kind: 'add-graph'; readonly map: number }
  | { readonly kind: 'remove-graph'; readonly map: number; readonly graph: number }
  | {
      readonly kind: 'move-graph';
      readonly map: number;
      readonly graph: number;
      readonly to: number;
    }
  | { readonly kind: 'add-map'; readonly resource: number }
  | { readonly kind: 'remove-map'; readonly map: number }
  | { readonly kind: 'default-map'; readonly map: number }
  | { readonly kind: 'reid-map'; readonly map: number }
  | { readonly kind: 'reid-graph'; readonly map: number; readonly graph: number };

const index = fc.nat({ max: 7 });
const coordinate = fc.integer({ min: -2000, max: 2000 });
const title = fc.constantFrom('Renamed', 'Another title', 'T');

const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant('move' as const),
    map: index,
    resource: index,
    x: coordinate,
    y: coordinate,
  }),
  fc.record({
    kind: fc.constant('open' as const),
    map: index,
    resource: index,
    width: fc.integer({ min: COLLAPSED_RESOURCE_SIZE.width, max: 2000 }),
    height: fc.integer({ min: COLLAPSED_RESOURCE_SIZE.height, max: 2000 }),
  }),
  fc.record({ kind: fc.constant('close' as const), map: index, resource: index }),
  fc.record({
    kind: fc.constant('place' as const),
    map: index,
    resource: index,
    x: coordinate,
    y: coordinate,
  }),
  fc.record({ kind: fc.constant('unplace' as const), map: index, resource: index }),
  fc.record({
    kind: fc.constant('add-edge' as const),
    map: index,
    graph: index,
    from: index,
    to: index,
  }),
  fc.record({ kind: fc.constant('remove-edge' as const), map: index, graph: index }),
  fc.record({ kind: fc.constant('retitle-graph' as const), map: index, graph: index, title }),
  fc.record({
    kind: fc.constant('recolor-graph' as const),
    map: index,
    graph: index,
    color: fc.constantFrom('#ff0000', 'teal'),
  }),
  fc.record({ kind: fc.constant('retitle-map' as const), map: index, title }),
  fc.record({ kind: fc.constant('activate-graph' as const), map: index, graph: index }),
  fc.record({ kind: fc.constant('reverse-graphs' as const), map: index }),
  fc.record({ kind: fc.constant('reverse-maps' as const) }),
  fc.record({ kind: fc.constant('add-graph' as const), map: index }),
  fc.record({ kind: fc.constant('remove-graph' as const), map: index, graph: index }),
  fc.record({ kind: fc.constant('move-graph' as const), map: index, graph: index, to: index }),
  fc.record({ kind: fc.constant('add-map' as const), resource: index }),
  fc.record({ kind: fc.constant('remove-map' as const), map: index }),
  fc.record({ kind: fc.constant('default-map' as const), map: index }),
  fc.record({ kind: fc.constant('reid-map' as const), map: index }),
  fc.record({ kind: fc.constant('reid-graph' as const), map: index, graph: index }),
);

const at = <Item>(items: readonly Item[], position: number): Item | undefined =>
  items.length === 0 ? undefined : items[position % items.length];

const replaceAt = <Item>(items: readonly Item[], position: number, next: Item): Item[] =>
  items.map((item, current) => (current === position % items.length ? next : item));

/**
 * What another Space's Space Resource can select in a Space, stated as sets
 * so order takes no part: the opening Map, the Map ids, and each Graph id with
 * the Map that owns it.
 */
const selectable = (document: SpaceSnapshot['document']) => ({
  defaultMap: document.defaultMap,
  maps: new Set((document.maps ?? []).map((map) => map.id)),
  owners: new Map(
    (document.maps ?? []).flatMap((map) => map.graphs.map((graph) => [graph.id, map.id] as const)),
  ),
});

/**
 * Apply `ops` in order. An op that has nothing to act on (a Graph index on a
 * Map, a Resource the Map does not place) changes nothing. Ops may leave a snapshot that fails intake --
 * an Edge to a Resource the Map no longer places, an `activeGraph` the Map no
 * longer owns -- which is part of what is being generated.
 */
const applyOps = (snapshot: SpaceSnapshot, ops: readonly Op[]): SpaceSnapshot => {
  let maps: Maps = snapshot.document.maps ?? [];
  let defaultMap = snapshot.document.defaultMap;
  const resourceIds = snapshot.resources.map((resource) => resource.id);
  const withMap = (position: number, change: (map: PositionedMap) => PositionedMap | undefined) => {
    const map = at(maps, position);
    if (map === undefined) return;
    const next = change(map);
    if (next !== undefined) maps = replaceAt(maps, position, next);
  };
  ops.forEach((current, opIndex) => {
    const freshId = idAt(1000 + opIndex);
    switch (current.kind) {
      case 'move':
      case 'place':
        withMap(current.map, (map) => {
          const resource = at(resourceIds, current.resource);
          if (resource === undefined) return undefined;
          const placed = map.positions[resource];
          if ((placed === undefined) !== (current.kind === 'place')) return undefined;
          return {
            ...map,
            positions: {
              ...map.positions,
              [resource]: { ...(placed ?? { open: false as const }), x: current.x, y: current.y },
            },
          };
        });
        break;
      case 'open':
      case 'close':
        withMap(current.map, (map) => {
          const resource = at(resourceIds, current.resource);
          const placed = resource === undefined ? undefined : map.positions[resource];
          if (resource === undefined || placed === undefined) return undefined;
          const next =
            current.kind === 'open'
              ? {
                  x: placed.x,
                  y: placed.y,
                  open: true as const,
                  openSize: { width: current.width, height: current.height },
                }
              : { ...placed, open: false as const };
          return { ...map, positions: { ...map.positions, [resource]: next } };
        });
        break;
      case 'unplace':
        withMap(current.map, (map) => {
          const resource = at(resourceIds, current.resource);
          if (resource === undefined || map.positions[resource] === undefined) return undefined;
          const { [resource]: _removed, ...positions } = map.positions;
          return { ...map, positions };
        });
        break;
      case 'add-edge':
      case 'remove-edge':
      case 'retitle-graph':
      case 'recolor-graph':
        withMap(current.map, (map) => {
          const graph = at(map.graphs, current.graph);
          if (graph === undefined) return undefined;
          const edited = (): typeof graph | undefined => {
            if (current.kind === 'add-edge') {
              const from = at(resourceIds, current.from);
              const to = at(resourceIds, current.to);
              if (from === undefined || to === undefined) return undefined;
              return { ...graph, edges: [...graph.edges, { from, to }] };
            }
            if (current.kind === 'remove-edge') return { ...graph, edges: graph.edges.slice(1) };
            if (current.kind === 'retitle-graph') return { ...graph, title: current.title };
            return { ...graph, color: current.color };
          };
          const next = edited();
          if (next === undefined) return undefined;
          return { ...map, graphs: replaceAt(map.graphs, current.graph, next) };
        });
        break;
      case 'retitle-map':
        withMap(current.map, (map) => ({ ...map, title: current.title }));
        break;
      case 'activate-graph':
        withMap(current.map, (map) => {
          const graph = at(map.graphs, current.graph);
          return graph === undefined ? undefined : { ...map, activeGraph: graph.id };
        });
        break;
      case 'reverse-graphs':
        withMap(current.map, (map) => ({ ...map, graphs: [...map.graphs].reverse() }));
        break;
      case 'reverse-maps':
        maps = [...maps].reverse();
        break;
      case 'add-graph':
        withMap(current.map, (map) => {
          return { ...map, graphs: [...map.graphs, { id: freshId, title: 'Added', edges: [] }] };
        });
        break;
      case 'remove-graph':
        withMap(current.map, (map) => {
          if (map.graphs.length < 2) return undefined;
          const removed = at(map.graphs, current.graph);
          return { ...map, graphs: map.graphs.filter((graph) => graph !== removed) };
        });
        break;
      case 'move-graph': {
        const from = at(maps, current.map);
        const to = at(maps, current.to);
        const graph = from === undefined ? undefined : at(from.graphs, current.graph);
        if (from === undefined || to === undefined || graph === undefined) break;
        if (from === to || from.graphs.length < 2) break;
        maps = maps.map((map) => {
          if (map === from)
            return { ...map, graphs: map.graphs.filter((owned) => owned !== graph) };
          if (map === to) return { ...map, graphs: [...map.graphs, graph] };
          return map;
        });
        break;
      }
      case 'add-map': {
        const resource = at(resourceIds, current.resource);
        maps = [
          ...maps,
          {
            id: freshId,
            title: 'Added Map',
            kind: 'positioned',
            positions: resource === undefined ? {} : { [resource]: closed(0, 0) },
            graphs: [{ id: idAt(2000 + opIndex), title: 'Added Graph', edges: [] }],
          },
        ];
        break;
      }
      case 'remove-map': {
        if (maps.length < 2) break;
        const removed = at(maps, current.map);
        maps = maps.filter((map) => map !== removed);
        break;
      }
      case 'default-map': {
        const chosen = at(maps, current.map);
        if (chosen === undefined || chosen.id === defaultMap) break;
        defaultMap = chosen.id;
        break;
      }
      case 'reid-map':
        withMap(current.map, (map) => {
          return { ...map, id: freshId };
        });
        break;
      case 'reid-graph':
        withMap(current.map, (map) => {
          const graph = at(map.graphs, current.graph);
          if (graph === undefined) return undefined;
          return {
            ...map,
            graphs: replaceAt(map.graphs, current.graph, { ...graph, id: freshId }),
          };
        });
        break;
    }
  });
  return { ...snapshot, document: { ...snapshot.document, maps: [...maps], defaultMap } };
};

const storedAt = (revision: bigint): LoadedSpace[] =>
  SNAPSHOTS.map((snapshot) => ({ snapshot, revision, exportedRevision: null }));

const decideBoth = (next: SpaceSnapshot, storedRevision: bigint, expectedRevision: bigint) => {
  const stored = storedAt(storedRevision);
  const current = stored.find((space) => space.snapshot.id === next.id);
  const change = { kind: 'update' as const, spaceId: next.id, snapshot: next, expectedRevision };
  const request: SpaceCommit = { changes: [change] };
  return {
    fast: decideTopologyPreservingUpdate(change, current),
    aggregate: decideCommit(request, META, stored),
  };
};

describe('the SQL fast-path decision', () => {
  it('starts from an aggregate decideCommit accepts', () => {
    // A no-op update over the stored aggregate: if this failed, every
    // comparison below would be against a refusal.
    expect(
      decideCommit(
        { changes: [{ kind: 'update', spaceId: T, snapshot: target, expectedRevision: 0n }] },
        META,
        storedAt(0n),
      ).kind,
    ).toBe('write');
  });

  it('decides exactly what decideCommit decides, and hands every structural Edit to it', () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(
        fc.constantFrom(...SNAPSHOTS),
        fc.array(op, { minLength: 1, maxLength: 6 }),
        fc.bigInt({ min: 0n, max: 3n }),
        fc.boolean(),
        (subject, ops, revision, stale) => {
          const next = applyOps(subject, ops);
          const structural = !isDeepStrictEqual(
            selectable(subject.document),
            selectable(next.document),
          );
          const { fast, aggregate } = decideBoth(next, revision, stale ? revision + 1n : revision);

          seen.add(stale ? 'stale' : `${fast.kind}${structural ? ' structural' : ''}`);
          if (stale) {
            expect(fast.kind).toBe('answer');
          } else if (structural || !loadSpaceSnapshot(next).ok) {
            expect(fast.kind).toBe('aggregate-path');
          } else {
            expect(fast.kind).toBe('write');
          }
          if (fast.kind !== 'aggregate-path') {
            expect(aggregate.kind).toBe(fast.kind);
            expect(aggregate.result).toEqual(fast.result);
          }
        },
      ),
      { numRuns: 1000 },
    );
    // Every branch was reached, so the property is not vacuous.
    expect([...seen].sort()).toEqual([
      'aggregate-path',
      'aggregate-path structural',
      'stale',
      'write',
    ]);
  });

  it('writes a Map-internal Edit to the Space other Spaces select into', () => {
    const next = applyOps(target, [
      { kind: 'move', map: 0, resource: 2, x: 40, y: 80 },
      { kind: 'open', map: 0, resource: 0, width: 600, height: 400 },
      { kind: 'add-edge', map: 0, graph: 1, from: 2, to: 3 },
      { kind: 'retitle-graph', map: 1, graph: 0, title: 'Renamed' },
      { kind: 'activate-graph', map: 0, graph: 1 },
    ]);
    expect(selectable(next.document)).toEqual(selectable(target.document));
    const { fast, aggregate } = decideBoth(next, 0n, 0n);
    expect(fast).toEqual({
      kind: 'write',
      result: { kind: 'committed', revisions: [{ spaceId: T, revision: 1n }], deletedSpaceIds: [] },
    });
    expect(aggregate.kind).toBe('write');
  });

  it('hands deleting a Graph another Space selects to decideCommit, which refuses it', () => {
    const next = applyOps(target, [{ kind: 'remove-graph', map: 0, graph: 0 }]);
    const withActive: SpaceSnapshot = {
      ...next,
      document: {
        ...next.document,
        maps: (next.document.maps ?? []).map((map) =>
          map.id === T_MAP_1 ? { ...map, activeGraph: T_GRAPH_1B } : map,
        ),
      },
    };
    expect(loadSpaceSnapshot(withActive).ok).toBe(true);
    const { fast, aggregate } = decideBoth(withActive, 0n, 0n);
    expect(fast).toEqual({ kind: 'aggregate-path' });
    expect(aggregate).toMatchObject({
      kind: 'answer',
      result: {
        kind: 'aggregate-refused',
        errors: [
          { kind: 'space-resource-graph-missing', resourceId: META_LINK_TO_T, graphId: T_GRAPH_1A },
        ],
      },
    });
  });

  it('hands moving a Graph another Space selects to a different Map to decideCommit, which refuses it', () => {
    // The Graph ids stay the same; only which Map owns one changes.
    const next = applyOps(target, [{ kind: 'move-graph', map: 0, graph: 1, to: 1 }]);
    expect(loadSpaceSnapshot(next).ok).toBe(true);
    const { fast, aggregate } = decideBoth(next, 0n, 0n);
    expect(fast).toEqual({ kind: 'aggregate-path' });
    expect(aggregate).toMatchObject({
      kind: 'answer',
      result: {
        kind: 'aggregate-refused',
        errors: [
          {
            kind: 'space-resource-graph-outside-map',
            resourceId: S_LINK_TO_T,
            mapId: T_MAP_1,
            graphId: T_GRAPH_1B,
          },
        ],
      },
    });
  });
});
