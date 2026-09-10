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

/**
 * The target Space, whose Diagram the Space Thing selects.
 *
 * Two Things and the one Graph joining them, at the rects its own Diagram
 * authored — which is what the embedding draws, translated into the Space
 * Thing's rect and nothing else. Both fit inside the Thing's Open Size with the
 * `SPACE_THING_EMBED_INSET` reserved, so what is on screen is the whole Diagram
 * rather than the part that happened to fit.
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
    ],
    defaultDiagram: TARGET_DIAGRAM_ID,
  },
  things: [
    { id: INTAKE_ID, document: { title: 'Intake', kind: 'markdown', body: '' } },
    { id: STORAGE_ID, document: { title: 'Storage', kind: 'markdown', body: '' } },
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
