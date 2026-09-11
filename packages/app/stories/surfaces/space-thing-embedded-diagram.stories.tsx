import type { Story } from '@ladle/react';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { Application } from '#components/Application';
import { storyOpening, storySpaces } from '../support/application';

export default { title: 'Surfaces/Space Thing Embedded Diagram' };

const id = (suffix: string): UUID => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const HOME_ID = id('000000000001');
const HOME_DIAGRAM_ID = id('000000000002');
const HOME_GRAPH_ID = id('000000000003');
const HOME_THING_ID = id('000000000004');
const SPACE_THING_ID = id('000000000005');

const TARGET_ID = id('000000000010');
const TARGET_DIAGRAM_ID = id('000000000011');
const TARGET_GRAPH_ID = id('000000000012');
const INTAKE_ID = id('000000000013');
const STORAGE_ID = id('000000000014');

const TARGET_SECOND_DIAGRAM_ID = id('000000000015');
const TARGET_SECOND_GRAPH_ID = id('000000000016');
const REVIEW_ID = id('000000000017');

/**
 * The target Space, whose Diagram the Space Thing selects.
 *
 * Two Things and the one Graph joining them, at the rects its own Diagram
 * authored — which is what the embedding draws, translated into the Space
 * Thing's rect and nothing else. Both fit inside the Thing's Open Size with the
 * `SPACE_THING_EMBED_INSET` reserved, so what is on screen is the whole Diagram
 * rather than the part that happened to fit.
 *
 * **Two Diagrams, sharing no Thing.** A Space Thing's Diagram choice can only be
 * shown to be honoured by choosing one that is not already chosen and finding
 * different content on screen — pressing the marked row proves the list renders
 * and nothing more. So `Collection 2` draws one Thing of its own, `Review`,
 * which `Collection 1` does not position; whichever Diagram the Thing selects,
 * what the embedding draws names it.
 */
const target: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    diagrams: [
      {
        id: TARGET_DIAGRAM_ID,
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
        id: TARGET_SECOND_DIAGRAM_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: {
          [REVIEW_ID]: { x: 0, y: 0, open: false },
        },
        graphs: [{ id: TARGET_SECOND_GRAPH_ID, title: 'Detail', edges: [] }],
      },
    ],
    defaultDiagram: TARGET_DIAGRAM_ID,
  },
  things: [
    { id: INTAKE_ID, document: { title: 'Intake', kind: 'markdown', body: '' } },
    { id: STORAGE_ID, document: { title: 'Storage', kind: 'markdown', body: '' } },
    { id: REVIEW_ID, document: { title: 'Review', kind: 'markdown', body: '' } },
  ],
});

/**
 * The containing Space: one ordinary Markdown Thing, and one Space Thing its
 * Diagram has already Opened at a size with room for the target's Diagram.
 *
 * The Open state and the Open Size are the Diagram's own authoring (ADR 0064,
 * ADR 0066), so the story states them where the application stores them rather
 * than driving the gesture — Opening is proved by `Components/Thing` and by the
 * application's own Space Thing coverage, and what this story is about begins
 * once a Thing is Open. The selection is stored on the Thing, which is the
 * distinction the whole surface rests on: the Diagram drawn is the **Thing's**
 * and never the target Space's own current one.
 */
const home: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: HOME_ID,
  document: {
    version: 1,
    title: 'Home',
    diagrams: [
      {
        id: HOME_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [HOME_THING_ID]: { x: 0, y: 0, open: false },
          [SPACE_THING_ID]: {
            x: 340,
            y: 0,
            open: true,
            openSize: { width: 640, height: 420 },
          },
        },
        graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultDiagram: HOME_DIAGRAM_ID,
  },
  things: [
    { id: HOME_THING_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
    {
      id: SPACE_THING_ID,
      document: {
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: TARGET_DIAGRAM_ID,
        graph: TARGET_GRAPH_ID,
      },
    },
  ],
});

const openEmbeddedDiagram = async () => {
  const spaces = storySpaces(HOME_ID, [home, target]);
  return storyOpening(spaces, await spaces.open(HOME_ID));
};

/** The production application host over an isolated multi-Space repository. */
export const SelectedDiagram: Story = () => <Application resolve={openEmbeddedDiagram} />;
SelectedDiagram.meta = { iframed: true };

