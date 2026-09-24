import { describe, expect, it } from 'vitest';
import { uuidSchema, type MapId } from '@project/core';
import { loadSpace } from '@project/graph';
import {
  mapResources,
  MapNotFoundError,
  requireDefaultMap,
  resolveMap,
  resourcesOutsideMap,
} from '../src/map-resolution';
import { resourceFile } from './resource-files';

const PLACED = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const ALSO_PLACED = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const OMITTED = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const MISSING = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

const load = (defaultMap: MapId | undefined) =>
  loadSpace(
    {
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Space',
      defaultMap,
      maps: [
        {
          id: MAP,
          title: 'Map 1',
          kind: 'positioned',
          // Declared out of the Space's Resource order on purpose: the derivation
          // answers in `space.resources` order, and a Placement that agreed with
          // that order could not tell the two apart.
          positions: {
            [ALSO_PLACED]: { x: 40, y: 50, open: false },
            [PLACED]: { x: 12, y: 24, open: false },
          },
          graphs: [{ id: GRAPH, title: 'Graph 1', edges: [] }],
          activeGraph: GRAPH,
        },
      ],
    },
    [resourceFile(PLACED), resourceFile(ALSO_PLACED), resourceFile(OMITTED)],
  );

const loaded = load(MAP);
if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
const space = loaded.space;

const mapless = load(undefined);
if (!mapless.ok) throw new Error(JSON.stringify(mapless.errors));

describe('requireDefaultMap', () => {
  it('answers the durable opening selection', () => {
    expect(requireDefaultMap(space)).toBe(MAP);
  });

  it('throws on a Space with no default Map', () => {
    expect(() => requireDefaultMap(mapless.space)).toThrow(MapNotFoundError);
  });
});

describe('resolveMap', () => {
  it('answers the default Map when no id is named', () => {
    expect(resolveMap(space).map.id).toBe(MAP);
  });

  it('answers the Map an id names', () => {
    expect(resolveMap(space, MAP).map.id).toBe(MAP);
  });

  it('throws on an id that names no Map', () => {
    expect(() => resolveMap(space, MISSING)).toThrow(MapNotFoundError);
  });
});

describe('mapResources', () => {
  /**
   * Membership and ordering in one assertion, because they are one guarantee:
   * the Resources a Map places, as the Space's own objects, in the Space's Resource
   * order. No higher seam states the ordering, and the canvas reads it.
   */
  it("answers the Space's own placed Resources in the Space's Resource order", () => {
    const resources = mapResources(space, resolveMap(space).map);

    expect(resources.map(({ id }) => id)).toEqual([PLACED, ALSO_PLACED]);
    expect(resources[0]).toBe(space.lookup.resource(PLACED));
    expect(resources[1]).toBe(space.lookup.resource(ALSO_PLACED));
  });
});

describe('resourcesOutsideMap', () => {
  it("answers the Space's own Resources the Map does not place, and no others", () => {
    const map = resolveMap(space).map;
    const outside = resourcesOutsideMap(space, map);

    expect(outside.map(({ id }) => id)).toEqual([OMITTED]);
    expect(outside[0]).toBe(space.lookup.resource(OMITTED));
    expect([...mapResources(space, map), ...outside].map(({ id }) => id).sort()).toEqual(
      space.resources.map(({ id }) => id).sort(),
    );
  });
});
