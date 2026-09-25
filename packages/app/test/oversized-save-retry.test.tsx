import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { MAX_COMMIT_BODY_BYTES } from '@project/http';
import {
  encodeCommitRequest,
  MemorySpaceBackend,
  type CommitResult,
  type SpaceCommit,
} from '@project/persistence';
import { createOpenSpaces, type OpenSpace } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { recordingHistory } from './browser-history';

/**
 * Code-quality ticket 22, through the application: a save over the request size
 * limit is explained by the Dock's notice rather than a dialog, keeps every
 * Edit, offers Retry, and saves once the content is reduced enough — for a
 * coordinated save, counting every Space the request carries.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const TOO_LARGE =
  'This save is larger than the server accepts in one request, counting every space it includes. Shorten or remove content, then retry.';

const withNotes = (body: string): SpaceSnapshot => ({
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    defaultMap: MAP_ID,
    maps: [
      {
        id: MAP_ID,
        title: 'Map',
        kind: 'positioned',
        positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
        activeGraph: GRAPH_ID,
      },
    ],
  },
  resources: [{ id: RESOURCE_ID, document: { title: 'Notes', kind: 'markdown', body } }],
});

const requestBytes = (request: SpaceCommit): number =>
  new TextEncoder().encode(JSON.stringify(encodeCommitRequest(request))).byteLength;

/** A Notes body that makes Meta's own update request exactly `bytes` long. */
const notesForRequestOf = (bytes: number): string =>
  'x'.repeat(
    bytes -
      requestBytes({
        changes: [
          { kind: 'update', spaceId: META_ID, snapshot: withNotes(''), expectedRevision: 3n },
        ],
      }),
  );

/**
 * Refuses a request over `MAX_COMMIT_BODY_BYTES` the way the HTTP application
 * does, with nothing stored; `test/unit/oversized-save.test.ts` holds that
 * boundary itself.
 */
class SizeLimitedBackend extends MemorySpaceBackend {
  readonly sent: number[] = [];

  override commit(request: SpaceCommit): Promise<CommitResult> {
    const bytes = requestBytes(request);
    this.sent.push(bytes);
    if (bytes > MAX_COMMIT_BODY_BYTES) {
      return Promise.resolve({ kind: 'permanent-failure', code: 'payload-too-large' });
    }
    return super.commit(request);
  }
}

const countingIds = (): (() => UUID) => {
  let next = 0x20;
  return () => uuidSchema.parse(`00000000-0000-4000-8000-0000000000${(next++).toString(16)}`);
};

const notesBody = (space: OpenSpace): string | undefined => {
  const document = space.session
    .getState()
    .working.resources.find(({ id }) => id === RESOURCE_ID)?.document;
  return document?.kind === 'markdown' ? document.body : undefined;
};

const storedNotes = async (backend: MemorySpaceBackend): Promise<string | undefined> => {
  const document = (await backend.loadSpace(META_ID))?.snapshot.resources.find(
    ({ id }) => id === RESOURCE_ID,
  )?.document;
  return document?.kind === 'markdown' ? document.body : undefined;
};

/** Complete the Edit an author makes by writing `body` into Notes. */
const writeNotes = (space: OpenSpace, body: string): void => {
  act(() => {
    const result = space.app.authoring.complete({
      kind: 'edited-resource',
      resourceId: RESOURCE_ID,
      document: { title: 'Notes', kind: 'markdown', body },
    });
    if (result.kind !== 'completed') throw new Error('The Notes Edit did not complete');
  });
};

const opened = async (stored: SpaceSnapshot) => {
  const backend = new SizeLimitedBackend(META_ID, [
    { snapshot: stored, revision: 3n, exportedRevision: null },
  ]);
  const openSpaces = createOpenSpaces({
    backend,
    metaSpaceId: META_ID,
    metaSpaceTitle: 'Meta',
    newId: countingIds(),
    history: recordingHistory(),
  });
  const meta = await openSpaces.open(META_ID);
  render(<OpenSpacesApplication spaces={openSpaces} initial={meta} />);
  // Let the first render's own asynchronous updates land inside `act`.
  await act(() => Promise.resolve());
  return { backend, openSpaces, meta };
};

