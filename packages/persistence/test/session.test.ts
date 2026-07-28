import { describe, expect, it } from 'vitest';
import type { LoadedSpace, SpaceSessionState } from '../src/index';
import { MemorySpaceBackend, openSpaceSession } from '../src/index';
import { MemorySpaceBackendTestControl } from '../src/memory';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const CARD_ID = '00000000-0000-4000-8000-000000000002';

const loaded: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 2, title: 'One', routes: [] },
    cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'Original' } }],
  },
  revision: 3n,
  exportedRevision: 2n,
};

const waitFor = (
  getState: () => SpaceSessionState,
  subscribe: (listener: () => void) => () => void,
  predicate: (state: SpaceSessionState) => boolean,
): Promise<SpaceSessionState> => {
  const current = getState();
  if (predicate(current)) return Promise.resolve(current);

  return new Promise((resolve) => {
    const unsubscribe = subscribe(() => {
      const state = getState();
      if (!predicate(state)) return;
      unsubscribe();
      resolve(state);
    });
  });
};

const changedTitle = (title: string) => {
  const snapshot = structuredClone(loaded.snapshot);
  snapshot.document.title = title;
  return snapshot;
};

describe('openSpaceSession', () => {
  it('updates optimistically, persists a complete snapshot, and acknowledges success', async () => {
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const changed = structuredClone(loaded.snapshot);
    changed.document.title = 'Changed';

    session.submit(changed);

    expect(session.getState()).toMatchObject({
      working: changed,
      acknowledgedRevision: 3n,
      changedSinceExport: true,
      persistence: { kind: 'pending' },
    });
    const settled = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    expect(settled).toMatchObject({
      working: changed,
      acknowledgedRevision: 4n,
      changedSinceExport: true,
      persistence: { kind: 'settled' },
    });
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: changed,
      revision: 4n,
    });
  });

  it('coalesces edits behind one in-flight commit to the latest complete snapshot', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const backend = new MemorySpaceBackend([loaded], control);
    const session = openSpaceSession(backend, loaded);

    session.submit(changedTitle('First'));
    session.submit(changedTitle('Second'));
    session.submit(changedTitle('Latest'));
    release();

    const finished = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled' || state.persistence.kind === 'conflicted',
    );
    expect(control.attempts).toHaveLength(2);
    expect(control.attempts[1]?.snapshot.document.title).toBe('Latest');
    expect(control.attempts[1]?.expectedRevision).toBe(4n);
    expect(finished.persistence.kind).toBe('settled');
    expect(finished.acknowledgedRevision).toBe(5n);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: { document: { title: 'Latest' } },
      revision: 5n,
    });
  });

  it('stops on retryable failure and retries the latest working snapshot explicitly', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'retryable-failure',
      code: 'unavailable',
      message: 'Try later',
    });
    const backend = new MemorySpaceBackend([loaded], control);
    const session = openSpaceSession(backend, loaded);

    session.submit(changedTitle('Failed payload'));
    await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'failed',
    );
    session.submit(changedTitle('Latest after failure'));
    expect(control.attempts).toHaveLength(1);

    session.retry();

    const settled = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    expect(settled.working.document.title).toBe('Latest after failure');
    expect(control.attempts[1]).toMatchObject({
      expectedRevision: 3n,
      snapshot: { document: { title: 'Latest after failure' } },
    });
  });

  it('disables retry after permanent failure but allows a later valid submit', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'permanent-failure',
      code: 'forbidden',
      message: 'No access',
    });
    const backend = new MemorySpaceBackend([loaded], control);
    const session = openSpaceSession(backend, loaded);

    session.submit(changedTitle('Rejected'));
    await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'rejected',
    );
    session.retry();
    expect(control.attempts).toHaveLength(1);

    session.submit(changedTitle('Corrected'));

    const settled = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    expect(settled.acknowledgedRevision).toBe(4n);
    expect(control.attempts).toHaveLength(2);
  });

  it('retains local work on conflict until accepting the returned remote snapshot', async () => {
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const remote = changedTitle('Remote');
    await backend.commitSpace(remote, 3n);

    session.submit(changedTitle('Local'));
    const conflicted = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'conflicted',
    );
    expect(conflicted.working.document.title).toBe('Local');
    session.submit(changedTitle('More local work'));
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({ revision: 4n });

    session.acceptRemote();

    expect(session.getState()).toMatchObject({
      working: remote,
      acknowledgedRevision: 4n,
      persistence: { kind: 'settled' },
    });
  });

  it('commits an explicitly reconciled conflict against the returned current revision', async () => {
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    await backend.commitSpace(changedTitle('Remote'), 3n);

    session.submit(changedTitle('Local'));
    await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'conflicted',
    );
    session.resolveConflict(changedTitle('Reconciled'));

    const settled = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    expect(settled).toMatchObject({
      working: { document: { title: 'Reconciled' } },
      acknowledgedRevision: 5n,
    });
  });

  it('derives export status from the returned durable state while conflicted', async () => {
    const remote = {
      ...loaded,
      snapshot: changedTitle('Remote'),
      revision: 7n,
      exportedRevision: 7n,
    };
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'conflict', current: remote });
    const session = openSpaceSession(new MemorySpaceBackend([loaded], control), loaded);

    session.submit(changedTitle('Local'));

    const conflicted = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'conflicted',
    );
    expect(conflicted.changedSinceExport).toBe(false);
    session.acceptRemote();
    expect(session.getState()).toMatchObject({
      working: remote.snapshot,
      acknowledgedRevision: 7n,
      changedSinceExport: false,
      persistence: { kind: 'settled' },
    });
  });

  it('derives export status only from acknowledged durable revisions', async () => {
    const atExport = { ...loaded, exportedRevision: 3n };
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const session = openSpaceSession(new MemorySpaceBackend([atExport], control), atExport);
    expect(session.getState().changedSinceExport).toBe(false);

    session.submit(changedTitle('Pending'));
    expect(session.getState().changedSinceExport).toBe(false);
    release();

    const settled = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    expect(settled.changedSinceExport).toBe(true);

    const neverExported = openSpaceSession(
      new MemorySpaceBackend([{ ...loaded, exportedRevision: null }]),
      { ...loaded, exportedRevision: null },
    );
    expect(neverExported.getState().changedSinceExport).toBe(true);
  });
});
