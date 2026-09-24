import { describe, expect, it } from 'vitest';
import type { Resource } from '@project/core';
import { Placement } from '@project/graph';
import type { EntityActionGroup, EntityActionOutcome } from '@project/ui';
import { activeGraphOf } from '../src/dock-chrome';
import { mapView } from '../src/map-view';
import { nameOnCreationOf } from '../src/name-on-creation';
import { showsSpace } from '../src/open-spaces-context';
import { RESOURCE_HEIGHT, RESOURCE_WIDTH } from '../src/resource';
import { REFERENCE_OFFSET_RATIO, referenceAnchor } from '../src/resource-placement';
import { REFERENCE_TERMINAL, resourceRailGroups } from '../src/resource-rail-actions';
import { revealStep } from '../src/resources-disclosure';
import type { SpaceResourceTarget } from '../src/space-resource-lifecycle';
import { spaceTitlesById } from '../src/space-resource-targets';
import { anchorAt } from '../src/visible-centre';
import {
  EMPTY_GRAPH_ID,
  GRAPH_ID,
  MAP_ID,
  OTHER_MAP_ID,
  OUTSIDE,
  PLACED_A,
  PLACED_B,
  SPACE_ID,
  derivationSpace,
} from './app-derivation-fixtures';

/** The pure halves of the derivations `App` composes, in the node environment. */

const space = derivationSpace();
const resource = (id: typeof PLACED_A): Resource => {
  const found = space.lookup.resource(id);
  if (found === undefined) throw new Error(`No Resource ${id} in the fixture.`);
  return found;
};

describe('showsSpace', () => {
  it('answers true for an isolated mount, which has no open set', () => {
    expect(showsSpace(null, SPACE_ID)).toBe(true);
  });

  it('answers whether the open set shows this Space', () => {
    const state = { activeSpaceId: SPACE_ID, entries: [], openedFrom: new Map() };
    expect(showsSpace(state, SPACE_ID)).toBe(true);
    expect(showsSpace({ ...state, activeSpaceId: MAP_ID }, SPACE_ID)).toBe(false);
    expect(showsSpace({ ...state, activeSpaceId: null }, SPACE_ID)).toBe(false);
  });
});

describe('mapView', () => {
  it('derives the drawn Map, its members and what it leaves out', () => {
    const view = mapView(space, MAP_ID);

    expect(view.selectedMap.map.id).toBe(MAP_ID);
    expect(view.placedResources.map(({ id }) => id)).toEqual([PLACED_A, PLACED_B]);
    expect(view.resourcesOutsideMap.map(({ id }) => id)).toEqual([OUTSIDE]);
    expect(view.membershipsOutsideMap.get(OUTSIDE)?.map(({ mapId }) => mapId)).toEqual([
      OTHER_MAP_ID,
    ]);
    expect(view.projection.visibleGraphs.map(({ id }) => id)).toEqual([GRAPH_ID]);
    expect(view.mapPlacement).toEqual(Placement.fromMap(view.selectedMap.map));
  });

  it('reads whether any Resource on the Map is Open', () => {
    expect(mapView(space, MAP_ID).resourceIsOpen).toBe(true);
    expect(mapView(space, OTHER_MAP_ID).resourceIsOpen).toBe(false);
  });
});

describe('anchorAt', () => {
  it('lands at the origin before the canvas reports a centre', () => {
    expect(anchorAt(null)).toEqual({ x: 0, y: 0 });
  });

  it('reads the reported centre at the call', () => {
    let centre = { x: 1, y: 2 };
    const report = () => centre;
    expect(anchorAt(report)).toEqual({ x: 1, y: 2 });
    centre = { x: 3, y: 4 };
    expect(anchorAt(report)).toEqual({ x: 3, y: 4 });
  });
});

describe('referenceAnchor', () => {
  const centre = () => ({ x: -7, y: -9 });

  it('steps three quarters of a collapsed Resource from a Closed source', () => {
    expect(referenceAnchor({ x: 10, y: 20, open: false }, centre)).toEqual({
      x: 10 + Math.round(RESOURCE_WIDTH * REFERENCE_OFFSET_RATIO),
      y: 20 + Math.round(RESOURCE_HEIGHT * REFERENCE_OFFSET_RATIO),
    });
  });

  it('adds the room an Open source holds', () => {
    const openSize = { width: 600, height: 400 };
    const growth = Placement.growth(openSize);
    const anchor = referenceAnchor({ x: 0, y: 0, open: true, openSize }, centre);

    expect(anchor.x).toBe(
      Math.max(RESOURCE_WIDTH, growth.width + Math.round(RESOURCE_WIDTH * REFERENCE_OFFSET_RATIO)),
    );
    expect(anchor.y).toBe(
      Math.max(
        RESOURCE_HEIGHT,
        growth.height + Math.round(RESOURCE_HEIGHT * REFERENCE_OFFSET_RATIO),
      ),
    );
  });

  it('lands at the visible centre for a source the Map does not place', () => {
    expect(referenceAnchor(undefined, centre)).toEqual({ x: -7, y: -9 });
  });
});

