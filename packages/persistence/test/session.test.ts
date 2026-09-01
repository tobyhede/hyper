import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import type { LoadedSpace, SpaceBackend, SpaceSession, SpaceSessionState } from '../src/index';
import { MemorySpaceBackend, openSpaceSession } from '../src/index';
import { openManagedSpaceSession } from '../src/session';
import { MemorySpaceBackendTestControl } from '../src/memory';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

const loaded: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 1, title: 'One' },
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

const commitSnapshot = (
  backend: SpaceBackend,
  snapshot: LoadedSpace['snapshot'],
  expectedRevision: bigint,
) =>
  backend.commit({
    changes: [{ kind: 'update', spaceId: snapshot.id, snapshot, expectedRevision }],
  });

/** Every persistence state a session can be in other than `conflicted`. */
type UnconflictedKind = Exclude<SpaceSessionState['persistence']['kind'], 'conflicted'>;

/**
 * One sample of every kind the property below quantifies over, keyed by kind
 * for exhaustive generation.
 *
 * The type alias above derives from `SpaceSessionState`, but a derived union is
 * not on its own a guard: neither `fc.constantFrom` nor the `switch` in
 * `openSessionIn` demands that every member be named, so a sixth persistence
 * kind would drop out of the property in silence. `Record<UnconflictedKind, _>`
 * is what makes it a compile error here — and the case it then needs in
 * `openSessionIn` is a line away.
 */
const EVERY_UNCONFLICTED_KIND = {
  settled: 'settled',
  pending: 'pending',
  failed: 'failed',
  rejected: 'rejected',
} as const satisfies Readonly<Record<UnconflictedKind, UnconflictedKind>>;

interface DrivenSession {
  readonly session: SpaceSession;
  readonly control: MemorySpaceBackendTestControl;
  /** Releases the gate held for `pending`; a no-op for the settled kinds. */
  readonly release: () => void;
}

/**
 * Open a session and drive it into one non-conflicted persistence state.
 *
 * All four are reached the same way — one `submit` and one commit outcome —
 * so the state under test is the one the state machine actually produces
 * rather than one assembled for the test. `settled` is deliberately the
 * *post-commit* settled rather than the state a session opens in, which the
 * first test in this file covers on its own.
 */
const openSessionIn = async (kind: UnconflictedKind): Promise<DrivenSession> => {
  const control = new MemorySpaceBackendTestControl();
  const noRelease = (): void => undefined;
  let release = noRelease;
  switch (kind) {
    case 'settled':
      break;
    case 'pending':
      release = control.deferNextCommit();
      break;
    case 'failed':
      control.queueResult({ kind: 'retryable-failure', code: 'unavailable', message: 'Try later' });
      break;
    case 'rejected':
      control.queueResult({ kind: 'permanent-failure', code: 'forbidden', message: 'No access' });
      break;
  }
  const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [loaded], control), loaded);

  session.submit(changedTitle(`Drove into ${kind}`));
  const driven = await waitFor(
    session.getState,
    session.subscribe,
    (state) => state.persistence.kind === kind,
  );

  /*
   * The acknowledged revision says which `settled` this is. `submit` publishes
   * `pending` synchronously today, so waiting for `settled` waits for a *round
   * trip*. If that ever became asynchronous the predicate would match the
   * optimistic state instead, and this helper would go on returning a session
   * that had never reached the backend — testing that state twice and the
   * post-commit one never, without failing.
   *
   * Neither of the two weaker guards catches that. The attempt count cannot:
   * `MemorySpaceBackend.commit` records the attempt before its first
   * `await`, so `attempts` proves a commit *started*, never that one finished.
   * Nor can state identity: `submit`'s optimistic publication already installs
   * a fresh object in `settled` before any commit begins. Only the revision
   * separates the two, because only an acknowledged commit advances it —
   * deferring `startCommit` by a microtask leaves it at `loaded.revision` and
   * turns this line red. The count stays as the weaker statement it can
   * honestly make, that the backend was reached at all.
   */
  expect(driven.acknowledgedRevision).toBe(
    kind === 'settled' ? loaded.revision + 1n : loaded.revision,
  );
  expect(control.attempts).toHaveLength(1);

  return { session, control, release };
};

