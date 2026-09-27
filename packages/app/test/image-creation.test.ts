import { describe, expect, it } from 'vitest';
import { uuidSchema, type ImageNaturalSize, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend, openSpaceSession, type ImageStoring } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { createImageResources, type ImageSources } from '../src/image-creation';
import { mintingIds } from './minting';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const FIRST = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
const SECOND = uuidSchema.parse('00000000-0000-4000-8000-000000000032');

const STORED_A = '/images/LXEWQrcmsEQBYnyp-6wy9chTD7GQPMTbAiWHF5IaSIE';
const STORED_B = '/images/KJx3oXmDEwnD1FBZUrDl_2u5HAtMb2ip2ose1tOMXmQ';

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: { [RESOURCE_A]: { x: 0, y: 0, open: false } },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [{ id: RESOURCE_A, document: { title: 'Resource 1', kind: 'markdown', body: '' } }],
};

const open = (...ids: Parameters<typeof mintingIds>) => {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
  const { authoring } = composeApp({ spaceSession: session, newId: mintingIds(...ids) });
  return { session, authoring };
};

/**
 * Image sources that answer from tables rather than a network or a browser: a
 * file's name decides what storing it answers, and a URL's what measuring it does.
 */
const sources = (
  stored: Readonly<Record<string, ImageStoring>>,
  sizes: Readonly<Record<string, ImageNaturalSize>>,
): ImageSources & { readonly sent: string[] } => {
  const sent: string[] = [];
  return {
    sent,
    store: (image) => {
      const name = image instanceof File ? image.name : '';
      sent.push(name);
      const answer = stored[name];
      return answer === undefined
        ? Promise.reject(new Error(`No answer for ${name}`))
        : Promise.resolve(answer);
    },
    measure: (url) => Promise.resolve(sizes[url]),
  };
};

const file = (name: string): File => new File(['bytes'], name, { type: 'image/png' });
const AT = { x: 100, y: 200 };

describe('creating Image Resources from files', () => {
  it('stores each file, measures it, and creates one Resource per file in one Edit', async () => {
    const { session, authoring } = open(FIRST, SECOND);
    const images = sources(
      {
        'diagram.png': { kind: 'stored', url: STORED_A },
        'photo.png': { kind: 'stored', url: STORED_B },
      },
      { [STORED_A]: { width: 640, height: 480 } },
    );

    const created = await createImageResources(
      { images, authoring },
      { kind: 'files', files: [file('diagram.png'), file('photo.png')] },
      AT,
      'exact',
    );

    expect(created).toEqual({ kind: 'completed', createdResourceId: FIRST });
    expect(session.getState().working.resources.slice(1)).toEqual([
      {
        id: FIRST,
        document: {
          title: 'Resource 2',
          kind: 'image',
          url: STORED_A,
          naturalSize: { width: 640, height: 480 },
        },
      },
      { id: SECOND, document: { title: 'Resource 3', kind: 'image', url: STORED_B } },
    ]);
  });

  it('creates nothing when any file is refused, and names the file and the code', async () => {
    const { session, authoring } = open(FIRST);
    const before = session.getState().working;
    const images = sources(
      {
        'diagram.png': { kind: 'stored', url: STORED_A },
        'notes.txt': { kind: 'refused', code: 'image-format-unsupported' },
      },
      {},
    );

    const created = await createImageResources(
      { images, authoring },
      { kind: 'files', files: [file('diagram.png'), file('notes.txt')] },
      AT,
      'exact',
    );

    expect(created).toEqual({
      kind: 'not-stored',
      code: 'image-format-unsupported',
      name: 'notes.txt',
    });
    expect(session.getState().working).toBe(before);
  });

  it('creates nothing for no files', async () => {
    const { session, authoring } = open(FIRST);
    const before = session.getState().working;
    const images = sources({}, {});

    await expect(
      createImageResources({ images, authoring }, { kind: 'files', files: [] }, AT, 'exact'),
    ).resolves.toEqual({ kind: 'unchanged' });
    expect(images.sent).toEqual([]);
    expect(session.getState().working).toBe(before);
  });
});

describe('creating an Image Resource from a URL', () => {
  it('creates one holding the URL, with the size it measured', async () => {
    const { session, authoring } = open(FIRST);
    const url = 'https://example.com/a.png';

    await createImageResources(
      { images: sources({}, { [url]: { width: 32, height: 16 } }), authoring },
      { kind: 'url', url },
      AT,
      'exact',
    );

    expect(session.getState().working.resources[1]?.document).toEqual({
      title: 'Resource 2',
      kind: 'image',
      url,
      naturalSize: { width: 32, height: 16 },
    });
  });

  it('creates one with no size when the picture does not load', async () => {
    const { session, authoring } = open(FIRST);
    const url = 'https://unreachable.invalid/a.png';

    await createImageResources(
      { images: sources({}, {}), authoring },
      { kind: 'url', url },
      AT,
      'exact',
    );

    expect(session.getState().working.resources[1]?.document).toEqual({
      title: 'Resource 2',
      kind: 'image',
      url,
    });
  });
});
