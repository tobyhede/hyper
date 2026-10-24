import { Blob as NodeBlob } from 'node:buffer';
import { act, waitFor, within } from '@testing-library/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mapSource } from '@project/aggregate';
import { uuidSchema, type UUID } from '@project/core';
import { productDestinationPath } from '@project/http';
import { parseGitHubLocation, type GitHubLocation } from '../src/mount/github-location';
import { mountAggregate } from '../src/mount/mount';
import { createMountedStartup } from '../src/mount/mounted-startup';
import { startApplication, type ApplicationStartupResult } from '../src/startup';
import { ORIGIN, recordingHistory, type RecordingHistory } from './browser-history';
import { COMMIT, fakeGitHub, OWNER, REPO, type FakeGitHub } from './fake-github';
import { fixtureFiles } from './fixture-files';
import { refusingFullscreen } from './fullscreen';
import { unlinkedPresentations } from './presentations';
import { stubResizeObserver } from './resize-observer';

const META_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
const DEEP_DIVE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000070');
const MISSING_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000ff');
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

const PINNED = `github:${OWNER}/${REPO}@${COMMIT}`;
const META_PATH = productDestinationPath({ kind: 'space', spaceId: META_SPACE_ID });
const MISSING_MAP_PATH = productDestinationPath({
  kind: 'map',
  spaceId: META_SPACE_ID,
  mapId: uuidSchema.parse('00000000-0000-4000-8000-0000000000ff'),
});

const location = (input: string): GitHubLocation => {
  const parsed = parseGitHubLocation(input);
  if (!parsed.ok) throw new Error(parsed.failure.reason);
  return parsed.location;
};

interface MountedStartupSeams {
  readonly history?: RecordingHistory;
  readonly objectUrls?: ReturnType<typeof recordingObjectUrls>;
  /** The location the page mounts, as `resolveMountSource` answered it. */
  readonly source?: string;
  readonly github?: FakeGitHub;
  /** Every scope the mounted session's presentation links were built for. */
  readonly scopes?: string[];
}