const PAIR_HOME_ID = id('000000000020');
const PAIR_HOME_DIAGRAM_ID = id('000000000021');
const PAIR_HOME_GRAPH_ID = id('000000000022');
const PAIR_OVERVIEW_THING_ID = id('000000000023');
const PAIR_DETAIL_THING_ID = id('000000000024');

const PAIR_TARGET_ID = id('000000000030');
const PAIR_OVERVIEW_DIAGRAM_ID = id('000000000031');
const PAIR_OVERVIEW_GRAPH_ID = id('000000000032');
const PAIR_DETAIL_DIAGRAM_ID = id('000000000033');
const PAIR_DETAIL_GRAPH_ID = id('000000000034');
const PAIR_INTAKE_ID = id('000000000035');
const PAIR_STORAGE_ID = id('000000000036');
const PAIR_INDEX_ID = id('000000000037');

/**
 * One Space seen two ways: a target owning two Diagrams over overlapping Things.
 *
 * `Overview` places Intake beside Storage; `Detail` places Storage beside Index
 * and leaves Intake out. So the two Diagrams disagree about *which* Things are
 * on them, which is what makes a difference on screen attributable to the
 * selection rather than to styling (ADR 0040).
 */
const pairTarget: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: PAIR_TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    diagrams: [
      {
        id: PAIR_OVERVIEW_DIAGRAM_ID,
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
        id: PAIR_DETAIL_DIAGRAM_ID,
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
    defaultDiagram: PAIR_OVERVIEW_DIAGRAM_ID,
  },
  things: [
    { id: PAIR_INTAKE_ID, document: { title: 'Intake', kind: 'markdown', body: '' } },
    { id: PAIR_STORAGE_ID, document: { title: 'Storage', kind: 'markdown', body: '' } },
    { id: PAIR_INDEX_ID, document: { title: 'Index', kind: 'markdown', body: '' } },
  ],
});

/**
 * Two Space Things, one target, two selections — the shape ADR 0068 makes the
 * only way to show a Space twice.
 *
 * Both Things name `PAIR_TARGET_ID` and neither is a copy of the other; what
 * differs is the pair each stores, so the left draws Intake and Storage and the
 * right draws Storage and Index. Storage appears in both, which is the point:
 * convergence is on the Space, not on a duplicated Thing, and one Thing of the
 * target is genuinely on two embeddings at once.
 *
 * The second Thing selects `Detail` although the target opens on `Overview`,
 * which is what says the stored selection wins over the target's own
 * `defaultDiagram` (ADR 0079). Under the fallback this replaced, the same
 * document would have drawn `Overview` twice.
 */
const pairHome: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: PAIR_HOME_ID,
  document: {
    version: 1,
    title: 'Home',
    diagrams: [
      {
        id: PAIR_HOME_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [PAIR_OVERVIEW_THING_ID]: {
            x: 0,
            y: 0,
            open: true,
            openSize: { width: 460, height: 320 },
          },
          [PAIR_DETAIL_THING_ID]: {
            x: 500,
            y: 0,
            open: true,
            openSize: { width: 460, height: 320 },
          },
        },
        graphs: [{ id: PAIR_HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultDiagram: PAIR_HOME_DIAGRAM_ID,
  },
  things: [
    {
      id: PAIR_OVERVIEW_THING_ID,
      document: {
        title: 'The overview',
        kind: 'space',
        spaceId: PAIR_TARGET_ID,
        diagram: PAIR_OVERVIEW_DIAGRAM_ID,
        graph: PAIR_OVERVIEW_GRAPH_ID,
      },
    },
    {
      id: PAIR_DETAIL_THING_ID,
      document: {
        title: 'The detail',
        kind: 'space',
        spaceId: PAIR_TARGET_ID,
        diagram: PAIR_DETAIL_DIAGRAM_ID,
        graph: PAIR_DETAIL_GRAPH_ID,
      },
    },
  ],
});

const openTwoSelections = async () => {
  const spaces = storySpaces(PAIR_HOME_ID, [pairHome, pairTarget]);
  return storyOpening(spaces, await spaces.open(PAIR_HOME_ID));
};

/** Two Space Things on one target, each drawing the Diagram it stores. */
export const TwoSelectionsOfOneTarget: Story = () => <Application resolve={openTwoSelections} />;
TwoSelectionsOfOneTarget.meta = { iframed: true };
