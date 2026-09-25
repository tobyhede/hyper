import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { CoordinatedCommit, type CoordinationSpaces } from '../src/coordinated-commit';
import { MemorySpaceBackend, MemorySpaceBackendTestControl } from '../src/memory';
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

  it('records a refused replay on the participants it recovers, and offers Retry again', () => {
    const { commit, managed, replays } = setUp();
    commit.enlist();
    commit.prepare();
    commit.publish();
    commit.settle({ kind: 'permanent-failure', code: 'forbidden' });
    const edited: SpaceSnapshot = {
      ...renamed,
      document: { ...renamed.document, title: 'Edited after rejection' },
    };
    managed.session.submit(edited);
    expect(replays).toHaveLength(1);

    const block = {
      code: 'persistence-recovery-required',
      spaceId: SPACE_ID,
      title: 'Blocking',
      recovery: 'resolve-conflict',
    } as const;
    commit.resumeRecovery(block);

    expect(commit.phase).toBe('failed');
    expect(managed.session.getState()).toMatchObject({
      working: edited,
      persistence: { kind: 'rejected', failure: { code: 'forbidden' }, blocked: block },
    });
    managed.session.retry();
    expect(replays).toHaveLength(2);

    commit.resumeRecovery({ code: 'persistence-read-failed' });
    expect(managed.session.getState().persistence).toMatchObject({
      blocked: { code: 'persistence-read-failed' },
    });
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

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');

const spaceNamed = (id: UUID, title: string): SpaceSnapshot => ({
  ...snapshot,
  id,
  document: { ...snapshot.document, title },
});

/**
 * Real managed sessions for Meta and a second stored Space, with a
 * `CoordinationSpaces` that records what a commit does to the registry's
 * holdings: provisional entries, uncommitted creates and evictions.
 */
const setUpParticipants = () => {
  const control = new MemorySpaceBackendTestControl();
  const metaLoaded = { snapshot, revision: 3n, exportedRevision: null };
  const otherLoaded = {
    snapshot: spaceNamed(OTHER_ID, 'Other'),
    revision: 5n,
    exportedRevision: null,
  };
  const backend = new MemorySpaceBackend(SPACE_ID, [metaLoaded, otherLoaded], control);
  const sessions = new Map<UUID, ManagedSpaceSession>([
    [SPACE_ID, openManagedSpaceSession(backend, metaLoaded)],
    [OTHER_ID, openManagedSpaceSession(backend, otherLoaded)],
  ]);
  const provisional = new Set<UUID>();
  const uncommitted = new Set<UUID>();
  const evicted: UUID[] = [];
  const spaces: CoordinationSpaces = {
    ...setUp().spaces,
    session: (id) => sessions.get(id),
    isUncommittedCreate: (id) => uncommitted.has(id),
    openCreated: (created) => {
      const managed = openManagedSpaceSession(backend, {
        snapshot: created,
        revision: 0n,
        exportedRevision: null,
      });
      sessions.set(created.id, managed);
      uncommitted.add(created.id);
      return managed;
    },
    markUncommittedCreate: (id) => {
      uncommitted.add(id);
    },
    holdProvisional: (held) => {
      provisional.add(held.id);
    },
    dropProvisional: (id) => {
      provisional.delete(id);
    },
    evict: (id) => {
      evicted.push(id);
      sessions.delete(id);
    },
  };
  const replays: unknown[] = [];
  const participant = (id: UUID): ManagedSpaceSession => {
    const managed = sessions.get(id);
    if (managed === undefined) throw new Error(`Space ${id} has no session`);
    return managed;
  };
  const states = () =>
    new Map([...sessions].map(([id, managed]) => [id, managed.session.getState()]));
  return { control, spaces, replays, provisional, uncommitted, evicted, participant, states };
};

describe('CoordinatedCommit preparation, settlement and illegal moves', () => {
  it('unwinds a preparation that throws part-way through, and leaves the rest untouched', async () => {
    const { control, spaces, replays, provisional, participant } = setUpParticipants();
    const target = spaceNamed(TARGET_ID, 'Target');
    const renamedOther = spaceNamed(OTHER_ID, 'Other renamed');
    // Meta has an ordinary commit in flight, so preparing it throws.
    const releaseMetaCommit = control.deferNextCommit();
    const meta = participant(SPACE_ID);
    meta.session.submit(spaceNamed(SPACE_ID, 'Ordinary edit'));
    const other = participant(OTHER_ID);
    const otherBefore = other.session.getState();

    const commit = new CoordinatedCommit(
      [
        { kind: 'create', snapshot: target },
        { kind: 'update', spaceId: SPACE_ID, snapshot: renamed },
        { kind: 'update', spaceId: OTHER_ID, snapshot: renamedOther },
      ],
      spaces,
      (items) => {
        replays.push(items);
      },
    );
    commit.enlist();
    expect([...provisional]).toEqual([TARGET_ID]);
    const created = participant(TARGET_ID);
    const cause = new Error('Space session is already committing');
    expect(() => {
      commit.prepare();
    }).toThrow(cause.message);
    expect(commit.phase).toBe('enlisted');
    commit.unwind(cause);

    // The participant that began is out of coordination, rejected, and holds
    // the recovery; its provisional entry is gone.
    expect(commit.phase).toBe('unwound');
    expect(created.isIdle()).toBe(true);
    expect(created.session.getState()).toMatchObject({
      working: target,
      persistence: {
        kind: 'rejected',
        failure: { code: 'protocol', fault: { kind: 'coordinated-commit-threw', cause } },
      },
    });
    expect(provisional.size).toBe(0);

    // Meta never began: it keeps its own commit and working Space.
    expect(meta.session.getState()).toMatchObject({
      working: { document: { title: 'Ordinary edit' } },
      acknowledgedRevision: 3n,
      persistence: { kind: 'pending' },
    });
    // Other was never reached: its state is the very one it held before.
    expect(other.session.getState()).toBe(otherBefore);
    expect(other.isIdle()).toBe(true);

    releaseMetaCommit();
    await meta.waitForIdle();
    expect(meta.session.getState()).toMatchObject({
      working: { document: { title: 'Ordinary edit' } },
      acknowledgedRevision: 4n,
      persistence: { kind: 'settled' },
    });
    // Neither untouched participant was handed the commit's recovery.
    meta.session.retry();
    other.session.submit(renamedOther);
    await other.waitForIdle();
    expect(other.session.getState().persistence.kind).toBe('settled');
    expect(replays).toEqual([]);

    // The begun participant's recovery replays the whole Edit, once.
    created.session.submit(created.session.getState().working);
    created.session.submit(created.session.getState().working);
    expect(commit.phase).toBe('recovering');
    expect(replays).toEqual([
      [
        { kind: 'create', snapshot: target },
        { kind: 'update', spaceId: SPACE_ID },
        { kind: 'update', spaceId: OTHER_ID },
      ],
    ]);
  });

  it.each([
    {
      answer: 'an unrequested revision',
      revisions: [SPACE_ID, TARGET_ID, OTHER_ID],
      deleted: [OTHER_ID],
      omitted: [],
    },
    {
      answer: 'a duplicated revision',
      revisions: [SPACE_ID, SPACE_ID, TARGET_ID],
      deleted: [OTHER_ID],
      omitted: [],
    },
    {
      answer: 'a duplicated deletion',
      revisions: [SPACE_ID, TARGET_ID],
      deleted: [OTHER_ID, OTHER_ID],
      omitted: [],
    },
    {
      answer: 'an omitted deletion',
      revisions: [SPACE_ID, TARGET_ID],
      deleted: [],
      omitted: [OTHER_ID],
    },
    {
      answer: 'a deletion answered as a revision',
      revisions: [SPACE_ID, TARGET_ID, OTHER_ID],
      deleted: [],
      omitted: [OTHER_ID],
    },
    {
      answer: 'a revision answered as a deletion',
      revisions: [TARGET_ID],
      deleted: [OTHER_ID, SPACE_ID],
      omitted: [SPACE_ID],
    },
  ])(
    'acknowledges and evicts nothing for a committed answer with $answer',
    ({ revisions, deleted, omitted }) => {
      const { spaces, replays, provisional, uncommitted, evicted, participant, states } =
        setUpParticipants();
      const commit = new CoordinatedCommit(
        [
          { kind: 'create', snapshot: spaceNamed(TARGET_ID, 'Target') },
          { kind: 'update', spaceId: SPACE_ID, snapshot: renamed },
          { kind: 'delete', spaceId: OTHER_ID },
        ],
        spaces,
        (items) => {
          replays.push(items);
        },
      );
      commit.enlist();
      commit.prepare();
      commit.publish();
      commit.settle({
        kind: 'committed',
        revisions: revisions.map((spaceId, index) => ({ spaceId, revision: BigInt(10 + index) })),
        deletedSpaceIds: deleted,
      });

      expect(commit.phase).toBe('failed');
      expect(evicted).toEqual([]);
      expect([...uncommitted]).toEqual([TARGET_ID]);
      expect(provisional.size).toBe(0);
      for (const [id, state] of states()) {
        expect(participant(id).isIdle()).toBe(true);
        expect(state.persistence).toEqual({
          kind: 'rejected',
          failure: {
            kind: 'permanent-failure',
            code: 'protocol',
            fault: { kind: 'coordinated-result-malformed', omittedSpaceIds: omitted },
          },
        });
      }
      expect(participant(SPACE_ID).session.getState().acknowledgedRevision).toBe(3n);
      expect(participant(OTHER_ID).session.getState().acknowledgedRevision).toBe(5n);
      expect(participant(TARGET_ID).session.getState().acknowledgedRevision).toBe(0n);

      participant(OTHER_ID).session.submit(participant(OTHER_ID).session.getState().working);
      expect(replays).toEqual([
        [
          { kind: 'create', snapshot: spaceNamed(TARGET_ID, 'Target') },
          { kind: 'update', spaceId: SPACE_ID },
          { kind: 'delete', spaceId: OTHER_ID },
        ],
      ]);
    },
  );

  it('keeps recovery with the predecessor when preparing its replay throws part-way', () => {
    const { spaces, replays, participant } = setUpParticipants();
    const renamedOther = spaceNamed(OTHER_ID, 'Other renamed');
    const changes = [
      { kind: 'update', spaceId: SPACE_ID, snapshot: renamed },
      { kind: 'update', spaceId: OTHER_ID, snapshot: renamedOther },
    ] as const;
    const predecessor = new CoordinatedCommit(changes, spaces, (items) => {
      replays.push(items);
    });
    predecessor.enlist();
    predecessor.prepare();
    predecessor.publish();
    predecessor.settle({ kind: 'retryable-failure', code: 'network' });
    participant(SPACE_ID).session.retry();
    expect(predecessor.phase).toBe('recovering');

    const cause = new Error('Space session is already committing');
    const other = participant(OTHER_ID);
    const replay = new CoordinatedCommit(
      changes,
      {
        ...spaces,
        session: (id) =>
          id === OTHER_ID
            ? {
                ...other,
                prepareCoordinatedCommit: () => {
                  throw cause;
                },
              }
            : spaces.session(id),
      },
      () => undefined,
      predecessor,
    );
    replay.enlist();
    expect(() => {
      replay.prepare();
    }).toThrow(cause.message);
    replay.unwind(cause);
    predecessor.resumeRecovery();

    // Other was never reached by the replay, so its recovery is still live.
    expect(predecessor.phase).toBe('failed');
    expect(other.session.getState().persistence.kind).toBe('failed');
    other.session.retry();
    expect(replays).toHaveLength(2);
  });

  it('changes no participant when a public move is refused', () => {
    const { spaces, replays, provisional, uncommitted, evicted, states, participant } =
      setUpParticipants();
    const commit = new CoordinatedCommit(
      [
        { kind: 'create', snapshot: spaceNamed(TARGET_ID, 'Target') },
        { kind: 'update', spaceId: SPACE_ID, snapshot: renamed },
      ],
      spaces,
      (items) => {
        replays.push(items);
      },
    );
    const holdings = () => ({
      provisional: [...provisional],
      uncommitted: [...uncommitted],
      evicted: [...evicted],
      replays: replays.length,
    });
    const refuses = (move: () => void, message: string): void => {
      const before = states();
      const held = holdings();
      const phase = commit.phase;
      expect(move).toThrow(message);
      expect(commit.phase).toBe(phase);
      expect(holdings()).toEqual(held);
      const after = states();
      expect([...after.keys()]).toEqual([...before.keys()]);
      for (const [id, state] of before) expect(after.get(id)).toBe(state);
    };

    refuses(() => {
      commit.settle({ kind: 'retryable-failure', code: 'network' });
    }, 'cannot move from planned to failed');
    refuses(() => {
      commit.resumeRecovery();
    }, 'is planned, not recovering');
    commit.enlist();
    commit.prepare();
    refuses(() => {
      commit.settle({
        kind: 'committed',
        revisions: [
          { spaceId: TARGET_ID, revision: 0n },
          { spaceId: SPACE_ID, revision: 4n },
        ],
        deletedSpaceIds: [],
      });
    }, 'cannot move from prepared to committed');
    refuses(() => {
      commit.settle({ kind: 'conflict', conflicts: [] });
    }, 'cannot move from prepared to conflicted');
    refuses(() => {
      commit.prepare();
    }, 'is prepared, not enlisted');
    commit.publish();
    commit.settle({ kind: 'retryable-failure', code: 'network' });
    refuses(() => {
      commit.settle({ kind: 'retryable-failure', code: 'network' });
    }, 'cannot move from failed to failed');
    refuses(() => {
      commit.unwind(new Error('late'));
    }, 'cannot move from failed to unwound');
    refuses(() => {
      commit.resumeRecovery();
    }, 'is failed, not recovering');
    participant(SPACE_ID).session.retry();
    expect(commit.phase).toBe('recovering');
    // Only the replay's end leaves `recovering`.
    refuses(() => {
      commit.settle({ kind: 'retryable-failure', code: 'network' });
    }, 'cannot move from recovering to failed');
    refuses(() => {
      commit.settle({ kind: 'conflict', conflicts: [] });
    }, 'cannot move from recovering to conflicted');
    refuses(() => {
      commit.unwind(new Error('late'));
    }, 'cannot move from recovering to unwound');
  });
});
