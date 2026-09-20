import type { Story } from '@ladle/react';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { Application } from '#components/Application';
import { storyOpening, storySpaces } from '../support/application';

export default { title: 'Surfaces/Space Resource Embedded Map' };

const id = (suffix: string): UUID => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const HOME_ID = id('000000000001');
const HOME_MAP_ID = id('000000000002');
const HOME_GRAPH_ID = id('000000000003');
const HOME_RESOURCE_ID = id('000000000004');
const SPACE_RESOURCE_ID = id('000000000005');

const TARGET_ID = id('000000000010');
const TARGET_MAP_ID = id('000000000011');
const TARGET_GRAPH_ID = id('000000000012');
const INTAKE_ID = id('000000000013');
const STORAGE_ID = id('000000000014');

const TARGET_SECOND_MAP_ID = id('000000000015');
const TARGET_SECOND_GRAPH_ID = id('000000000016');
const REVIEW_ID = id('000000000017');

/**
 * The target Space, whose Map the Space Resource selects.
 *
 * Two Resources and the one Graph joining them, at the rects its own Map
 * authored — which is what the embedding draws, translated into the Space
 * Resource's rect and nothing else. Both fit inside the Resource's Open Size with the
 * `SPACE_RESOURCE_EMBED_INSET` reserved, so what is on screen is the whole Map
 * rather than the part that happened to fit.
 *
 * **Two Maps, sharing no Resource.** A Space Resource's Map choice can only be
 * shown to be honoured by choosing one that is not already chosen and finding
 * different content on screen — pressing the marked row proves the list renders
 * and nothing more. So `Collection 2` draws one Resource of its own, `Review`,
 * which `Collection 1` does not position; whichever Map the Resource selects,
 * what the embedding draws names it.
 */
const target: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    maps: [
      {
        id: TARGET_MAP_ID,
        title: 'Collection 1',
        kind: 'positioned',
        positions: {
          [INTAKE_ID]: { x: 0, y: 0, open: false },
          [STORAGE_ID]: { x: 300, y: 0, open: false },
        },
        graphs: [
          { id: TARGET_GRAPH_ID, title: 'Overview', edges: [{ from: INTAKE_ID, to: STORAGE_ID }] },
        ],
      },
      {
        id: TARGET_SECOND_MAP_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: {
          [REVIEW_ID]: { x: 0, y: 0, open: false },
        },
        graphs: [{ id: TARGET_SECOND_GRAPH_ID, title: 'Detail', edges: [] }],
      },
    ],
    defaultMap: TARGET_MAP_ID,
  },
  resources: [
    { id: INTAKE_ID, document: { title: 'Intake', kind: 'markdown', body: '' } },
    { id: STORAGE_ID, document: { title: 'Storage', kind: 'markdown', body: '' } },
    { id: REVIEW_ID, document: { title: 'Review', kind: 'markdown', body: '' } },
  ],
});

/**
 * The containing Space: one ordinary Markdown Resource, and one Space Resource its
 * Map has already Opened at a size with room for the target's Map.
 *
 * The Open state and the Open Size are the Map's own authoring (ADR 0064,
 * ADR 0066), so the story states them where the application stores them rather
 * than driving the gesture — Opening is proved by `Components/Resource` and by the
 * application's own Space Resource coverage, and what this story is about begins
 * once a Resource is Open. The selection is stored on the Resource, which is the
 * distinction the whole surface rests on: the Map drawn is the **Resource's**
 * and never the target Space's own current one.
 */
const home: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: HOME_ID,
  document: {
    version: 1,
    title: 'Home',
    maps: [
      {
        id: HOME_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [HOME_RESOURCE_ID]: { x: 0, y: 0, open: false },
          [SPACE_RESOURCE_ID]: {
            x: 340,
            y: 0,
            open: true,
            openSize: { width: 640, height: 420 },
          },
        },
        graphs: [
          {
            id: HOME_GRAPH_ID,
            title: 'Graph 1',
            edges: [{ from: HOME_RESOURCE_ID, to: SPACE_RESOURCE_ID }],
          },
        ],
      },
    ],
    defaultMap: HOME_MAP_ID,
  },
  resources: [
    { id: HOME_RESOURCE_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
    {
      id: SPACE_RESOURCE_ID,
      document: {
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        map: TARGET_MAP_ID,
        graph: TARGET_GRAPH_ID,
      },
    },
  ],
});

const openEmbeddedMap = async () => {
  const spaces = storySpaces(HOME_ID, [home, target]);
  return storyOpening(spaces, await spaces.open(HOME_ID));
};

/** The production application host over an isolated multi-Space repository. */
export const SelectedMap: Story = () => <Application resolve={openEmbeddedMap} />;
SelectedMap.meta = { iframed: true };

const PORTAL_FRAMING = { centreX: 80, centreY: 40, zoom: 1.4 };

const openEnteredFromSpaceResource = async () => {
  const spaces = storySpaces(HOME_ID, [home, target]);
  await spaces.open(HOME_ID);
  return storyOpening(
    spaces,
    await spaces.enter(TARGET_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, PORTAL_FRAMING),
  );
};

/**
 * Enter from a Space Resource: the target is the canvas, at the stored framing
 * and the browser's size, with Return naming the containing Space.
 */
