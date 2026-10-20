import { act, waitFor } from '@testing-library/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { uuidSchema, type UUID } from '@project/core';
import { productDestinationPath } from '@project/http';
import { mountAggregate } from '../src/mount/mount';
import { createMountedStartup } from '../src/mount/mounted-startup';
import { startApplication, type ApplicationStartupResult } from '../src/startup';
import { recordingHistory } from './browser-history';
import { fixtureFiles } from './fixture-files';
import { refusingFullscreen } from './fullscreen';
import { unlinkedPresentations } from './presentations';
import { stubResizeObserver } from './resize-observer';

const META_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
const DEEP_DIVE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000070');
const IMAGE_ID = 'fZoCiTSlSs9w9S87nrFeaOkPdKB4wvFrbWfaMn23ZOs';

/** The fixture names every identity it holds, so mounting it mints none. */
const mintsNothing = (): UUID => {
  throw new Error('The fixture names every identity, so mounting it mints none.');
};

/** Object URLs as a page would hand them out, recording the picture each was made over. */
const recordingObjectUrls = () => {
  const made: Blob[] = [];
  return {
    made,
    createObjectUrl: (image: Blob): string => {
      made.push(image);
      return `blob:https://mounted.test/${made.length}`;
    },
  };
};

const mountedStartup = (
  files: ReadonlyMap<string, Uint8Array>,
  history = recordingHistory(),
  objectUrls = recordingObjectUrls(),
) =>
  createMountedStartup({
    name: 'fixture',
    files,
    newId: mintsNothing,
    createObjectUrl: objectUrls.createObjectUrl,
    fullscreen: refusingFullscreen,
    presentations: unlinkedPresentations,
    history,
  });

const opened = (result: ApplicationStartupResult) => {
  if (result.kind !== 'opened') throw new Error('The address opens a Space.');
  return result.opened;
};

const roots: Root[] = [];

/** Render what startup resolves into a fresh root, as the application does. */
const render = async (resolve: () => Promise<ApplicationStartupResult>): Promise<HTMLElement> => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(() => startApplication({ render: (children) => root.render(children) }, resolve));
  return container;
};

/** A picture's bytes, read as the page reads a Blob: jsdom's has no `arrayBuffer`. */
const bytesOf = (picture: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result));
      else reject(new Error('The picture did not read as bytes.'));
    };
    reader.onerror = () => reject(new Error('The picture did not read.'));
    reader.readAsArrayBuffer(picture);
  });

beforeAll(() => {
  vi.stubGlobal('scrollTo', () => undefined);
  stubResizeObserver();
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

afterAll(() => vi.unstubAllGlobals());

describe('mounting an aggregate in the page', () => {
  it('opens the Meta Space with its Resources at the root, and moves the address to it', async () => {
    const history = recordingHistory('/');
    const startup = mountedStartup(fixtureFiles(), history);

    const space = opened(await startup.resolve('/')).app.currentSpace();

    expect(space.id).toBe(META_SPACE_ID);
    expect(space.title).toBe('Map fixture');
    expect(space.resources.map(({ title }) => title)).toEqual(
      expect.arrayContaining(['A', 'B', 'C', 'D', 'E']),
    );
    expect(history.pathname()).toBe(
      productDestinationPath({ kind: 'space', spaceId: META_SPACE_ID }),
    );
  });

  it('shows the reader’s diagnostics for a directory that is not an aggregate', async () => {
    const files = fixtureFiles();
    files.delete('hyper.json');

    const container = await render(() => mountedStartup(files).resolve('/'));

    expect(container).toHaveTextContent('Application could not start');
    expect(container).toHaveTextContent('fixture is not an Aggregate directory:');
    expect(container).toHaveTextContent(
      'fixture/hyper.json: a canonical aggregate directory must contain hyper.json',
    );
  });

  it('shows Import’s diagnostics for an aggregate that is refused', async () => {
    const files = fixtureFiles();
    const missing = '00000000-0000-4000-8000-0000000000ff';
    files.set(
      'hyper.json',
      new TextEncoder().encode(JSON.stringify({ version: 1, metaSpaceId: missing })),
    );

    const container = await render(() => mountedStartup(files).resolve('/'));

    expect(container).toHaveTextContent('Aggregate validation failed:');
    expect(container).toHaveTextContent(
      `The aggregate names Meta Space ${missing}, which it does not contain`,
    );
  });

  it('refuses every write and stores nothing', async () => {
    const mounted = await mountAggregate({
      name: 'fixture',
      files: fixtureFiles(),
      newId: mintsNothing,
      createObjectUrl: recordingObjectUrls().createObjectUrl,
    });
    if (!mounted.ok) throw new Error('The fixture mounts.');
    const { backend } = mounted.mounted;
    const before = await backend.loadSpace(META_SPACE_ID);
    if (before === undefined) throw new Error('The Meta Space is mounted.');

    const renamed = {
      ...before.snapshot,
      document: { ...before.snapshot.document, title: 'Renamed' },
    };
    await expect(
      backend.commit({
        changes: [
          {
            kind: 'update',
            spaceId: META_SPACE_ID,
            snapshot: renamed,
            expectedRevision: before.revision,
          },
        ],
      }),
    ).resolves.toEqual({ kind: 'permanent-failure', code: 'forbidden' });
    await expect(backend.storeImage(new Blob([new Uint8Array([0x89, 0x50])]))).rejects.toThrow(
      'HTTP 403',
    );

    const after = await backend.loadSpace(META_SPACE_ID);
    expect(after?.revision).toBe(before.revision);
    expect(after?.snapshot.document.title).toBe('Map fixture');
  });

  it('draws a stored image from an object URL over the mounted bytes', async () => {
    const files = fixtureFiles();
    const objectUrls = recordingObjectUrls();
    const startup = mountedStartup(files, recordingHistory(), objectUrls);

    const container = await render(() =>
      startup.resolve(productDestinationPath({ kind: 'space', spaceId: DEEP_DIVE_ID })),
    );

    await waitFor(() =>
      expect(container.querySelector('img[alt="Harbour"]')).toHaveAttribute(
        'src',
        'blob:https://mounted.test/1',
      ),
    );
    const [picture] = objectUrls.made;
    expect(picture?.type).toBe('image/png');
    expect(await bytesOf(picture ?? new Blob())).toEqual(files.get(`images/${IMAGE_ID}.png`));
  });
});
