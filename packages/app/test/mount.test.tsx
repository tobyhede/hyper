import { act, waitFor, within } from '@testing-library/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

  it('opens a read-only session, marked so and with no persistence status', async () => {
    const container = await render(() => mountedStartup(fixtureFiles()).resolve('/'));

    expect(await within(container).findByText('Read-only')).toBeInTheDocument();
    expect(within(container).queryByTestId('persistence-status')).toBeNull();
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

  it('shows a location whose directory holds no hyper.json as its failure', async () => {
    const files = fixtureFiles();
    files.delete('hyper.json');

    const container = await render(() => mountedStartup(files).resolve('/'));

    expect(container).toHaveTextContent(
      `${PINNED} does not directly contain hyper.json, so it is not an Aggregate directory.`,
    );
  });
});
