import { describe, expect, it } from 'vitest';
import { uuidSchema, type ImageNaturalSize, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend, openSpaceSession, type ImageStoring } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { createImageResources, type ImageSources } from '../src/image-creation';
import { createOpenSpaces } from '../src/open-spaces';
import { recordingHistory } from './browser-history';
import { unusedImageSources } from './image-sources';
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
  const { authoring, navigation } = composeApp({
    images: unusedImageSources,
    spaceSession: session,
    newId: mintingIds(...ids),
  });
  return { session, authoring, navigation };
};

const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

/** The same Space with a second, empty Map the author can switch to. */
const twoMaps: SpaceSnapshot = {
  ...snapshot,
  document: {
    ...snapshot.document,
    maps: [
      ...(snapshot.document.maps ?? []),
      {
        id: OTHER_MAP_ID,
        title: 'Map 2',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Other', edges: [] }],
      },
    ],
  },
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
      { mapId: MAP_ID, anchor: AT, placement: 'exact' },
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
      { mapId: MAP_ID, anchor: AT, placement: 'exact' },
    );

    expect(created).toEqual({
      kind: 'not-stored',
      refusals: [{ code: 'image-format-unsupported', name: 'notes.txt' }],
    });
    expect(session.getState().working).toBe(before);
  });

  it('names every file the host refused, in the order they were dropped', async () => {
    const { session, authoring } = open(FIRST);
    const before = session.getState().working;
    const images = sources(
      {
        'notes.txt': { kind: 'refused', code: 'image-format-unsupported' },
        'diagram.png': { kind: 'stored', url: STORED_A },
        'huge.png': { kind: 'refused', code: 'image-too-large' },
      },
      {},
    );

    const created = await createImageResources(
      { images, authoring },
      { kind: 'files', files: [file('notes.txt'), file('diagram.png'), file('huge.png')] },
      { mapId: MAP_ID, anchor: AT, placement: 'exact' },
    );

    expect(created).toEqual({
      kind: 'not-stored',
      refusals: [
        { code: 'image-format-unsupported', name: 'notes.txt' },
        { code: 'image-too-large', name: 'huge.png' },
      ],
    });
    expect(session.getState().working).toBe(before);
  });

  it('sends nothing when the browser declares a file is not an image', async () => {
    const { session, authoring } = open(FIRST);
    const before = session.getState().working;
    const images = sources({ 'diagram.png': { kind: 'stored', url: STORED_A } }, {});

    const created = await createImageResources(
      { images, authoring },
      {
        kind: 'files',
        files: [file('diagram.png'), new File(['bytes'], 'notes.pdf', { type: 'application/pdf' })],
      },
      { mapId: MAP_ID, anchor: AT, placement: 'exact' },
    );

    expect(created).toEqual({
      kind: 'not-stored',
      refusals: [{ code: 'image-format-unsupported', name: 'notes.pdf' }],
    });
    expect(images.sent).toEqual([]);
    expect(session.getState().working).toBe(before);
  });

  it('names every file the browser declares is not an image, and sends none', async () => {
    const { session, authoring } = open(FIRST);
    const before = session.getState().working;
    const images = sources({ 'diagram.png': { kind: 'stored', url: STORED_A } }, {});

    const created = await createImageResources(
      { images, authoring },
      {
        kind: 'files',
        files: [
          new File(['bytes'], 'notes.pdf', { type: 'application/pdf' }),
          file('diagram.png'),
          new File(['<svg/>'], 'figure.svg', { type: 'image/svg+xml' }),
        ],
      },
      { mapId: MAP_ID, anchor: AT, placement: 'exact' },
    );

    expect(created).toEqual({
      kind: 'not-stored',
      refusals: [
        { code: 'image-format-unsupported', name: 'notes.pdf' },
        { code: 'image-svg-unsupported', name: 'figure.svg' },
      ],
    });
    expect(images.sent).toEqual([]);
    expect(session.getState().working).toBe(before);
  });

  it('names only the declared-type refusals when a drop also holds a file the host would refuse', async () => {
    const { session, authoring } = open(FIRST);
    const before = session.getState().working;
    const images = sources({ 'huge.png': { kind: 'refused', code: 'image-too-large' } }, {});

    const created = await createImageResources(
      { images, authoring },
      {
        kind: 'files',
        files: [file('huge.png'), new File(['bytes'], 'notes.pdf', { type: 'application/pdf' })],
      },
      { mapId: MAP_ID, anchor: AT, placement: 'exact' },
    );

    expect(created).toEqual({
      kind: 'not-stored',
      refusals: [{ code: 'image-format-unsupported', name: 'notes.pdf' }],
    });
    expect(images.sent).toEqual([]);
    expect(session.getState().working).toBe(before);
  });

  it('sends a file the browser declares no type for, and leaves it to the host', async () => {
    const { authoring } = open(FIRST);
    const images = sources({ picture: { kind: 'stored', url: STORED_A } }, {});

    const created = await createImageResources(
      { images, authoring },
      { kind: 'files', files: [new File(['bytes'], 'picture')] },
      { mapId: MAP_ID, anchor: AT, placement: 'exact' },
    );

    expect(created).toEqual({ kind: 'completed', createdResourceId: FIRST });
    expect(images.sent).toEqual(['picture']);
  });

  it('creates nothing for no files', async () => {
    const { session, authoring } = open(FIRST);
    const before = session.getState().working;
    const images = sources({}, {});

    await expect(
      createImageResources(
        { images, authoring },
        { kind: 'files', files: [] },
        { mapId: MAP_ID, anchor: AT, placement: 'exact' },
      ),
    ).resolves.toEqual({ kind: 'unchanged' });
    expect(images.sent).toEqual([]);
    expect(session.getState().working).toBe(before);
  });
});