/** A mounted startup over a fake GitHub serving `files` as its repository's root. */
const mountedStartup = (
  files: ReadonlyMap<string, Uint8Array>,
  {
    history = recordingHistory(),
    objectUrls = recordingObjectUrls(),
    source = `github:${OWNER}/${REPO}`,
    github = fakeGitHub({ files }),
    scopes = [],
  }: MountedStartupSeams = {},
) =>
  createMountedStartup({
    location: location(source),
    fetch: github.fetch,
    newId: mintsNothing,
    createObjectUrl: objectUrls.createObjectUrl,
    fullscreen: refusingFullscreen,
    presentations: (scope) => {
      scopes.push(scope);
      return unlinkedPresentations;
    },
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
    const startup = mountedStartup(fixtureFiles(), { history });

    const space = opened(await startup.resolve('/')).app.currentSpace();

    expect(space.id).toBe(META_SPACE_ID);
    expect(space.title).toBe('Map fixture');
    expect(space.resources.map(({ title }) => title)).toEqual(
      expect.arrayContaining(['A', 'B', 'C', 'D', 'E']),
    );
    expect(history.pathname()).toBe(META_PATH);
  });

  it('reads GitHub again on a resolve after one whose read failed', async () => {
    const github = fakeGitHub({ files: fixtureFiles() });
    let offline = true;
    const once: typeof fetch = (input, init) =>
      offline ? Promise.reject(new TypeError('Failed to fetch')) : github.fetch(input, init);
    const startup = mountedStartup(fixtureFiles(), { github: { ...github, fetch: once } });

    await expect(startup.resolve('/')).rejects.toThrow();
    offline = false;

    expect(opened(await startup.resolve('/')).app.currentSpace().id).toBe(META_SPACE_ID);
  });

  it('opens a session marked that its edits are lost on reload, reporting persistence', async () => {
    const container = await render(() => mountedStartup(fixtureFiles()).resolve('/'));

    expect(await within(container).findByText('Edits lost on reload')).toBeInTheDocument();
    expect(within(container).getByTestId('persistence-status')).toHaveTextContent('Persisted');
  });

  it('shows the reader’s diagnostics for a directory that is not an aggregate', async () => {
    const files = fixtureFiles();
    files.set('hyper.json', new TextEncoder().encode('not json'));

    const container = await render(() => mountedStartup(files).resolve('/'));

    expect(container).toHaveTextContent('Application could not start');
    expect(container).toHaveTextContent(`${PINNED} is not an Aggregate directory:`);
    expect(container).toHaveTextContent(`${PINNED}/hyper.json`);
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

  it('commits a write in the page, which a fresh mount of the same files does not hold', async () => {
    const mount = () =>
      mountAggregate({
        source: mapSource('fixture', fixtureFiles()),
        newId: mintsNothing,
        createObjectUrl: recordingObjectUrls().createObjectUrl,
      });
    const mounted = await mount();
    if (!mounted.ok) throw new Error('The fixture mounts.');
    const { backend } = mounted.mounted;
    const before = await backend.loadSpace(META_SPACE_ID);
    if (before === undefined) throw new Error('The Meta Space is mounted.');

    const renamed = {
      ...before.snapshot,
      document: { ...before.snapshot.document, title: 'Renamed' },
    };
    const committed = await backend.commit({
      changes: [
        {
          kind: 'update',
          spaceId: META_SPACE_ID,
          snapshot: renamed,
          expectedRevision: before.revision,
        },
      ],
    });

    expect(committed.kind).toBe('committed');
    const after = await backend.loadSpace(META_SPACE_ID);
    expect(after?.revision).toBeGreaterThan(before.revision);
    expect(after?.snapshot.document.title).toBe('Renamed');

    const reloaded = await mount();
    if (!reloaded.ok) throw new Error('The fixture mounts.');
    const fresh = await reloaded.mounted.backend.loadSpace(META_SPACE_ID);
    expect(fresh?.snapshot.document.title).toBe('Map fixture');
  });

  it('stores an uploaded image in the page and draws it from an object URL over its bytes', async () => {
    const objectUrls = recordingObjectUrls();
    const mounted = await mountAggregate({
      source: mapSource('fixture', fixtureFiles()),
      newId: mintsNothing,
      createObjectUrl: objectUrls.createObjectUrl,
    });
    if (!mounted.ok) throw new Error('The fixture mounts.');
    const { backend, displayImage } = mounted.mounted;
    // A PNG signature and a tail no fixture image has: storing reads the
    // signature and nothing else.
    const uploaded = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x7f]);

    // Uploaded as Node's own Blob, as a page uploads its own: the in-page
    // application is Node's `Request` under test, which does not read jsdom's
    // Blob as its bytes. jsdom's is back before anything is drawn.
    const pageBlob = globalThis.Blob;
    vi.stubGlobal('Blob', NodeBlob);
    const upload = new Blob([uploaded], { type: 'image/png' });
    vi.stubGlobal('Blob', pageBlob);
    const stored = await backend.storeImage(upload);
    if (stored.kind !== 'stored')
      throw new Error(`The image was not stored: ${JSON.stringify(stored)}`);

    expect(displayImage(stored.url)).toBe('blob:https://mounted.test/1');
    expect(displayImage(stored.url)).toBe('blob:https://mounted.test/1');
    const [picture] = objectUrls.made;
    expect(objectUrls.made).toHaveLength(1);
    expect(picture?.type).toBe('image/png');
    expect(await bytesOf(picture ?? new Blob())).toEqual(uploaded);
  });

  it('draws a stored image from an object URL over the mounted bytes', async () => {
    const files = fixtureFiles();
    const objectUrls = recordingObjectUrls();
    const startup = mountedStartup(files, { objectUrls });

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
    // Read inside `act`: the canvas keeps settling while the FileReader runs,
    // and an update in that gap would land outside any test boundary.
    const bytes = await act(() => bytesOf(picture ?? new Blob()));
    expect(bytes).toEqual(files.get(`images/${IMAGE_ID}.png`));
  });

  it('pins the commit a branch resolves to in the address, keeping the path', async () => {
    const history = recordingHistory(`${META_PATH}?source=github:${OWNER}/${REPO}@main`);

    await mountedStartup(fixtureFiles(), {
      history,
      source: `github:${OWNER}/${REPO}@main`,
    }).resolve(META_PATH);

    expect(history.writes).toEqual([{ method: 'replace', path: `${META_PATH}?source=${PINNED}` }]);
  });

  it('pins a build-time default at the root in the one write that moves to the Meta Space', async () => {
    const history = recordingHistory('/');

    await mountedStartup(fixtureFiles(), { history }).resolve('/');

    expect(history.writes).toEqual([{ method: 'replace', path: `${META_PATH}?source=${PINNED}` }]);
  });

  it('writes nothing to an address that already names the commit', async () => {
    const history = recordingHistory(`${META_PATH}?source=${PINNED}`);

    await mountedStartup(fixtureFiles(), { history, source: PINNED }).resolve(META_PATH);

    expect(history.writes).toEqual([]);
  });

  it('scopes its presentation links by the resolved location', async () => {
    const scopes: string[] = [];

    await mountedStartup(fixtureFiles(), {
      scopes,
      source: `github:${OWNER}/${REPO}@main`,
    }).resolve('/');

    expect(scopes).toEqual([PINNED]);
  });

  it('opens a Notes window on the same pinned source', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const history = recordingHistory('/');
    const app = opened(await mountedStartup(fixtureFiles(), { history }).resolve('/')).app;

    app.presenting.commands.openNotes();

    const notes = productDestinationPath({ kind: 'notes', spaceId: META_SPACE_ID });
    expect(open).toHaveBeenCalledWith(
      `${ORIGIN}${notes}?source=${PINNED}`,
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('shows a rate-limited GitHub answer as its failure', async () => {
    const files = fixtureFiles();
    const github = fakeGitHub({ files, rateLimitStatus: 403 });

    const container = await render(() => mountedStartup(files, { github }).resolve('/'));

    expect(container).toHaveTextContent('Application could not start');
    expect(container).toHaveTextContent('GitHub’s limit on requests without a token is used up');
  });

  it('shows a location whose directory holds no hyper.json in the reader’s words', async () => {
    const files = fixtureFiles();
    files.delete('hyper.json');

    const container = await render(() => mountedStartup(files).resolve('/'));

    expect(container).toHaveTextContent(`${PINNED} is not an Aggregate directory:`);
    expect(container).toHaveTextContent(
      `${PINNED}/hyper.json: a canonical aggregate directory must contain hyper.json`,
    );
  });

  it('shows every file GitHub would not give', async () => {
    const files = fixtureFiles();
    const unreadable = [
      '00000000-0000-4000-8000-000000000060/space.json',
      '00000000-0000-4000-8000-000000000070/space.json',
    ];
    const github = fakeGitHub({
      files,
      blobFailures: new Map(unreadable.map((path) => [path, [{ status: 404 }]])),
    });

    const container = await render(() => mountedStartup(files, { github }).resolve('/'));

    expect(container).toHaveTextContent(`${PINNED} is not an Aggregate directory:`);
    for (const path of unreadable) {
      expect(container).toHaveTextContent(
        `${PINNED}/${path}: could not be fetched from GitHub: the request failed with HTTP 404`,
      );
    }
  });

  /**
   * A static host answers every path with the application, so the
   * application answers an address that names nothing with its "not found"
   * destination over the Meta Space, rather than failing to start (ADR 0130).
   */
  it.each([
    ['an unresolved Map', MISSING_MAP_PATH],
    ['a malformed Space', '/spaces/not-a-compact-uuid'],
    ['a path outside product addressing', '/talk'],
  ])('answers %s with the Meta Space and the not-found report', async (_, path) => {
    const history = recordingHistory(`${path}?source=${PINNED}`);

    const result = await mountedStartup(fixtureFiles(), { history, source: PINNED }).resolve(path);

    if (result.kind !== 'opened') throw new Error('The address opens a Space.');
    expect(result.opened.app.currentSpace().id).toBe(META_SPACE_ID);
    expect(result.spaces.browserLocation.getState().destinationNotFound).toBe(true);
    expect(history.writes).toEqual([]);
  });

  it('fails startup on a Notes address for a missing Space', async () => {
    const path = productDestinationPath({ kind: 'notes', spaceId: MISSING_SPACE_ID });

    await expect(
      mountedStartup(fixtureFiles(), { history: recordingHistory(path), source: PINNED }).resolve(
        path,
      ),
    ).rejects.toThrow('The product URL does not resolve.');
  });

  it('answers /index.html as the root', async () => {
    const history = recordingHistory('/index.html');

    const result = await mountedStartup(fixtureFiles(), { history }).resolve('/index.html');

    if (result.kind !== 'opened') throw new Error('The address opens a Space.');
    expect(result.spaces.browserLocation.getState().destinationNotFound).toBe(false);
    expect(history.writes).toEqual([{ method: 'replace', path: `${META_PATH}?source=${PINNED}` }]);
  });

  it('keeps the rest of the query as it moves the root to the Meta Space, but not the hash', async () => {
    const history = recordingHistory('/?utm=feed#notes');

    await mountedStartup(fixtureFiles(), { history }).resolve('/');

    expect(history.writes).toEqual([
      { method: 'replace', path: `${META_PATH}?utm=feed&source=${PINNED}` },
    ]);
  });

  it('draws the not-found report over the Meta Space', async () => {
    const path = MISSING_MAP_PATH;
    const history = recordingHistory(`${path}?source=${PINNED}`);

    const container = await render(() =>
      mountedStartup(fixtureFiles(), { history, source: PINNED }).resolve(path),
    );

    expect(await within(container).findByText('Destination not found')).toBeInTheDocument();
  });
});