describe('revealStep', () => {
  const outside = [resource(OUTSIDE)];

  it('reveals and discloses an address the Map leaves out', () => {
    expect(
      revealStep(null, {
        addressedResourceId: OUTSIDE,
        mapId: MAP_ID,
        resourcesOutsideMap: outside,
      }),
    ).toEqual({ revealed: { mapId: MAP_ID, resourceId: OUTSIDE }, disclose: OUTSIDE });
  });

  it('reveals without disclosing an address the Map places', () => {
    expect(
      revealStep(null, {
        addressedResourceId: PLACED_A,
        mapId: MAP_ID,
        resourcesOutsideMap: outside,
      }),
    ).toEqual({ revealed: { mapId: MAP_ID, resourceId: PLACED_A }, disclose: null });
  });

  it('changes nothing for the address already revealed on this Map', () => {
    expect(
      revealStep(
        { mapId: MAP_ID, resourceId: OUTSIDE },
        { addressedResourceId: OUTSIDE, mapId: MAP_ID, resourcesOutsideMap: [...outside] },
      ),
    ).toBeNull();
  });

  it('reveals the same Resource again on another Map', () => {
    expect(
      revealStep(
        { mapId: MAP_ID, resourceId: OUTSIDE },
        { addressedResourceId: OUTSIDE, mapId: OTHER_MAP_ID, resourcesOutsideMap: outside },
      ),
    ).toEqual({ revealed: { mapId: OTHER_MAP_ID, resourceId: OUTSIDE }, disclose: OUTSIDE });
  });

  it('forgets the revealed address once the location names no Resource', () => {
    const noAddress = { addressedResourceId: null, mapId: MAP_ID, resourcesOutsideMap: outside };
    expect(revealStep({ mapId: MAP_ID, resourceId: OUTSIDE }, noAddress)).toEqual({
      revealed: null,
      disclose: null,
    });
    expect(revealStep(null, noAddress)).toBeNull();
  });
});

describe('nameOnCreationOf', () => {
  it('names the Resource a pending rename continues at', () => {
    expect(
      nameOnCreationOf({
        target: { kind: 'resource', resourceId: PLACED_A },
        select: true,
        then: 'rename',
      }),
    ).toBe(PLACED_A);
  });

  it('names nothing for any other continuation', () => {
    expect(nameOnCreationOf(null)).toBeNull();
    expect(
      nameOnCreationOf({
        target: { kind: 'resource', resourceId: PLACED_A },
        select: false,
        then: 'reveal',
      }),
    ).toBeNull();
    expect(
      nameOnCreationOf({
        target: { kind: 'control', name: 'map-name' },
        select: false,
        then: 'rename',
      }),
    ).toBeNull();
  });
});

describe('activeGraphOf', () => {
  const graphs = mapView(space, MAP_ID).projection.visibleGraphs;

  it('names the Active Graph the Map shows', () => {
    expect(activeGraphOf(graphs, GRAPH_ID)?.id).toBe(GRAPH_ID);
  });

  it('names nothing rather than falling back to another Graph', () => {
    expect(activeGraphOf(graphs, EMPTY_GRAPH_ID)).toBeNull();
    expect(activeGraphOf(graphs, null)).toBeNull();
  });
});

describe('resourceRailGroups', () => {
  const addresses: readonly EntityActionGroup[] = [
    [{ id: 'copy-link', label: 'Copy link', onSelect: () => 'done' }],
  ];
  const everything = {
    createReference: (): EntityActionOutcome => 'done',
    removeFromMap: () => undefined,
    deleteFromSpace: () => undefined,
    enter: () => undefined,
  };
  const ids = (groups: readonly EntityActionGroup[]) =>
    groups.map((group) => group.map(({ id }) => id));

  it('leads with Create Reference and ends with the commands that leave the Resource', () => {
    expect(ids(resourceRailGroups(resource(PLACED_A), addresses, everything))).toEqual([
      ['create-reference'],
      ['copy-link'],
      ['remove-from-map', 'delete-resource'],
    ]);
  });

  it('draws only the addresses while nothing else is available', () => {
    expect(
      ids(
        resourceRailGroups(resource(PLACED_A), addresses, {
          createReference: null,
          removeFromMap: null,
          deleteFromSpace: null,
          enter: null,
        }),
      ),
    ).toEqual([['copy-link']]);
  });

  it('draws Create Reference unavailable on a Reference Resource', () => {
    const reference: Resource = {
      id: OUTSIDE,
      title: 'A reference',
      kind: 'reference',
      target: PLACED_A,
    };
    const row = resourceRailGroups(reference, addresses, everything)[0]?.[0];
    expect(row).toMatchObject({ id: 'create-reference', disabled: true });
    expect(row?.description).toBe(REFERENCE_TERMINAL);
  });
});

describe('spaceTitlesById', () => {
  it('reads each target Space by its Title', () => {
    const target: SpaceResourceTarget = { id: SPACE_ID, title: 'Elsewhere', maps: [] };
    expect(spaceTitlesById(new Map([[SPACE_ID, target]]))).toEqual(
      new Map([[SPACE_ID, 'Elsewhere']]),
    );
  });
});
