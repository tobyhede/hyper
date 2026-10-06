import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import type { SpaceSession } from '@project/persistence';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { Application } from '#components/Application';
import type { ImageSources } from '#src/image-creation';
import { storyOpening, storySpaces } from './application';
import {
  authoredSnapshot,
  commandDockSnapshot,
  deepDiveSnapshot,
  designSystemSnapshot,
  metaSnapshot,
  platformSnapshot,
  spaceResourceDocument,
  traversalSnapshot,
} from './spaces';

const REPLACE_ID_BASE = 0x9a0;

const replaceId = (offset: number): UUID =>
  uuidSchema.parse(
    `00000000-0000-4000-8000-${(REPLACE_ID_BASE + offset).toString(16).padStart(12, '0')}`,
  );

const PICTURES_MAP = replaceId(0);
const PICTURES_GRAPH = replaceId(1);
const FIGURE = replaceId(2);
const MISSING = replaceId(3);
const PICTURES_REFERENCE = replaceId(4);
const THUMBNAIL = replaceId(5);

/** The Figure's picture, which the catalogue test serves. */
export const REPLACE_FIGURE_URL = 'https://example.com/figure.png';
/** A picture under a name that never resolves, so the Open Resource draws its failed state. */
export const REPLACE_MISSING_URL = 'https://missing.invalid/picture.png';
/** The URL the catalogue's image store answers every chosen file with. */
export const REPLACE_STORED_URL = '/images/LXEWQrcmsEQBYnyp-6wy9chTD7GQPMTbAiWHF5IaSIE';

/** A small picture's URL, on a Resource at the Closed Size, the smallest any Resource is. */
export const REPLACE_THUMBNAIL_URL = 'https://example.com/thumbnail.png';

/**
 * Two Closed Image Resources at the Closed Size, one of whose pictures is small,
 * and an Open, resized one whose picture will not load.
 */
export const picturesSnapshot: SpaceSnapshot = {
  id: replaceId(0xf),
  document: {
    version: 1,
    title: 'Pictures',
    defaultMap: PICTURES_MAP,
    maps: [
      {
        id: PICTURES_MAP,
        title: 'Pictures',
        kind: 'positioned',
        positions: {
          [FIGURE]: { x: 0, y: 0, open: false },
          [MISSING]: { x: 360, y: 0, open: true, size: { width: 460, height: 380 } },
          [THUMBNAIL]: { x: 900, y: 0, open: false },
        },
        graphs: [{ id: PICTURES_GRAPH, title: 'Main', edges: [] }],
        activeGraph: PICTURES_GRAPH,
      },
    ],
  },
  resources: [
    {
      id: FIGURE,
      document: {
        title: 'Figure',
        kind: 'image',
        url: REPLACE_FIGURE_URL,
        naturalSize: { width: 400, height: 300 },
      },
    },
    { id: MISSING, document: { title: 'Missing', kind: 'image', url: REPLACE_MISSING_URL } },
    {
      id: THUMBNAIL,
      document: {
        title: 'Thumbnail',
        kind: 'image',
        url: REPLACE_THUMBNAIL_URL,
        naturalSize: { width: 64, height: 64 },
      },
    },
  ],
};

/**
 * The catalogue has no host, so its image store answers one stored URL for
 * any file and measures nothing: what Replace does with an answer is
 * production's.
 */
const replaceImages: ImageSources = {
  store: async () => {
    // A bounded host delay lets the catalogue exercise pending upload controls.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { kind: 'stored', url: REPLACE_STORED_URL };
  },
  measure: () => Promise.resolve(undefined),
};

/** Open the Pictures Space through the real session owner. */
async function openReplaceImageStory() {
  const meta = {
    ...metaSnapshot,
    resources: [
      ...metaSnapshot.resources,
      {
        id: PICTURES_REFERENCE,
        document: spaceResourceDocument('Pictures', picturesSnapshot),
      },
    ],
  };
  const spaces = storySpaces(
    meta.id,
    [
      meta,
      platformSnapshot,
      designSystemSnapshot,
      commandDockSnapshot,
      authoredSnapshot,
      traversalSnapshot,
      deepDiveSnapshot,
      picturesSnapshot,
    ],
    undefined,
    replaceImages,
  );
  return storyOpening(spaces, await spaces.open(picturesSnapshot.id));
}

/** Read-only evidence from the production session, outside the application surface. */
function RevisionEvidence({ session }: { readonly session: SpaceSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const figure = state.working.resources.find((resource) => resource.id === FIGURE)?.document;
  return (
    <output
      hidden
      data-testid="replacement-revision"
      data-persistence={state.persistence.kind}
      data-url={figure?.kind === 'image' ? figure.url : undefined}
    >
      {state.acknowledgedRevision.toString()}
    </output>
  );
}

/** Fixture setup and observation only; Application owns startup, commands and rendering. */
export function ReplaceImageFixture() {
  const [session, setSession] = useState<SpaceSession | null>(null);
  const resolve = useCallback(async () => {
    const opening = await openReplaceImageStory();
    setSession(opening.opened.session);
    return opening;
  }, []);
  return (
    <>
      <Application resolve={resolve} />
      {session !== null && <RevisionEvidence session={session} />}
    </>
  );
}
