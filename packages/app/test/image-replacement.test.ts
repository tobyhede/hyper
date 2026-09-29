import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type ImageNaturalSize, type SpaceSnapshot } from '@project/core';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  openSpaceSession,
  type ImageStoring,
} from '@project/persistence';
import { composeApp } from '../src/compose-app';
import type { ImageSources } from '../src/image-creation';
import { describeImageReplacement, replaceImage } from '../src/image-replacement';
import { mintingIds } from './minting';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const MARKDOWN = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const IMAGE = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const UNUSED = uuidSchema.parse('00000000-0000-4000-8000-000000000031');

const OLD_URL = 'https://example.com/old.png';
const NEW_URL = 'https://example.com/new.png';
const STORED = '/images/LXEWQrcmsEQBYnyp-6wy9chTD7GQPMTbAiWHF5IaSIE';

/** An Open Image Resource with a remembered Open Size and an Edge to a Markdown Resource. */
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
        positions: {
          [MARKDOWN]: { x: 0, y: 0, open: false },
          [IMAGE]: { x: 400, y: 0, open: true, openSize: { width: 500, height: 420 } },
        },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [{ from: MARKDOWN, to: IMAGE }] }],
        activeGraph: GRAPH_ID,
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    { id: MARKDOWN, document: { title: 'Notes', kind: 'markdown', body: '' } },
    {
      id: IMAGE,
      document: {
        title: 'Figure',
        kind: 'image',
        url: OLD_URL,
        naturalSize: { width: 400, height: 300 },
      },
    },
  ],
};

const open = () => {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const control = new MemorySpaceBackendTestControl();
  const session = openSpaceSession(MemorySpaceBackend.asMeta(loaded, control), loaded);
  const { authoring } = composeApp({ spaceSession: session, newId: mintingIds(UNUSED) });
  return { session, authoring, control };
};

/** Image sources answering from tables: a file's name decides storing, a URL measuring. */
const sources = (
  stored: Readonly<Record<string, ImageStoring>>,
  sizes: Readonly<Record<string, ImageNaturalSize>>,
): ImageSources & { readonly measured: string[] } => {
  const measured: string[] = [];
  return {
    measured,
    store: (image) => {
      const answer = stored[image instanceof File ? image.name : ''];
      return answer === undefined
        ? Promise.reject(new Error('No answer for this file'))
        : Promise.resolve(answer);
    },
    measure: (url) => {
      measured.push(url);
      return Promise.resolve(sizes[url]);
    },
  };
};

const file = (name: string): File => new File(['bytes'], name, { type: 'image/png' });

/** The Image Resource as the replacement is asked for it. */
const FIGURE = { resourceId: IMAGE, url: OLD_URL };

const imageOf = (state: SpaceSnapshot) =>
  state.resources.find((resource) => resource.id === IMAGE)?.document;

