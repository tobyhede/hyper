import { useEffect, useState } from 'react';
import type { Story } from '@ladle/react';
import {
  newUuid,
  spaceSnapshotSchema,
  uuidSchema,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { productDestinationPath } from '@project/http';
import { StatusFailure } from '@project/ui';
import { createOpenSpaces, type OpenSpace } from '#src/open-spaces';
import { OpenSpacesApplication } from '#components/OpenSpacesApplication';

export default { title: 'Surfaces/Space Card Embedded Layout' };

const id = (suffix: string): UUID => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const HOME_ID = id('000000000001');
const HOME_LAYOUT_ID = id('000000000002');
const HOME_GRAPH_ID = id('000000000003');
const HOME_CARD_ID = id('000000000004');
const SPACE_CARD_ID = id('000000000005');

const TARGET_ID = id('000000000010');
const TARGET_LAYOUT_ID = id('000000000011');
const TARGET_GRAPH_ID = id('000000000012');
const INTAKE_ID = id('000000000013');
const STORAGE_ID = id('000000000014');

/**
 * The target Space, whose Layout the Space Card selects.
 *
 * Two Cards and the one Graph joining them, at the rects its own Layout
 * authored — which is what the embedding draws, translated into the Space
 * Card's rect and nothing else. Both fit inside the Card's Open Size with the
 * `SPACE_CARD_EMBED_INSET` reserved, so what is on screen is the whole Layout
 * rather than the part that happened to fit.
 */
const target: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    layouts: [
      {
        id: TARGET_LAYOUT_ID,
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
    defaultLayout: TARGET_LAYOUT_ID,
  },
  cards: [
    { id: INTAKE_ID, document: { title: 'Intake', kind: 'markdown', body: '' } },
    { id: STORAGE_ID, document: { title: 'Storage', kind: 'markdown', body: '' } },
  ],
});

/**
 * The containing Space: one ordinary Markdown Card, and one Space Card its
 * Layout has already Opened at a size with room for the target's Layout.
 *
 * The Open state and the Open Size are the Layout's own authoring (ADR 0064,
 * ADR 0066), so the story states them where the application stores them rather
 * than driving the gesture — Opening is proved by `Components/Card` and by the
 * application's own Space Card coverage, and what this story is about begins
 * once a Card is Open. The selection is stored on the Card, which is the
 * distinction the whole surface rests on: the Layout drawn is the **Card's**
 * and never the target Space's own current one.
 */
const home: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: HOME_ID,
  document: {
    version: 1,
    title: 'Home',
    layouts: [
      {
        id: HOME_LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: {
          [HOME_CARD_ID]: { x: 0, y: 0, open: false },
          [SPACE_CARD_ID]: {
            x: 340,
            y: 0,
            open: true,
            openSize: { width: 640, height: 420 },
          },
        },
        graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultLayout: HOME_LAYOUT_ID,
  },
  cards: [
    { id: HOME_CARD_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
    {
      id: SPACE_CARD_ID,
      document: {
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        layout: TARGET_LAYOUT_ID,
        graph: TARGET_GRAPH_ID,
      },
    },
  ],
});

function EmbeddedLayoutCanvas() {
  const [spaces] = useState(() => {
    const backend = new MemorySpaceBackend(
      HOME_ID,
      [home, target].map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    );
    const location = { pathname: productDestinationPath({ kind: 'space', spaceId: HOME_ID }) };
    return createOpenSpaces({
      backend,
      metaSpaceId: HOME_ID,
      newId: newUuid,
      history: {
        pathname: () => location.pathname,
        href: () => `https://example.test${location.pathname}`,
        push: (pathname) => {
          location.pathname = pathname;
        },
        replace: (pathname) => {
          location.pathname = pathname;
        },
        onPopState: () => () => undefined,
      },
    });
  });
  const [initial, setInitial] = useState<OpenSpace | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    const lifetime = { mounted: true };
    void (async () => {
      try {
        const opened = await spaces.open(HOME_ID);
        if (lifetime.mounted) setInitial(opened);
      } catch (error) {
        if (lifetime.mounted) setFailure(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      lifetime.mounted = false;
    };
  }, [spaces]);
  if (failure !== null)
    return (
      <StatusFailure title="Space could not be opened" detailLabel="Details" detail={failure} />
    );
  return initial === null ? null : <OpenSpacesApplication spaces={spaces} initial={initial} />;
}

/** The production multi-Space composition, including editing and persistence recovery. */
export const SelectedLayout: Story = () => <EmbeddedLayoutCanvas />;
SelectedLayout.meta = { iframed: true };
