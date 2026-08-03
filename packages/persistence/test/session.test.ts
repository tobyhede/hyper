import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import type { LoadedSpace, SpaceSessionState } from '../src/index';
import { MemorySpaceBackend, openSpaceSession } from '../src/index';
import { MemorySpaceBackendTestControl } from '../src/memory';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

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
  it('persists an optimistic Edit and notifies later observers when one observer fails', async () => {
    const backend = new MemorySpaceBackend([loaded]);
    const reported: unknown[] = [];
    const session = openSpaceSession(backend, loaded, {
      reportObserverError: (error) => reported.push(error),
    });
    const observerError = new Error('observer failed');
    const observedTitles: string[] = [];
    session.subscribe(() => {
      throw observerError;
    });
    session.subscribe(() => {
      observedTitles.push(session.getState().working.document.title);
    });

    expect(() => session.submit(changedTitle('Changed despite observer'))).not.toThrow();

    const settled = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    expect(settled.acknowledgedRevision).toBe(4n);
    expect(observedTitles).toContain('Changed despite observer');
    expect(reported).toContain(observerError);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: { document: { title: 'Changed despite observer' } },
      revision: 4n,
    });
  });

  /*
   * The app opens its session without options (`open-workspace.ts`), so the
   * console default is the reporter every real observer failure goes through.
   */
  it('reports an observer failure to the console when no reporter is supplied', async () => {
    const reportedToConsole = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const observerError = new Error('observer failed');
    session.subscribe(() => {
      throw observerError;
    });

    expect(() => session.submit(changedTitle('Reported to the console'))).not.toThrow();

    await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    expect(reportedToConsole).toHaveBeenCalledWith('SpaceSession observer failed', observerError);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: { document: { title: 'Reported to the console' } },
      revision: 4n,
    });
  });

  it('continues session work when reporting an observer failure also fails', async () => {
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded, {
      reportObserverError: () => {
        throw new Error('diagnostic failed');
      },
    });
    session.subscribe(() => {
      throw new Error('observer failed');
    });
    // The point of the test: a failing observer, whose failure also fails to
    // report, must not cost the observers behind it their notification.
    const observedTitles: string[] = [];
    session.subscribe(() => observedTitles.push(session.getState().working.document.title));

    expect(() => session.submit(changedTitle('Still persisted'))).not.toThrow();

    expect(observedTitles).toContain('Still persisted');

    await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: { document: { title: 'Still persisted' } },
      revision: 4n,
    });
  });

  /*
   * A notification that cannot interrupt its publisher can still *reach* it: an
   * observer is free to submit the next Edit while the publishing submit is
   * still on the stack. The reentrant call installs the newer working Space, so
   * the outer one must commit that rather than the snapshot it was handed — and
   * commit it once, which is what coalescing already promises every other
   * waiting Edit.
   */
  it('coalesces a submit made from an observer into one commit of the newest snapshot', async () => {
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend([loaded], control);
    const session = openSpaceSession(backend, loaded);
    let reentered = false;
    session.subscribe(() => {
      if (reentered) return;
      reentered = true;
      session.submit(changedTitle('Second'));
    });

    session.submit(changedTitle('First'));

    const settled = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    expect(control.attempts).toHaveLength(1);
    expect(control.attempts[0]?.snapshot.document.title).toBe('Second');
    expect(settled.working.document.title).toBe('Second');
    expect(settled.acknowledgedRevision).toBe(4n);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: { document: { title: 'Second' } },
      revision: 4n,
    });
  });

  /*
   * The queue an observer's submit joins is the in-flight one, whatever raised
   * the notification it is answering. A retry made from an optimistic
   * publication starts its commit and publishes `pending` from *inside* that
   * publication, and an Edit submitted from there has a commit to wait behind —
   * the submit further down the stack is gated on the failure it was published
   * under and will decide nothing.
   */
  it('queues an Edit submitted from a pending notification raised inside an optimistic one', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'retryable-failure', code: 'unavailable', message: 'Try later' });
    const backend = new MemorySpaceBackend([loaded], control);
    const session = openSpaceSession(backend, loaded);

    session.submit(changedTitle('Failed payload'));
    await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'failed',
    );

    let retried = false;
    let resubmitted = false;
    session.subscribe(() => {
      if (retried || session.getState().persistence.kind !== 'failed') return;
      retried = true;
      session.retry();
    });
    session.subscribe(() => {
      if (resubmitted || session.getState().persistence.kind !== 'pending') return;
      resubmitted = true;
      session.submit(changedTitle('Newest while retrying'));
    });

    session.submit(changedTitle('Retried payload'));

    const settled = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    expect(settled.working.document.title).toBe('Newest while retrying');
    expect(control.attempts.map((attempt) => attempt.snapshot.document.title)).toEqual([
      'Failed payload',
      'Retried payload',
      'Newest while retrying',
    ]);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: { document: { title: 'Newest while retrying' } },
    });
  });

  /*
   * The conflicted twin of the case above, and the reason the queue cannot be
   * scoped to a call's own publication: `resolveConflict` publishes `pending`
   * from inside the optimistic publication just as `retry` does, so the same
   * nesting arises on the path that reconciles rather than the one that repeats.
   * An Edit made from that `pending` notification has the reconciling commit to
   * wait behind; dropping it would report `settled` over a visible Edit that was
   * never stored.
   */
  it('queues an Edit submitted from a pending notification raised inside a conflicted one', async () => {
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend([loaded], control);
    await backend.commitSpace(changedTitle('Remote'), 3n);
    const session = openSpaceSession(backend, loaded);

    session.submit(changedTitle('Conflicting payload'));
    await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'conflicted',
    );

    let reconciled = false;
    let resubmitted = false;
    session.subscribe(() => {
      if (reconciled || session.getState().persistence.kind !== 'conflicted') return;
      reconciled = true;
      session.resolveConflict(changedTitle('Reconciled payload'));
    });
    session.subscribe(() => {
      if (resubmitted || session.getState().persistence.kind !== 'pending') return;
      resubmitted = true;
      session.submit(changedTitle('Newest while reconciling'));
    });

    session.submit(changedTitle('Edited while conflicted'));

    const settled = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    expect(settled.working.document.title).toBe('Newest while reconciling');
    expect(settled.acknowledgedRevision).toBe(6n);
    expect(control.attempts.map((attempt) => attempt.snapshot.document.title)).toEqual([
      'Remote',
      'Conflicting payload',
      'Reconciled payload',
      'Newest while reconciling',
    ]);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: { document: { title: 'Newest while reconciling' } },
      revision: 6n,
    });
  });

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

  it('contains a rejected asynchronous observer and still notifies the rest', async () => {
    const backend = new MemorySpaceBackend([loaded]);
    const reported: unknown[] = [];
    const session = openSpaceSession(backend, loaded, {
      reportObserverError: (error) => reported.push(error),
    });
    const observedTitles: string[] = [];
    // `subscribe` takes `() => void` and TypeScript's void-return bivariance
    // admits an async listener without complaint. Its rejection lands nowhere
    // near the try/catch guarding the call, and an unhandled rejection is
    // answered by killing the process — the one failure mode a non-throwing
    // publisher exists to prevent.
    // Deliberately the shape lint rejects: the rule is the first line of
    // defence and this asserts the second, for a listener that reaches the same
    // shape indirectly and never trips it.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    session.subscribe(() => Promise.reject(new Error('observer rejected')));
    session.subscribe(() => {
      observedTitles.push(session.getState().working.document.title);
    });

    expect(() => session.submit(changedTitle('Changed despite async observer'))).not.toThrow();

    await waitFor(session.getState, session.subscribe, (s) => s.persistence.kind === 'settled');

    // Exactly one report per publication — the optimistic working state, then
    // `pending`, then `settled` — counted against the observer that recorded
    // them rather than a literal, so this pins containment rather than how many
    // times a commit happens to publish. Every rejection accounted for is the
    // point: one left over would be one that escaped.
    expect(observedTitles).toContain('Changed despite async observer');
    await vi.waitFor(() => expect(reported).toHaveLength(observedTitles.length));
    expect(new Set(reported.map(String))).toEqual(new Set(['Error: observer rejected']));
  });
});