describe('replacing an Image Resource’s image', () => {
  it('refuses multiple dropped files before storing, measuring or editing', async () => {
    const { session, authoring } = open();
    const before = session.getState().working;
    const images = sources({}, {});
    const store = vi.spyOn(images, 'store');
    const result = await replaceImage({ images, authoring }, FIGURE, {
      kind: 'files',
      files: [file('first.png'), file('second.png')],
    });
    expect(describeImageReplacement(result)).toBe('Use one image at a time.');
    expect(store).not.toHaveBeenCalled();
    expect(images.measured).toEqual([]);
    expect(session.getState().working).toBe(before);
  });
  it.each(['storing', 'measuring'])(
    'discards a replacement still %s when the author accepts the stored Space',
    async (stage) => {
      const remote = {
        ...snapshot,
        resources: snapshot.resources.map((resource) =>
          resource.id === IMAGE
            ? {
                ...resource,
                document: { title: 'Remote figure', kind: 'image' as const, url: NEW_URL },
              }
            : resource,
        ),
      };
      const session = openSpaceSession(
        MemorySpaceBackend.asMeta({ snapshot: remote, revision: 1n, exportedRevision: null }),
        { snapshot, revision: 0n, exportedRevision: null },
      );
      const { authoring } = composeApp({ spaceSession: session });
      const waiting = Promise.withResolvers<undefined>();
      const images: ImageSources = {
        store: async () => {
          if (stage === 'storing') await waiting.promise;
          return { kind: 'stored', url: STORED };
        },
        measure: async () => {
          if (stage === 'measuring') await waiting.promise;
          return { width: 20, height: 30 };
        },
      };
      const pending = replaceImage({ images, authoring }, FIGURE, {
        kind: 'files',
        files: [file('figure.png')],
      });
      authoring.complete({ kind: 'renamed-graph', graphId: GRAPH_ID, title: 'Local graph' });
      await expect.poll(() => session.getState().persistence.kind).toBe('conflicted');
      expect(authoring.acceptStoredSpace()).toBeNull();
      const accepted = session.getState().working;
      waiting.resolve(undefined);

      await expect(pending).resolves.toEqual({ kind: 'discarded' });
      expect(session.getState().working).toBe(accepted);
      expect(imageOf(accepted)).toMatchObject({ url: NEW_URL, title: 'Remote figure' });
    },
  );

  it('changes the URL and the recorded natural size in one Edit, and nothing else', async () => {
    const { session, authoring } = open();
    const before = session.getState().working;
    const images = sources({}, { [NEW_URL]: { width: 640, height: 480 } });

    await expect(
      replaceImage({ images, authoring }, FIGURE, { kind: 'url', url: NEW_URL }),
    ).resolves.toEqual({ kind: 'completed' });

    const after = session.getState().working;
    expect(imageOf(after)).toEqual({
      title: 'Figure',
      kind: 'image',
      url: NEW_URL,
      naturalSize: { width: 640, height: 480 },
    });
    // Identity, placement, remembered Open Size, Edges and every other Resource are kept.
    expect(after.document).toEqual(before.document);
    expect(after.resources.map(({ id }) => id)).toEqual(before.resources.map(({ id }) => id));
    expect(after.resources[0]).toEqual(before.resources[0]);
  });

  it('records no natural size when the new picture does not load', async () => {
    const { session, authoring } = open();

    await replaceImage({ images: sources({}, {}), authoring }, FIGURE, {
      kind: 'url',
      url: NEW_URL,
    });

    expect(imageOf(session.getState().working)).toEqual({
      title: 'Figure',
      kind: 'image',
      url: NEW_URL,
    });
  });

  // V1 has no Undo command. What an Undo would reverse is one Edit, so this
  // proves the replacement is exactly one commit, made over the revision that
  // still holds the old URL.
  it('is one commit, made over the revision that holds the old URL', async () => {
    const { authoring, control } = open();

    await replaceImage({ images: sources({}, {}), authoring }, FIGURE, {
      kind: 'url',
      url: NEW_URL,
    });
    await expect.poll(() => control.attempts.length).toBe(1);

    const [attempt] = control.attempts;
    expect(attempt?.expectedRevision).toBe(0n);
    expect(imageOf(snapshot)).toMatchObject({ url: OLD_URL });
    expect(attempt === undefined ? undefined : imageOf(attempt.snapshot)).toMatchObject({
      url: NEW_URL,
    });
  });

  it('stores a chosen file and replaces the URL with the stored image’s', async () => {
    const { session, authoring } = open();
    const images = sources(
      { 'diagram.png': { kind: 'stored', url: STORED } },
      { [STORED]: { width: 3, height: 2 } },
    );

    await expect(
      replaceImage({ images, authoring }, FIGURE, { kind: 'files', files: [file('diagram.png')] }),
    ).resolves.toEqual({ kind: 'completed' });

    expect(imageOf(session.getState().working)).toEqual({
      title: 'Figure',
      kind: 'image',
      url: STORED,
      naturalSize: { width: 3, height: 2 },
    });
  });

  it('changes nothing when the host refuses the file, naming it', async () => {
    const { session, authoring } = open();
    const before = session.getState().working;
    const images = sources(
      { 'notes.txt': { kind: 'refused', code: 'image-format-unsupported' } },
      {},
    );

    await expect(
      replaceImage({ images, authoring }, FIGURE, { kind: 'files', files: [file('notes.txt')] }),
    ).resolves.toEqual({ kind: 'not-stored', code: 'image-format-unsupported', name: 'notes.txt' });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a file whose declared type is not an image without sending it', async () => {
    const { session, authoring } = open();
    const before = session.getState().working;
    // No stored answer: sending the file at all rejects.
    const images = sources({}, {});
    const notes = new File(['words'], 'notes.txt', { type: 'text/plain' });

    await expect(
      replaceImage({ images, authoring }, FIGURE, { kind: 'files', files: [notes] }),
    ).resolves.toEqual({ kind: 'not-stored', code: 'image-format-unsupported', name: 'notes.txt' });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a data: URL before loading it, and changes nothing', async () => {
    const { session, authoring } = open();
    const before = session.getState().working;
    const images = sources({}, {});

    await expect(
      replaceImage({ images, authoring }, FIGURE, {
        kind: 'url',
        url: 'data:image/png;base64,AAAA',
      }),
    ).resolves.toEqual({ kind: 'refused', refusal: { code: 'image-url-unsupported' } });
    expect(images.measured).toEqual([]);
    expect(session.getState().working).toBe(before);
  });

  it('answers unchanged for the URL the Resource already holds', async () => {
    const { session, authoring } = open();
    const before = session.getState().working;
    const images = sources({}, { [OLD_URL]: { width: 10, height: 10 } });

    await expect(
      replaceImage({ images, authoring }, FIGURE, { kind: 'url', url: ` ${OLD_URL} ` }),
    ).resolves.toEqual({ kind: 'unchanged' });
    expect(images.measured).toEqual([]);
    expect(session.getState().working).toBe(before);
  });
});