const notice = () => screen.getByTestId('persistence-failure');
const persistenceOf = (space: OpenSpace) => space.session.getState().persistence;

describe('A save over the request size limit', () => {
  // React Flow and Base UI measure, and jsdom has no `ResizeObserver`.
  beforeAll(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {
          return undefined;
        }
        unobserve(): void {
          return undefined;
        }
        disconnect(): void {
          return undefined;
        }
      },
    );
  });
  afterAll(() => vi.unstubAllGlobals());

  it('explains the refusal, keeps the Edit through Retry, and saves a reduction that fits', async () => {
    const { backend, meta } = await opened(withNotes(''));
    const tooLong = notesForRequestOf(MAX_COMMIT_BODY_BYTES + 100);

    writeNotes(meta, tooLong);
    await waitFor(() => expect(persistenceOf(meta).kind).toBe('rejected'));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(notice()).toHaveTextContent('Changes not saved');
    expect(notice()).toHaveTextContent(TOO_LARGE);
    expect(screen.getByTestId('persistence-status')).not.toHaveAttribute('data-state', 'settled');
    expect(notesBody(meta)).toBe(tooLong);
    expect(backend.sent).toHaveLength(1);

    // Retry as it stands: sent again, refused again, the Edit kept.
    fireEvent.click(within(notice()).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(backend.sent).toHaveLength(2));
    await waitFor(() => expect(persistenceOf(meta).kind).toBe('rejected'));
    expect(notice()).toHaveTextContent(TOO_LARGE);
    expect(notesBody(meta)).toBe(tooLong);

    // A reduction still over the limit is refused with the same explanation.
    writeNotes(meta, tooLong.slice(50));
    await waitFor(() => expect(backend.sent).toHaveLength(3));
    await waitFor(() => expect(persistenceOf(meta).kind).toBe('rejected'));
    expect(notice()).toHaveTextContent(TOO_LARGE);
    expect(within(notice()).getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(notesBody(meta)).toBe(tooLong.slice(50));
    await expect(storedNotes(backend)).resolves.toBe('');

    writeNotes(meta, tooLong.slice(200));
    await waitFor(() => expect(persistenceOf(meta).kind).toBe('settled'));
    expect(screen.queryByTestId('persistence-failure')).toBeNull();
    await expect(storedNotes(backend)).resolves.toBe(tooLong.slice(200));
  });

  it('counts every Space a coordinated save carries, and saves once Meta is reduced', async () => {
    // Meta saves alone, 256 bytes under the limit; a Space Resource creation
    // carries the new Space in the same request, which takes it over.
    const { backend, openSpaces, meta } = await opened(
      withNotes(notesForRequestOf(MAX_COMMIT_BODY_BYTES - 256)),
    );

    const created = await act(() =>
      openSpaces.spaceResources.create({
        containingSpaceId: META_ID,
        mapId: MAP_ID,
        title: 'Target',
        position: { x: 240, y: 0 },
      }),
    );
    if (created.kind !== 'completed') throw new Error('The Space Resource was not created');
    await waitFor(() => expect(persistenceOf(meta).kind).toBe('rejected'));
    expect(backend.sent[0]).toBeGreaterThan(MAX_COMMIT_BODY_BYTES);
    expect(notice()).toHaveTextContent(TOO_LARGE);
    const kept = (): boolean =>
      meta.session.getState().working.resources.some(({ id }) => id === created.resourceId);
    expect(kept()).toBe(true);

    fireEvent.click(within(notice()).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(backend.sent).toHaveLength(2));
    await waitFor(() => expect(persistenceOf(meta).kind).toBe('rejected'));
    expect(notice()).toHaveTextContent(TOO_LARGE);
    expect(kept()).toBe(true);

    writeNotes(meta, (notesBody(meta) ?? '').slice(4096));
    await waitFor(() => expect(persistenceOf(meta).kind).toBe('settled'));
    expect(backend.sent).toHaveLength(3);
    expect(screen.queryByTestId('persistence-failure')).toBeNull();
    const stored = await backend.loadSpace(META_ID);
    expect(stored?.snapshot.resources.some(({ id }) => id === created.resourceId)).toBe(true);
  });
});
