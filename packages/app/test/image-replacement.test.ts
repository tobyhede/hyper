import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type ImageNaturalSize, type SpaceSnapshot } from '@project/core';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  openSpaceSession,
  type ImageStoring,
  type ObserverErrorReporter,
} from '@project/persistence';
import { composeApp } from '../src/compose-app';
import type { ImageSources } from '../src/image-creation';
import * as imageReplacementModule from '../src/image-replacement';
import { describeImageReplacement } from '../src/image-replacement';
import { unusedImageSources } from './image-sources';
import { mintingIds } from './minting';
import { CANVAS } from '../src/space-authoring';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const MARKDOWN = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const IMAGE = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const UNUSED = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
const MISSING = uuidSchema.parse('00000000-0000-4000-8000-000000000032');

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
          [MARKDOWN]: { x: 0, y: 0, open: false, shape: 'rectangle' },
          [IMAGE]: {
            x: 400,
            y: 0,
            open: true,
            openSize: { width: 500, height: 420 },
            shape: 'rectangle',
          },
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

/**
 * One composed Space over a memory backend, with the image sources and the
 * diagnostic sink the test controls, and every busy state its observers were told.
 */
const open = (
  images: ImageSources,
  reportObserverError: ObserverErrorReporter = vi.fn(),
  opened: SpaceSnapshot = snapshot,
) => {
  const loaded = { snapshot: opened, revision: 0n, exportedRevision: null };
  const control = new MemorySpaceBackendTestControl();
  const session = openSpaceSession(MemorySpaceBackend.asMeta(loaded, control), loaded);
  const { authoring, imageReplacement } = composeApp({
    spaceSession: session,
    newId: mintingIds(UNUSED),
    images,
    reportObserverError,
  });
  const busy: boolean[] = [];
  imageReplacement.subscribe(() => busy.push(imageReplacement.getState()));
  return { session, authoring, control, imageReplacement, busy };
};

