import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { graphColorsByGraphId, loadSpace } from '@project/graph';
import { describeMembership, otherMapMemberships, membershipsOf } from '../src/map-memberships';
import { resourceFile } from './resource-files';

const id = (suffix: string) => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const EVERYWHERE = id('000000000002');
const ELSEWHERE = id('000000000003');
const UNPLACED = id('000000000004');
const OFF_GRAPH = id('000000000005');

const SELECTED = id('000000000010');
const OVERVIEW = id('000000000020');
const DEEP_DIVE = id('000000000030');

const loaded = loadSpace(
  {
    version: 1,
    id: id('000000000001'),
    title: 'Space',
    defaultMap: SELECTED,
    maps: [
      {
        id: SELECTED,
        title: 'Selected',
        kind: 'positioned',
        positions: { [EVERYWHERE]: { x: 0, y: 0, open: false } },
        graphs: [
          {
            id: id('000000000011'),
            title: 'Here',
            edges: [{ from: EVERYWHERE, to: EVERYWHERE }],
          },
        ],
      },
      {
        id: OVERVIEW,
        title: 'Overview',
        kind: 'positioned',
        positions: {
          [EVERYWHERE]: { x: 0, y: 0, open: false },
          [ELSEWHERE]: { x: 300, y: 0, open: false },
        },
        graphs: [
          { id: id('000000000021'), title: 'Main', edges: [{ from: EVERYWHERE, to: ELSEWHERE }] },
          {
            id: id('000000000022'),
            title: 'Security',
            color: '#d62728',
            edges: [{ from: ELSEWHERE, to: EVERYWHERE }],
          },
        ],
      },
      {
        id: DEEP_DIVE,
        title: 'Deep dive',
        kind: 'positioned',
        positions: {
          [EVERYWHERE]: { x: 0, y: 0, open: false },
          [OFF_GRAPH]: { x: 300, y: 0, open: false },
        },
        graphs: [{ id: id('000000000031'), title: 'Walkthrough', edges: [] }],
      },
    ],
  },
  [
    resourceFile(EVERYWHERE),
    resourceFile(ELSEWHERE),
    resourceFile(UNPLACED),
    resourceFile(OFF_GRAPH),
  ],
);
if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
const memberships = otherMapMemberships(loaded.space, SELECTED);

describe('otherMapMemberships', () => {
  it('names every other Map that places a Resource, in declared Map order, and never the selected one', () => {
    expect(membershipsOf(memberships, EVERYWHERE).map((each) => each.mapTitle)).toEqual([
      'Overview',
      'Deep dive',
    ]);
  });

  it("keeps each Graph inside the Map that owns it, with the colour the canvas draws — authored, or the canvas's own fallback", () => {
    const [overview] = membershipsOf(memberships, ELSEWHERE);
    expect(overview?.graphs).toEqual([
      {
        id: id('000000000021'),
        title: 'Main',
        color: graphColorsByGraphId(loaded.space)[id('000000000021')],
      },
      { id: id('000000000022'), title: 'Security', color: '#d62728' },
    ]);
  });

  it('reports a Map that places the Resource on none of its Graphs', () => {
    expect(membershipsOf(memberships, OFF_GRAPH)).toEqual([
      { mapId: DEEP_DIVE, mapTitle: 'Deep dive', graphs: [] },
    ]);
  });

  it('answers nothing for a Resource no other Map places', () => {
    expect(memberships.has(UNPLACED)).toBe(false);
    expect(membershipsOf(memberships, UNPLACED)).toEqual([]);
  });
});

describe('describeMembership', () => {
  it('reads as the Map followed by its Graphs', () => {
    expect(membershipsOf(memberships, EVERYWHERE).map(describeMembership)).toEqual([
      'Overview: Main, Security',
      'Deep dive: on no Graph',
    ]);
  });
});