export const EnteredFromSpaceResource: Story = () => (
  <Application resolve={openEnteredFromSpaceResource} />
);
EnteredFromSpaceResource.meta = { iframed: true };

const PAIR_HOME_ID = id('000000000020');
const PAIR_HOME_MAP_ID = id('000000000021');
const PAIR_HOME_GRAPH_ID = id('000000000022');
const PAIR_OVERVIEW_RESOURCE_ID = id('000000000023');
const PAIR_DETAIL_RESOURCE_ID = id('000000000024');

const PAIR_TARGET_ID = id('000000000030');
const PAIR_OVERVIEW_MAP_ID = id('000000000031');
const PAIR_OVERVIEW_GRAPH_ID = id('000000000032');
const PAIR_DETAIL_MAP_ID = id('000000000033');
const PAIR_DETAIL_GRAPH_ID = id('000000000034');
const PAIR_INTAKE_ID = id('000000000035');
const PAIR_STORAGE_ID = id('000000000036');
const PAIR_INDEX_ID = id('000000000037');

/**
 * One Space seen two ways: a target owning two Maps over overlapping Resources.
 *
 * `Overview` places Intake beside Storage; `Detail` places Storage beside Index
 * and leaves Intake out. So the two Maps disagree about *which* Resources are
 * on them, which is what makes a difference on screen attributable to the
 * selection rather than to styling (ADR 0040).
 */
const pairTarget: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: PAIR_TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    maps: [
      {
        id: PAIR_OVERVIEW_MAP_ID,
        title: 'Overview',
        kind: 'positioned',
        positions: {
          [PAIR_INTAKE_ID]: { x: 0, y: 0, open: false },
          [PAIR_STORAGE_ID]: { x: 220, y: 0, open: false },
        },
        graphs: [
          {
            id: PAIR_OVERVIEW_GRAPH_ID,
            title: 'Overview',
            edges: [{ from: PAIR_INTAKE_ID, to: PAIR_STORAGE_ID }],
          },
        ],
      },
      {
        id: PAIR_DETAIL_MAP_ID,
        title: 'Detail',
        kind: 'positioned',
        positions: {
          [PAIR_STORAGE_ID]: { x: 0, y: 0, open: false },
          [PAIR_INDEX_ID]: { x: 220, y: 0, open: false },
        },
        graphs: [
          {
            id: PAIR_DETAIL_GRAPH_ID,
            title: 'Detail',
            edges: [{ from: PAIR_STORAGE_ID, to: PAIR_INDEX_ID }],
          },
        ],
      },
    ],
    defaultMap: PAIR_OVERVIEW_MAP_ID,
  },
  resources: [
    { id: PAIR_INTAKE_ID, document: { title: 'Intake', kind: 'markdown', body: '' } },
    { id: PAIR_STORAGE_ID, document: { title: 'Storage', kind: 'markdown', body: '' } },
    { id: PAIR_INDEX_ID, document: { title: 'Index', kind: 'markdown', body: '' } },
  ],
});

/**
 * Two Space Resources, one target, two selections — the shape ADR 0068 makes the
 * only way to show a Space twice.
 *
 * Both Resources name `PAIR_TARGET_ID` and neither is a copy of the other; what
 * differs is the pair each stores, so the left draws Intake and Storage and the
 * right draws Storage and Index. Storage appears in both, which is the point:
 * convergence is on the Space, not on a duplicated Resource, and one Resource of the
 * target is genuinely on two embeddings at once.
 *
 * The second Resource selects `Detail` although the target opens on `Overview`,
 * which is what says the stored selection wins over the target's own
 * `defaultMap` (ADR 0079). Under the fallback this replaced, the same
 * document would have drawn `Overview` twice.
 */
const pairHome: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: PAIR_HOME_ID,
  document: {
    version: 1,
    title: 'Home',
    maps: [
      {
        id: PAIR_HOME_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [PAIR_OVERVIEW_RESOURCE_ID]: {
            x: 0,
            y: 0,
            open: true,
            openSize: { width: 460, height: 320 },
          },
          [PAIR_DETAIL_RESOURCE_ID]: {
            x: 500,
            y: 0,
            open: true,
            openSize: { width: 460, height: 320 },
          },
        },
        graphs: [{ id: PAIR_HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultMap: PAIR_HOME_MAP_ID,
  },
  resources: [
    {
      id: PAIR_OVERVIEW_RESOURCE_ID,
      document: {
        title: 'The overview',
        kind: 'space',
        spaceId: PAIR_TARGET_ID,
        map: PAIR_OVERVIEW_MAP_ID,
        graph: PAIR_OVERVIEW_GRAPH_ID,
      },
    },
    {
      id: PAIR_DETAIL_RESOURCE_ID,
      document: {
        title: 'The detail',
        kind: 'space',
        spaceId: PAIR_TARGET_ID,
        map: PAIR_DETAIL_MAP_ID,
        graph: PAIR_DETAIL_GRAPH_ID,
      },
    },
  ],
});

const openTwoSelections = async () => {
  const spaces = storySpaces(PAIR_HOME_ID, [pairHome, pairTarget]);
  return storyOpening(spaces, await spaces.open(PAIR_HOME_ID));
};

/** Two Space Resources on one target, each drawing the Map it stores. */
export const TwoSelectionsOfOneTarget: Story = () => <Application resolve={openTwoSelections} />;
TwoSelectionsOfOneTarget.meta = { iframed: true };