describe('openSpaceSession', () => {
  it('submits a singleton update through the unified commit interface', async () => {
    const control = new MemorySpaceBackendTestControl();
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [loaded], control), loaded);

    session.submit(changedTitle('Unified commit'));

    await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    expect(control.requests).toEqual([
      {
        changes: [
          {
            kind: 'update',
            spaceId: SPACE_ID,
            snapshot: changedTitle('Unified commit'),
            expectedRevision: 3n,
          },
        ],
      },
    ]);
  });

  /*
   * The state a session is in the instant it opens, asserted whole. Every other
   * test in this file reads `getState()` only after a `submit`, by which point
   * the transition into `pending` has overwritten the state `openSpaceSession`
   * installed — so nothing said what a caller reads before it submits anything.
   * Asserting the complete object rather than the one field is deliberate: a
   * fifth state field has to be accounted for here rather than slipping past a
   * `toMatchObject`. A sixth *persistence* kind would not: it does not change
   * the value `{ kind: 'settled' }`, so no runtime assertion can see it, and
   * `EVERY_UNCONFLICTED_KIND` above is what catches that instead.
   */
  it('opens settled on the loaded snapshot before anything is submitted', () => {
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [loaded]), loaded);

    expect(session.getState()).toEqual({
      working: loaded.snapshot,
      acknowledgedRevision: 3n,
      changedSinceExport: true,
      persistence: { kind: 'settled' },
    });
  });

  it('persists an optimistic Edit and notifies later observers when one observer fails', async () => {
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded]);
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
   * The app opens its session without options (`open-space.ts`), so the
   * console default is the reporter every real observer failure goes through.
   */
  it('reports an observer failure to the console when no reporter is supplied', async () => {
    const reportedToConsole = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded]);
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
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded]);
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
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded], control);
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
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded], control);
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
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded], control);
    await commitSnapshot(backend, changedTitle('Remote'), 3n);
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
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded]);
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
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded], control);
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

  /*
   * `startCommit`'s `unpublishedState` on the `committed` path. The revision the
   * finished commit acknowledged reaches subscribers *with* the coalesced
   * commit's `pending`, rather than in a publication of its own that the
   * transition would overwrite a line later. Nothing outside this module reads
   * `changedSinceExport`, so the publication is the only place the threading is
   * observable at all — hence a subscriber rather than a downstream effect.
   */
  it('carries the acknowledged revision into the coalesced commit it starts', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded], control);
    const session = openSpaceSession(backend, loaded);
    const pendingRevisions: bigint[] = [];
    session.subscribe(() => {
      const state = session.getState();
      if (state.persistence.kind === 'pending') pendingRevisions.push(state.acknowledgedRevision);
    });

    session.submit(changedTitle('First'));
    session.submit(changedTitle('Latest'));
    release();

    await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
    // The first commit's own `pending`, the coalesced Edit republished under it
    // while it was still in flight, then the second commit's `pending` — the
    // one carrying what the first commit acknowledged rather than the 3n it
    // started from.
    expect(pendingRevisions).toEqual([3n, 3n, 4n]);
  });

  it('stops on retryable failure and retries the latest working snapshot explicitly', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'retryable-failure',
      code: 'unavailable',
      message: 'Try later',
    });
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded], control);
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
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded], control);
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
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded]);
    const session = openSpaceSession(backend, loaded);
    const remote = changedTitle('Remote');
    await commitSnapshot(backend, remote, 3n);

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
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded]);
    const session = openSpaceSession(backend, loaded);
    await commitSnapshot(backend, changedTitle('Remote'), 3n);

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

  it('recreates a remotely deleted Space when explicitly keeping local work', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      conflicts: [{ spaceId: SPACE_ID, current: undefined }],
    });
    control.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_ID, revision: 0n }],
      deletedSpaceIds: [],
    });
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded], control);
    const session = openSpaceSession(backend, loaded);

    session.submit(changedTitle('Local'));
    await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'conflicted',
    );
    session.resolveConflict(changedTitle('Recreated'));

    await vi.waitFor(() => expect(control.requests).toHaveLength(2));
    expect(control.requests[1]?.changes).toEqual([
      { kind: 'create', spaceId: SPACE_ID, snapshot: changedTitle('Recreated') },
    ]);
    await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
  });

  /*
   * The same threading on the reconciling path, where it is load-bearing rather
   * than merely earlier: the reconciled snapshot exists nowhere but the state
   * `resolveConflict` derived, so the transition into `pending` is what installs
   * it. Without it the session would leave `working` on the local snapshot the
   * conflict rejected and commit under the wrong one.
   */
  it('carries the reconciled working snapshot into the commit it starts', async () => {
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded]);
    const session = openSpaceSession(backend, loaded);
    await commitSnapshot(backend, changedTitle('Remote'), 3n);

    session.submit(changedTitle('Local'));
    const conflicted = await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'conflicted',
    );
    const pending: SpaceSessionState[] = [];
    session.subscribe(() => {
      const state = session.getState();
      if (state.persistence.kind === 'pending') pending.push(state);
    });

    session.resolveConflict(changedTitle('Reconciled'));

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      working: { document: { title: 'Reconciled' } },
      acknowledgedRevision: conflicted.acknowledgedRevision,
    });
    expect(conflicted.acknowledgedRevision).toBe(4n);
    await waitFor(
      session.getState,
      session.subscribe,
      (state) => state.persistence.kind === 'settled',
    );
  });

  it('derives export status from the returned durable state while conflicted', async () => {
    const remote = {
      ...loaded,
      snapshot: changedTitle('Remote'),
      revision: 7n,
      exportedRevision: 7n,
    };
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      conflicts: [{ spaceId: SPACE_ID, current: remote }],
    });
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [loaded], control), loaded);

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
    const session = openSpaceSession(
      new MemorySpaceBackend(SPACE_ID, [atExport], control),
      atExport,
    );
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
      new MemorySpaceBackend(SPACE_ID, [{ ...loaded, exportedRevision: null }]),
      { ...loaded, exportedRevision: null },
    );
    expect(neverExported.getState().changedSinceExport).toBe(true);
  });

  it('contains a rejected asynchronous observer and still notifies the rest', async () => {
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded]);
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

  /*
   * The two conflict-only operations, quantified over the states they refuse in.
   *
   * `acceptRemote` and `resolveConflict` each answer a conflict and nothing
   * else, and the refusal is the half no example reached: every conflict test
   * above calls them only after waiting for `conflicted`. The rule is one rule
   * across both operations and every other persistence state, so it is stated
   * once and quantified rather than written out eight times — and quantifying
   * over *sequences* says the refusal is repeatable, not merely true of a first
   * call. `pending` and `rejected` are covered here for free; no mutant pointed
   * at either, and the same guard governs them.
   *
   * What it asserts is deliberately not "did not throw". A guard replaced by a
   * silent early return that also wiped the session would pass that and fail
   * this: the published state must be the same object *and* the same value, no
   * subscriber may be notified, and the backend must record no further attempt.
   * The app depends on exactly this — `space-authoring.ts`'s `keepLocalWork`
   * calls `resolveConflict` unguarded and says in a comment that the session
   * ignores the call outside a conflict.
   */
  it('refuses acceptRemote and resolveConflict in every state but conflicted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...Object.values(EVERY_UNCONFLICTED_KIND)),
        fc.array(
          fc.record({
            operation: fc.constantFrom<'acceptRemote' | 'resolveConflict'>(
              'acceptRemote',
              'resolveConflict',
            ),
            title: fc.string(),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        async (kind, calls) => {
          const { session, control, release } = await openSessionIn(kind);
          const before = session.getState();
          const valueBefore = structuredClone(before);
          const attemptsBefore = control.attempts.length;
          let notifications = 0;
          session.subscribe(() => {
            notifications += 1;
          });

          try {
            for (const call of calls) {
              if (call.operation === 'acceptRemote') session.acceptRemote();
              else session.resolveConflict(changedTitle(call.title));
            }

            // Identity, because a publication would replace the object a
            // `useSyncExternalStore` reader compares; value, because an in-place
            // edit would keep the identity and still have changed the session.
            expect(session.getState()).toBe(before);
            expect(session.getState()).toEqual(valueBefore);
            expect(notifications).toBe(0);
            expect(control.attempts).toHaveLength(attemptsBefore);
          } finally {
            // In `finally` because a failed assertion above would otherwise
            // strand the gate: `commit` would never settle, and fast-check
            // leaves one unsettled promise behind per shrink attempt.
            release();
            await waitFor(
              session.getState,
              session.subscribe,
              (state) => state.persistence.kind !== 'pending',
            );
          }
        },
      ),
    );
  });

  /*
   * The seam's contract is a `CommitResult`, and every shipped backend answers
   * transport failure with one — but a throw is still reachable, and the session
   * has to survive it. Left uncaught, `inFlight` never clears: the Space sits
   * `pending` with `retry` and `resolveConflict` both early-returning, and
   * `waitForIdle()` never resolves. `SpaceSessionRegistry`'s lifecycle barrier
   * waits on *every* session, so one stuck this way blocks every coordinated
   * Space Card commit in the registry, with each session already paused.
   */
  it('reports a throwing commit as a failure and returns to idle', async () => {
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded], control);
    const session = openSpaceSession(backend, loaded);
    control.throwNext(new Error('backend exploded'));

    session.submit(changedTitle('Typed'));
    const state = await waitFor(
      session.getState,
      session.subscribe,
      ({ persistence }) => persistence.kind !== 'pending',
    );

    expect(state.persistence).toEqual({
      kind: 'failed',
      failure: {
        kind: 'retryable-failure',
        code: 'unavailable',
        message: 'backend exploded',
      },
    });

    // The whole point: the session is idle again, so the registry's barrier and
    // an ordinary retry both get past it.
    control.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_ID, revision: 4n }],
      deletedSpaceIds: [],
    });
    session.retry();
    await waitFor(
      session.getState,
      session.subscribe,
      ({ persistence }) => persistence.kind === 'settled',
    );
    expect(session.getState().acknowledgedRevision).toBe(4n);
  });

  it.each([
    {
      result: { kind: 'committed' as const, revisions: [], deletedSpaceIds: [] },
      message: `Commit result omitted the revision for Space ${SPACE_ID}`,
    },
    {
      result: {
        kind: 'committed' as const,
        revisions: [{ spaceId: SPACE_ID, revision: 4n }],
        deletedSpaceIds: [SPACE_ID],
      },
      message: 'Commit result unexpectedly deleted Spaces',
    },
  ])('describes the $message protocol fault precisely', async ({ result, message }) => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult(result);
    const session = openSpaceSession(new MemorySpaceBackend(SPACE_ID, [loaded], control), loaded);

    session.submit(changedTitle('Protocol fault'));
    const state = await waitFor(
      session.getState,
      session.subscribe,
      ({ persistence }) => persistence.kind === 'rejected',
    );

    expect(state.persistence).toEqual({
      kind: 'rejected',
      failure: { kind: 'permanent-failure', code: 'protocol', message },
    });
  });

  it('does not queue an unchanged coordinated working snapshot', () => {
    const control = new MemorySpaceBackendTestControl();
    const managed = openManagedSpaceSession(
      new MemorySpaceBackend(SPACE_ID, [loaded], control),
      loaded,
    );

    managed.prepareCoordinatedCommit(changedTitle('Coordinated'));
    managed.publishCoordinatedCommit();
    managed.session.submit(managed.session.getState().working);
    managed.acknowledgeCoordinatedCommit(4n);

    expect(control.requests).toEqual([]);
    expect(managed.isIdle()).toBe(true);
  });

  it('preserves coordinated aggregate refusal identities in rejected session state', () => {
    const backend = new MemorySpaceBackend(SPACE_ID, [loaded]);
    const managed = openManagedSpaceSession(backend, loaded);

    managed.prepareCoordinatedCommit(changedTitle('Coordinated'));
    managed.publishCoordinatedCommit();
    managed.failCoordinatedCommit({
      kind: 'aggregate-refused',
      errors: [
        { kind: 'ordinary-space-unreferenced', spaceId: SPACE_ID },
        { kind: 'meta-space-missing', metaSpaceId: SPACE_ID },
      ],
    });

    expect(managed.session.getState().persistence).toEqual({
      kind: 'rejected',
      failure: {
        kind: 'aggregate-refused',
        errors: [
          { kind: 'ordinary-space-unreferenced', spaceId: SPACE_ID },
          { kind: 'meta-space-missing', metaSpaceId: SPACE_ID },
        ],
      },
    });
    expect(managed.isIdle()).toBe(true);
  });
});