describe('the replaced-image completion', () => {
  it('uploading the current stored picture creates no Edit or commit', async () => {
    const { session, authoring, control } = open();
    authoring.complete({ kind: 'replaced-image', resourceId: IMAGE, url: STORED });
    await expect.poll(() => session.getState().persistence.kind).toBe('settled');
    const before = session.getState().working;
    const commits = control.attempts.length;
    const images = sources(
      { 'same.png': { kind: 'stored', url: STORED } },
      { [STORED]: { width: 40, height: 30 } },
    );
    await expect(
      replaceImage(
        { images, authoring },
        { resourceId: IMAGE, url: STORED },
        { kind: 'files', files: [file('same.png')] },
      ),
    ).resolves.toEqual({ kind: 'unchanged' });
    expect(session.getState().working).toBe(before);
    expect(control.attempts).toHaveLength(commits);
  });
  it('refuses a Resource that is not an Image Resource', () => {
    const { authoring } = open();

    expect(
      authoring.complete({ kind: 'replaced-image', resourceId: MARKDOWN, url: NEW_URL }),
    ).toEqual({ kind: 'refused', refusal: { code: 'resource-kind-immutable' } });
  });

  it('refuses a URL an Image Resource may not hold rather than throwing on intake', () => {
    const { session, authoring } = open();
    const before = session.getState().working;

    expect(
      authoring.complete({
        kind: 'replaced-image',
        resourceId: IMAGE,
        url: 'data:image/png;base64,AAAA',
      }),
    ).toEqual({ kind: 'refused', refusal: { code: 'image-url-unsupported' } });
    expect(session.getState().working).toBe(before);
  });

  it('answers unchanged for the same URL even with a different size', () => {
    const { authoring } = open();

    expect(
      authoring.complete({
        kind: 'replaced-image',
        resourceId: IMAGE,
        url: OLD_URL,
        naturalSize: { width: 1, height: 1 },
      }),
    ).toEqual({ kind: 'unchanged' });
  });
});

describe('what Replace image says', () => {
  it('says a refused URL and a refused file in the application’s words', () => {
    expect(
      describeImageReplacement({ kind: 'refused', refusal: { code: 'image-url-unsupported' } }),
    ).toBe('An image URL must start with https: or http:.');
    expect(
      describeImageReplacement({ kind: 'not-stored', code: 'image-too-large', name: 'huge.png' }),
    ).toBe('huge.png is larger than 10 MB, the largest image that can be stored.');
  });

  it('says nothing once the image is replaced or already held', () => {
    expect(describeImageReplacement({ kind: 'completed' })).toBeNull();
    expect(describeImageReplacement({ kind: 'unchanged' })).toBeNull();
  });
});