/** Image sources answering from tables: a file's name decides storing, a URL measuring. */
const sources = (
  stored: Readonly<Record<string, ImageStoring>>,
  sizes: Readonly<Record<string, ImageNaturalSize>>,
): ImageSources & { readonly sent: string[]; readonly measured: string[] } => {
  const sent: string[] = [];
  const measured: string[] = [];
  return {
    sent,
    measured,
    store: (image) => {
      const name = image instanceof File ? image.name : '';
      sent.push(name);
      const answer = stored[name];
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

/** Image sources whose storing and measuring each wait for the test to answer. */
const held = () => {
  const storing = Promise.withResolvers<ImageStoring>();
  const measuring = Promise.withResolvers<ImageNaturalSize | undefined>();
  const sent: string[] = [];
  const measured: string[] = [];
  const images: ImageSources = {
    store: (image) => {
      sent.push(image instanceof File ? image.name : '');
      return storing.promise;
    },
    measure: (url) => {
      measured.push(url);
      return measuring.promise;
    },
  };
  return { images, storing, measuring, sent, measured };
};

/**
 * The busy state an attempt that started image work leaves behind: held once,
 * released once, and released now.
 */
const expectHeldThenReleased = ({
  imageReplacement,
  busy,
}: Pick<ReturnType<typeof open>, 'imageReplacement' | 'busy'>) => {
  expect(busy).toEqual([true, false]);
  expect(imageReplacement.getState()).toBe(false);
};

/** A Space whose stored copy diverged from the session's, with its picture at `NEW_URL`. */
const remote: SpaceSnapshot = {
  ...snapshot,
  resources: snapshot.resources.map((resource) =>
    resource.id === IMAGE
      ? { ...resource, document: { title: 'Remote figure', kind: 'image' as const, url: NEW_URL } }
      : resource,
  ),
};

/**
 * One composed Space whose next local Edit conflicts with `remote`, so
 * accepting the stored Space advances the replacement epoch.
 */
const diverging = (images: ImageSources) => {
  const session = openSpaceSession(
    MemorySpaceBackend.asMeta({ snapshot: remote, revision: 1n, exportedRevision: null }),
    { snapshot, revision: 0n, exportedRevision: null },
  );
  const { authoring, imageReplacement } = composeApp({
    spaceSession: session,
    images,
    reportObserverError: vi.fn(),
  });
  const conflict = async () => {
    authoring.complete(CANVAS, { kind: 'renamed-graph', graphId: GRAPH_ID, title: 'Local graph' });
    await expect.poll(() => session.getState().persistence.kind).toBe('conflicted');
  };
  return { session, authoring, imageReplacement, conflict };
};

const file = (name: string): File => new File(['bytes'], name, { type: 'image/png' });

const imageOf = (state: SpaceSnapshot) =>
  state.resources.find((resource) => resource.id === IMAGE)?.document;

describe('one replacement at a time', () => {
  it('answers a second attempt while an upload is held, starting no image work and keeping the first busy', async () => {
    const stages = held();
    const { session, imageReplacement, busy } = open(stages.images);
    const before = session.getState().working;

    const first = imageReplacement.replace(IMAGE, { kind: 'files', files: [file('a.png')] });
    expect(imageReplacement.getState()).toBe(true);
    await expect(
      imageReplacement.replace(IMAGE, { kind: 'files', files: [file('b.png')] }),
    ).resolves.toEqual({ kind: 'already-replacing' });
    await expect(imageReplacement.replace(IMAGE, { kind: 'url', url: NEW_URL })).resolves.toEqual({
      kind: 'already-replacing',
    });

    expect(stages.sent).toEqual(['a.png']);
    expect(stages.measured).toEqual([]);
    expect(imageReplacement.getState()).toBe(true);
    expect(busy).toEqual([true]);
    expect(session.getState().working).toBe(before);

    stages.storing.resolve({ kind: 'stored', url: STORED });
    await vi.waitFor(() => expect(stages.measured).toEqual([STORED]));
    expect(imageReplacement.getState()).toBe(true);
    stages.measuring.resolve({ width: 3, height: 2 });

    await expect(first).resolves.toEqual({ kind: 'completed' });
    expect(busy).toEqual([true, false]);
    expect(imageOf(session.getState().working)).toEqual({
      title: 'Figure',
      kind: 'image',
      url: STORED,
      naturalSize: { width: 3, height: 2 },
    });
  });

  it('answers a second attempt while a measurement is held, and only the first releases', async () => {
    const stages = held();
    const { session, imageReplacement, busy } = open(stages.images);

    const first = imageReplacement.replace(IMAGE, { kind: 'url', url: NEW_URL });
    await vi.waitFor(() => expect(stages.measured).toEqual([NEW_URL]));
    await expect(
      imageReplacement.replace(IMAGE, { kind: 'url', url: 'https://example.com/other.png' }),
    ).resolves.toEqual({ kind: 'already-replacing' });
    expect(stages.measured).toEqual([NEW_URL]);
    expect(imageReplacement.getState()).toBe(true);
    expect(imageOf(session.getState().working)).toMatchObject({ url: OLD_URL });

    stages.measuring.resolve(undefined);
    await expect(first).resolves.toEqual({ kind: 'completed' });
    expect(busy).toEqual([true, false]);

    // Released, the next attempt runs.
    stages.measured.length = 0;
    const next = imageReplacement.replace(IMAGE, { kind: 'url', url: 'https://example.com/b.png' });
    expect(imageReplacement.getState()).toBe(true);
    await expect(next).resolves.toEqual({ kind: 'completed' });
    expect(imageReplacement.getState()).toBe(false);
  });

  it('is busy through applying the Edit and released without waiting for the save', async () => {
    const { session, control, imageReplacement, authoring } = open(sources({}, {}));
    const releaseCommit = control.deferNextCommit();
    const busyWhenApplied: boolean[] = [];
    authoring.subscribe(() => {
      const image = imageOf(authoring.getState().session.working);
      if (image?.kind === 'image' && image.url === NEW_URL) {
        busyWhenApplied.push(imageReplacement.getState());
      }
    });

    await expect(imageReplacement.replace(IMAGE, { kind: 'url', url: NEW_URL })).resolves.toEqual({
      kind: 'completed',
    });

    expect(busyWhenApplied[0]).toBe(true);
    expect(imageReplacement.getState()).toBe(false);
    expect(session.getState().persistence.kind).toBe('pending');
    expect(imageOf(session.getState().working)).toMatchObject({ url: NEW_URL });
    releaseCommit();
    await expect.poll(() => session.getState().persistence.kind).toBe('settled');
  });
});

describe('replacing an Image Resource’s image', () => {
  it('changes the URL and the recorded natural size in one Edit, and nothing else', async () => {
    const { session, imageReplacement } = open(
      sources({}, { [NEW_URL]: { width: 640, height: 480 } }),
    );
    const before = session.getState().working;

    await expect(
      imageReplacement.replace(IMAGE, { kind: 'url', url: ` ${NEW_URL} ` }),
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
    const { session, imageReplacement } = open(sources({}, {}));

    await imageReplacement.replace(IMAGE, { kind: 'url', url: NEW_URL });

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
    const { control, imageReplacement } = open(sources({}, {}));

    await imageReplacement.replace(IMAGE, { kind: 'url', url: NEW_URL });
    await expect.poll(() => control.attempts.length).toBe(1);

    const [attempt] = control.attempts;
    expect(attempt?.expectedRevision).toBe(0n);
    expect(attempt === undefined ? undefined : imageOf(attempt.snapshot)).toMatchObject({
      url: NEW_URL,
    });
  });

  it('stores a chosen file and replaces the URL with the stored image’s', async () => {
    const images = sources(
      { 'diagram.png': { kind: 'stored', url: STORED } },
      { [STORED]: { width: 3, height: 2 } },
    );
    const { session, imageReplacement, busy } = open(images);

    await expect(
      imageReplacement.replace(IMAGE, { kind: 'files', files: [file('diagram.png')] }),
    ).resolves.toEqual({ kind: 'completed' });

    expect(imageOf(session.getState().working)).toEqual({
      title: 'Figure',
      kind: 'image',
      url: STORED,
      naturalSize: { width: 3, height: 2 },
    });
    expect(busy).toEqual([true, false]);
  });

  it('reads the Resource as it stands when asked, not as it stood when the caller saw it', async () => {
    const { session, authoring, imageReplacement } = open(sources({}, {}));
    authoring.complete(CANVAS, { kind: 'replaced-image', resourceId: IMAGE, url: NEW_URL });
    const before = session.getState().working;

    await expect(imageReplacement.replace(IMAGE, { kind: 'url', url: NEW_URL })).resolves.toEqual({
      kind: 'unchanged',
    });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a Resource the Space does not hold as an Image Resource', async () => {
    const images = sources({}, {});
    const { session, imageReplacement, busy } = open(images);
    const before = session.getState().working;

    for (const resourceId of [MISSING, MARKDOWN]) {
      await expect(
        imageReplacement.replace(resourceId, { kind: 'url', url: NEW_URL }),
      ).resolves.toEqual({ kind: 'refused', refusal: { code: 'resource-not-found' } });
    }
    expect(images.measured).toEqual([]);
    expect(session.getState().working).toBe(before);
    expect(imageReplacement.getState()).toBe(false);
    // No image work started, so no busy state was published either.
    expect(busy).toEqual([]);
  });
});

describe('what a replacement refuses', () => {
  it('refuses multiple files before storing, measuring or editing', async () => {
    const images = sources({}, {});
    const { session, imageReplacement, busy } = open(images);
    const before = session.getState().working;

    const result = await imageReplacement.replace(IMAGE, {
      kind: 'files',
      files: [file('first.png'), file('second.png')],
    });

    expect(result).toEqual({ kind: 'file-count-refused' });
    expect(describeImageReplacement(result)).toBe('Use one image at a time.');
    expect(images.sent).toEqual([]);
    expect(images.measured).toEqual([]);
    expect(session.getState().working).toBe(before);
    expectHeldThenReleased({ imageReplacement, busy });
  });

  it('changes nothing when the host refuses the file, naming it', async () => {
    const { session, imageReplacement, busy } = open(
      sources({ 'notes.txt': { kind: 'refused', code: 'image-format-unsupported' } }, {}),
    );
    const before = session.getState().working;

    await expect(
      imageReplacement.replace(IMAGE, { kind: 'files', files: [file('notes.txt')] }),
    ).resolves.toEqual({
      kind: 'not-stored',
      refusals: [{ code: 'image-format-unsupported', name: 'notes.txt' }],
    });
    expect(session.getState().working).toBe(before);
    expectHeldThenReleased({ imageReplacement, busy });
  });

  it('refuses a file whose declared type is not an image without sending it', async () => {
    const images = sources({}, {});
    const { session, imageReplacement, busy } = open(images);
    const before = session.getState().working;
    const notes = new File(['words'], 'notes.txt', { type: 'text/plain' });

    await expect(
      imageReplacement.replace(IMAGE, { kind: 'files', files: [notes] }),
    ).resolves.toEqual({
      kind: 'not-stored',
      refusals: [{ code: 'image-format-unsupported', name: 'notes.txt' }],
    });
    expect(images.sent).toEqual([]);
    expect(session.getState().working).toBe(before);
    expectHeldThenReleased({ imageReplacement, busy });
  });

  it('refuses a data: URL before loading it, and changes nothing', async () => {
    const images = sources({}, {});
    const { session, imageReplacement, busy } = open(images);
    const before = session.getState().working;

    await expect(
      imageReplacement.replace(IMAGE, { kind: 'url', url: 'data:image/png;base64,AAAA' }),
    ).resolves.toEqual({ kind: 'refused', refusal: { code: 'image-url-unsupported' } });
    expect(images.measured).toEqual([]);
    expect(session.getState().working).toBe(before);
    expectHeldThenReleased({ imageReplacement, busy });
  });

  it('answers unchanged for the URL the Resource already holds, trimmed, without loading it', async () => {
    const images = sources({}, { [OLD_URL]: { width: 10, height: 10 } });
    const { session, control, imageReplacement, busy } = open(images);
    const before = session.getState().working;

    await expect(
      imageReplacement.replace(IMAGE, { kind: 'url', url: ` ${OLD_URL} ` }),
    ).resolves.toEqual({ kind: 'unchanged' });
    expect(images.measured).toEqual([]);
    expect(session.getState().working).toBe(before);
    expect(control.attempts).toHaveLength(0);
    expectHeldThenReleased({ imageReplacement, busy });
  });

  it('makes no Edit or commit when an upload stores the picture already held', async () => {
    const images = sources(
      { 'same.png': { kind: 'stored', url: STORED } },
      { [STORED]: { width: 40, height: 30 } },
    );
    const { session, authoring, control, imageReplacement } = open(images);
    authoring.complete(CANVAS, { kind: 'replaced-image', resourceId: IMAGE, url: STORED });
    await expect.poll(() => session.getState().persistence.kind).toBe('settled');
    const before = session.getState().working;
    const commits = control.attempts.length;

    await expect(
      imageReplacement.replace(IMAGE, { kind: 'files', files: [file('same.png')] }),
    ).resolves.toEqual({ kind: 'unchanged' });
    expect(session.getState().working).toBe(before);
    expect(control.attempts).toHaveLength(commits);
  });
});

describe('a replacement that breaks', () => {
  it.each([
    ['storing', { kind: 'files', files: [file('figure.png')] }],
    ['measuring', { kind: 'url', url: NEW_URL }],
  ] as const)(
    'reports a rejection while %s, answers it typed, and releases',
    async (stage, replacement) => {
      const failure = new Error(`${stage} failed`);
      const images: ImageSources = {
        store: () => Promise.reject(failure),
        measure: () => Promise.reject(failure),
      };
      const report = vi.fn();
      const { session, imageReplacement, busy } = open(images, report);
      const before = session.getState().working;

      const result = await imageReplacement.replace(IMAGE, replacement);

      expect(result).toEqual({ kind: 'broken', failure });
      expect(describeImageReplacement(result)).toBe(`This image was not replaced: ${stage} failed`);
      expect(report).toHaveBeenCalledWith(failure);
      expect(session.getState().working).toBe(before);
      expectHeldThenReleased({ imageReplacement, busy });
    },
  );

  it('contains a diagnostic sink that throws, still answering and releasing', async () => {
    const failure = new Error('Nothing is stored in this test');
    const report = vi.fn(() => {
      throw new Error('Broken diagnostic sink');
    });
    const { imageReplacement } = open(
      { store: () => Promise.reject(failure), measure: () => Promise.resolve(undefined) },
      report,
    );

    await expect(
      imageReplacement.replace(IMAGE, { kind: 'files', files: [file('figure.png')] }),
    ).resolves.toEqual({ kind: 'broken', failure });
    expect(report).toHaveBeenCalledWith(failure);
    expect(imageReplacement.getState()).toBe(false);
  });
});

describe('a replacement whose Space was replaced', () => {
  it.each(['storing', 'measuring'] as const)(
    'discards a replacement still %s when the author accepts the stored Space',
    async (stage) => {
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
      const { session, authoring, imageReplacement, conflict } = diverging(images);
      const pending = imageReplacement.replace(IMAGE, {
        kind: 'files',
        files: [file('figure.png')],
      });
      await conflict();
      expect(authoring.acceptStoredSpace()).toBeNull();
      const accepted = session.getState().working;
      waiting.resolve(undefined);

      await expect(pending).resolves.toEqual({ kind: 'discarded' });
      expect(session.getState().working).toBe(accepted);
      expect(imageOf(accepted)).toMatchObject({ url: NEW_URL, title: 'Remote figure' });
      expect(imageReplacement.getState()).toBe(false);
    },
  );

  it('discards a replacement whose Space is replaced while its busy state is published', async () => {
    const { session, authoring, imageReplacement, conflict } = diverging(
      sources({}, { 'https://example.com/b.png': { width: 20, height: 30 } }),
    );
    await conflict();
    const unsubscribe = imageReplacement.subscribe(() => {
      if (imageReplacement.getState()) {
        unsubscribe();
        expect(authoring.acceptStoredSpace()).toBeNull();
      }
    });

    await expect(
      imageReplacement.replace(IMAGE, { kind: 'url', url: 'https://example.com/b.png' }),
    ).resolves.toEqual({ kind: 'discarded' });
    expect(imageOf(session.getState().working)).toMatchObject({
      url: NEW_URL,
      title: 'Remote figure',
    });
    expect(imageReplacement.getState()).toBe(false);
  });
});

describe('the replacement module', () => {
  it('offers no way to replace an image outside the owned attempt', () => {
    expect(Object.keys(imageReplacementModule).sort()).toEqual([
      'createImageReplacements',
      'describeImageReplacement',
    ]);
    const { imageReplacement } = open(unusedImageSources);
    expect(Object.keys(imageReplacement).sort()).toEqual(['getState', 'replace', 'subscribe']);
  });

  it('is composed once per Space, so one Space’s replacement holds no other', async () => {
    const stages = held();
    const first = open(stages.images);
    const second = open(unusedImageSources);

    void first.imageReplacement.replace(IMAGE, { kind: 'url', url: NEW_URL });

    expect(first.imageReplacement.getState()).toBe(true);
    expect(second.imageReplacement.getState()).toBe(false);
    stages.measuring.resolve(undefined);
    await vi.waitFor(() => expect(first.imageReplacement.getState()).toBe(false));
  });
});

describe('the replaced-image completion', () => {
  it('refuses a Resource that is not an Image Resource', () => {
    const { authoring } = open(unusedImageSources);

    expect(
      authoring.complete(CANVAS, { kind: 'replaced-image', resourceId: MARKDOWN, url: NEW_URL }),
    ).toEqual({ kind: 'refused', refusal: { code: 'resource-kind-immutable' } });
  });

  it('refuses a URL an Image Resource may not hold rather than throwing on intake', () => {
    const { session, authoring } = open(unusedImageSources);
    const before = session.getState().working;

    expect(
      authoring.complete(CANVAS, {
        kind: 'replaced-image',
        resourceId: IMAGE,
        url: 'data:image/png;base64,AAAA',
      }),
    ).toEqual({ kind: 'refused', refusal: { code: 'image-url-unsupported' } });
    expect(session.getState().working).toBe(before);
  });

  it('answers unchanged for the same URL even with a different size', () => {
    const { authoring } = open(unusedImageSources);

    expect(
      authoring.complete(CANVAS, {
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
      describeImageReplacement({
        kind: 'not-stored',
        refusals: [{ code: 'image-too-large', name: 'huge.png' }],
      }),
    ).toBe('huge.png is larger than 10 MB, the largest image that can be stored.');
  });

  it('says another replacement is running, and what broke', () => {
    expect(describeImageReplacement({ kind: 'already-replacing' })).toBe(
      'Another image is still being replaced.',
    );
    expect(describeImageReplacement({ kind: 'broken', failure: new Error('Offline') })).toBe(
      'This image was not replaced: Offline',
    );
  });

  it('says nothing once the image is replaced or already held', () => {
    expect(describeImageReplacement({ kind: 'completed' })).toBeNull();
    expect(describeImageReplacement({ kind: 'unchanged' })).toBeNull();
    expect(describeImageReplacement({ kind: 'discarded' })).toBeNull();
  });
});