describe('an Image Resource gesture the author moves away from', () => {
  it('lands on the Map the gesture was made on, and leaves the canvas where the author went', async () => {
    const loaded = { snapshot: twoMaps, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
    const { authoring, navigation } = composeApp({
      images: unusedImageSources,
      spaceSession: session,
      newId: mintingIds(FIRST),
    });
    const url = 'https://example.com/a.png';
    let measured: (size: ImageNaturalSize | undefined) => void = () => undefined;
    const images: ImageSources = {
      store: () => Promise.reject(new Error('A URL is not stored')),
      measure: () =>
        new Promise((resolve) => {
          measured = resolve;
        }),
    };

    const created = createImageResources(
      { images, authoring },
      { kind: 'url', url },
      { mapId: MAP_ID, anchor: AT, placement: 'exact' },
    );
    await Promise.resolve();
    navigation.selectMap(OTHER_MAP_ID);
    measured(undefined);

    await expect(created).resolves.toEqual({ kind: 'completed', createdResourceId: FIRST });
    const maps = session.getState().working.document.maps ?? [];
    expect(maps.find((m) => m.id === MAP_ID)?.positions[FIRST]).toMatchObject(AT);
    expect(maps.find((m) => m.id === OTHER_MAP_ID)?.positions[FIRST]).toBeUndefined();
    expect(navigation.getState().selectedMapId).toBe(OTHER_MAP_ID);
  });

  it('creates nothing when the Map the gesture was made on is gone', async () => {
    const spaces = createOpenSpaces({
      images: unusedImageSources,
      backend: new MemorySpaceBackend(SPACE_ID, [
        { snapshot: twoMaps, revision: 0n, exportedRevision: null },
      ]),
      metaSpaceId: SPACE_ID,
      metaSpaceTitle: twoMaps.document.title,
      newId: mintingIds(FIRST),
      history: recordingHistory(),
    });
    const { app, session, spaceResources } = await spaces.open(SPACE_ID);
    const { authoring, navigation } = app;
    const url = 'https://example.com/a.png';
    let measured: (size: ImageNaturalSize | undefined) => void = () => undefined;
    const images: ImageSources = {
      store: () => Promise.reject(new Error('A URL is not stored')),
      measure: () =>
        new Promise((resolve) => {
          measured = resolve;
        }),
    };

    const created = createImageResources(
      { images, authoring },
      { kind: 'url', url },
      { mapId: MAP_ID, anchor: AT, placement: 'exact' },
    );
    await Promise.resolve();
    navigation.selectMap(OTHER_MAP_ID);
    const deleted = await spaceResources.deleteMap({
      targetSpaceId: SPACE_ID,
      mapId: MAP_ID,
      preferredMapId: OTHER_MAP_ID,
    });
    expect(deleted.kind).toBe('completed');
    const before = session.getState().working;
    measured(undefined);

    await expect(created).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'map-not-found' },
    });
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
      { mapId: MAP_ID, anchor: AT, placement: 'exact' },
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
      { mapId: MAP_ID, anchor: AT, placement: 'exact' },
    );

    expect(session.getState().working.resources[1]?.document).toEqual({
      title: 'Resource 2',
      kind: 'image',
      url,
    });
  });
});
