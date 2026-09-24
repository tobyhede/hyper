import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { CoordinatedCommit, type CoordinationSpaces } from '../src/coordinated-commit';
import { MemorySpaceBackend } from '../src/memory';
import { openManagedSpaceSession, type ManagedSpaceSession } from '../src/session';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Meta',
    defaultMap: MAP_ID,
    maps: [
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: GRAPH_ID,
      },
    ],
  },
  resources: [],
};

const renamed: SpaceSnapshot = {
  ...snapshot,
  document: { ...snapshot.document, title: 'Renamed' },
};

/** One live Space and a record of every replay a recovery asks for. */
const setUp = () => {
  const loaded = { snapshot, revision: 3n, exportedRevision: null };
  const managed: ManagedSpaceSession = openManagedSpaceSession(
    new MemorySpaceBackend(SPACE_ID, [loaded]),
    loaded,
  );
  const evicted: UUID[] = [];
  const spaces: CoordinationSpaces = {
    session: (id) => (id === SPACE_ID ? managed : undefined),
    isUncommittedCreate: () => false,
    openCreated: () => {
      throw new Error('no Space is created here');
    },
    markUncommittedCreate: () => undefined,
    holdProvisional: () => undefined,
    dropProvisional: () => undefined,
    clearUncommittedCreate: () => undefined,
    evict: (id) => {
      evicted.push(id);
    },
  };
  const replays: unknown[] = [];
  const commit = new CoordinatedCommit(
    [{ kind: 'update', spaceId: SPACE_ID, snapshot: renamed }],
    spaces,
    (items) => {
      replays.push(items);
    },
  );
  return { commit, managed, replays, evicted, spaces };
};

describe('CoordinatedCommit', () => {
  it('builds the request from the plan and the participant it names', () => {
    const { commit } = setUp();
    expect(commit.phase).toBe('planned');
    expect(commit.request).toEqual([
      { kind: 'update', spaceId: SPACE_ID, snapshot: renamed, expectedRevision: 3n },
    ]);
  });

  it('moves through its phases to committed', () => {
    const { commit, managed } = setUp();
    commit.enlist();
    expect(commit.phase).toBe('enlisted');
    commit.prepare();
    expect(commit.phase).toBe('prepared');
    commit.publish();
    expect(commit.phase).toBe('published');
    commit.settle({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_ID, revision: 4n }],
      deletedSpaceIds: [],
    });
    expect(commit.phase).toBe('committed');
    expect(managed.session.getState()).toMatchObject({
      working: renamed,
      acknowledgedRevision: 4n,
      persistence: { kind: 'settled' },
    });
  });

  it('refuses every move its current phase does not allow', () => {
    const { commit } = setUp();
    expect(() => {
      commit.publish();
    }).toThrow('cannot move from planned to published');
    expect(() => {
      commit.prepare();
    }).toThrow('is planned, not enlisted');
    expect(() => {
      commit.unwind(new Error('early'));
    }).toThrow('cannot move from planned to unwound');
    commit.enlist();
    expect(() => {
      commit.enlist();
    }).toThrow('cannot move from enlisted to enlisted');
    expect(() => {
      commit.settle({ kind: 'retryable-failure', code: 'network' });
    }).toThrow('cannot move from enlisted to failed');
  });

  it('unwinds a throw in one move, leaving the participant one pending recovery at a time', () => {
    const { commit, managed, replays } = setUp();
    commit.enlist();
    commit.prepare();
    commit.publish();
    const cause = new Error('transport exploded');
    commit.unwind(cause);

    expect(commit.phase).toBe('unwound');
    expect(managed.session.getState().persistence).toMatchObject({
      kind: 'rejected',
      failure: { code: 'protocol', fault: { kind: 'coordinated-commit-threw', cause } },
    });
    expect(() => {
      commit.unwind(cause);
    }).toThrow('cannot move from unwound to unwound');

    managed.session.submit(managed.session.getState().working);
    managed.session.submit(managed.session.getState().working);
    expect(commit.phase).toBe('recovering');
    expect(replays).toEqual([[{ kind: 'update', spaceId: SPACE_ID }]]);

    // The replay ended without enlisting, so the same recovery is usable again.
    commit.resumeRecovery();
    expect(commit.phase).toBe('unwound');
    expect(managed.session.getState().persistence.kind).toBe('rejected');
    managed.session.submit(managed.session.getState().working);
    expect(replays).toHaveLength(2);
  });

  it('hands recovery over to the replay that prepares, which then ignores resuming', () => {
    const { commit, managed, replays, spaces } = setUp();
    commit.enlist();
    commit.prepare();
    commit.publish();
    commit.settle({ kind: 'retryable-failure', code: 'network' });
    const successor = new CoordinatedCommit(
      [{ kind: 'update', spaceId: SPACE_ID, snapshot: renamed }],
      spaces,
      () => undefined,
      commit,
    );

    managed.session.retry();
    expect(commit.phase).toBe('recovering');
    successor.enlist();
    expect(commit.phase).toBe('recovering');
    successor.prepare();
    expect(commit.phase).toBe('recovered');
    commit.resumeRecovery();
    expect(commit.phase).toBe('recovered');
    managed.session.retry();
    expect(replays).toHaveLength(1);
  });

  it('accepts the stored side of a conflict by restoring the Space it names', () => {
    const { commit, managed, replays } = setUp();
    commit.enlist();
    commit.prepare();
    commit.publish();
    commit.settle({
      kind: 'conflict',
      conflicts: [
        { spaceId: SPACE_ID, current: { snapshot, revision: 9n, exportedRevision: null } },
      ],
    });
    expect(commit.phase).toBe('conflicted');

    managed.session.acceptRemote();
    expect(commit.phase).toBe('recovered');
    expect(managed.session.getState()).toMatchObject({
      working: snapshot,
      acknowledgedRevision: 9n,
      persistence: { kind: 'settled' },
    });
    expect(replays).toEqual([]);
  });

  it('completes a deleted participant the conflict reports absent when keeping local work', () => {
    const loaded = { snapshot, revision: 3n, exportedRevision: null };
    const managed = openManagedSpaceSession(new MemorySpaceBackend(SPACE_ID, [loaded]), loaded);
    const evicted: UUID[] = [];
    const replays: unknown[] = [];
    const commit = new CoordinatedCommit(
      [{ kind: 'delete', spaceId: SPACE_ID }],
      {
        session: () => managed,
        isUncommittedCreate: () => false,
        openCreated: () => managed,
        markUncommittedCreate: () => undefined,
        holdProvisional: () => undefined,
        dropProvisional: () => undefined,
        clearUncommittedCreate: () => undefined,
        evict: (id) => {
          evicted.push(id);
        },
      },
      (items) => {
        replays.push(items);
      },
    );
    commit.enlist();
    commit.prepare();
    commit.publish();
    commit.settle({ kind: 'conflict', conflicts: [{ spaceId: SPACE_ID, current: undefined }] });

    managed.session.resolveConflict(snapshot);
    expect(evicted).toEqual([SPACE_ID]);
    expect(replays).toEqual([]);
  });
});
