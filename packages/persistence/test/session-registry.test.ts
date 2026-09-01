import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import type {
  CommitResult,
  LoadedAggregate,
  LoadedSpace,
  SpaceBackend,
  SpaceCommit,
  SpaceSummary,
} from '../src/backend';
import { createSpaceSessionRegistry } from '../src/session-registry';

const SPACE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const SPACE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const SPACE_C = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const loaded = (id = SPACE_A, revision = 3n): LoadedSpace => ({
  snapshot: {
    id,
    document: { version: 1, title: `Space ${id}` },
    cards: [{ id: CARD_A, document: { title: 'A', kind: 'markdown', body: '' } }],
  },
  revision,
  exportedRevision: null,
});

class StubBackend implements SpaceBackend {
  readonly requests: SpaceCommit[] = [];
  result: CommitResult = { kind: 'committed', revisions: [], deletedSpaceIds: [] };
  readonly #queuedResults: CommitResult[] = [];
  #gate: Promise<void> | undefined;
  #release: (() => void) | undefined;

  deferNextCommit(): () => void {
    this.#gate = new Promise((resolve) => {
      this.#release = resolve;
    });
    return () => this.#release?.();
  }

  queueResult(result: CommitResult): void {
    this.#queuedResults.push(result);
  }

  throwOnNextCommit = false;
  listSpaces(): Promise<readonly SpaceSummary[]> {
    return Promise.resolve([]);
  }
  loadSpace(): Promise<LoadedSpace | undefined> {
    return Promise.resolve(undefined);
  }
  loadAggregate(): Promise<LoadedAggregate> {
    return Promise.resolve({ metaSpaceId: SPACE_A, spaces: [] });
  }
  async commit(request: SpaceCommit): Promise<CommitResult> {
    this.requests.push(structuredClone(request));
    await this.#gate;
    this.#gate = undefined;
    if (this.throwOnNextCommit) {
      this.throwOnNextCommit = false;
      throw new Error('backend exploded');
    }
    return structuredClone(this.#queuedResults.shift() ?? this.result);
  }
}

describe('Space session registry', () => {
  it('owns one live session for each Space id', () => {
    const registry = createSpaceSessionRegistry(new StubBackend());
    const first = registry.open(loaded());

    expect(registry.open(loaded(SPACE_A, 9n))).toBe(first);
    expect(registry.session(SPACE_A)).toBe(first);
  });

  it('installs one atomic create, update and delete result across its entries', async () => {
    const backend = new StubBackend();
    const release = backend.deferNextCommit();
    backend.result = {
      kind: 'committed',
      revisions: [
        { spaceId: SPACE_A, revision: 4n },
        { spaceId: SPACE_C, revision: 1n },
      ],
      deletedSpaceIds: [SPACE_B],
    };
    const registry = createSpaceSessionRegistry(backend);
    const sessionA = registry.open(loaded(SPACE_A));
    const sessionB = registry.open(loaded(SPACE_B, 8n));
    const updatedA = structuredClone(sessionA.getState().working);
    updatedA.document.title = 'Updated A';
    const createdC = loaded(SPACE_C, 0n).snapshot;

    const committing = registry.submit([
      { kind: 'update', spaceId: SPACE_A, edit: () => updatedA },
      { kind: 'create', snapshot: createdC },
      { kind: 'delete', spaceId: SPACE_B },
    ]);

    expect(registry.entry(SPACE_C)).toEqual({ kind: 'provisional', snapshot: createdC });
    expect(sessionA.getState().persistence.kind).toBe('pending');
    expect(sessionB.getState().persistence.kind).toBe('pending');
    release();
    await expect(committing).resolves.toEqual(backend.result);

    expect(sessionA.getState()).toMatchObject({
      working: { document: { title: 'Updated A' } },
      acknowledgedRevision: 4n,
      persistence: { kind: 'settled' },
    });
    expect(registry.session(SPACE_B)).toBeUndefined();
    expect(registry.session(SPACE_C)?.getState()).toMatchObject({
      working: createdC,
      acknowledgedRevision: 1n,
      persistence: { kind: 'settled' },
    });
    expect(backend.requests).toEqual([
      {
        changes: [
          { kind: 'update', spaceId: SPACE_A, snapshot: updatedA, expectedRevision: 3n },
          { kind: 'create', spaceId: SPACE_C, snapshot: createdC },
          { kind: 'delete', spaceId: SPACE_B, expectedRevision: 8n },
        ],
      },
    ]);
  });

  it('waits for a participating session commit before deriving its coordinated update', async () => {
    const backend = new StubBackend();
    const release = backend.deferNextCommit();
    backend.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_A, revision: 4n }],
      deletedSpaceIds: [],
    });
    backend.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_A, revision: 5n }],
      deletedSpaceIds: [],
    });
    const registry = createSpaceSessionRegistry(backend);
    const session = registry.open(loaded());
    const first = structuredClone(session.getState().working);
    first.document.title = 'Singleton first';
    session.submit(first);
    const coordinated = structuredClone(first);
    coordinated.document.title = 'Coordinated second';

    const committing = registry.submit([
      { kind: 'update', spaceId: SPACE_A, edit: () => coordinated },
    ]);
    expect(backend.requests).toHaveLength(1);
    release();
    await committing;

    expect(backend.requests).toHaveLength(2);
    expect(backend.requests[1]?.changes).toEqual([
      {
        kind: 'update',
        spaceId: SPACE_A,
        snapshot: coordinated,
        expectedRevision: 4n,
      },
    ]);
    expect(session.getState()).toMatchObject({
      working: { document: { title: 'Coordinated second' } },
      acknowledgedRevision: 5n,
      persistence: { kind: 'settled' },
    });
  });

  it('persists an edit queued while a coordinated commit is pending', async () => {
    const backend = new StubBackend();
    const release = backend.deferNextCommit();
    backend.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_A, revision: 4n }],
      deletedSpaceIds: [],
    });
    backend.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_A, revision: 5n }],
      deletedSpaceIds: [],
    });
    const registry = createSpaceSessionRegistry(backend);
    const session = registry.open(loaded());
    const coordinated = structuredClone(session.getState().working);
    coordinated.document.title = 'Coordinated';
    const committing = registry.submit([
      { kind: 'update', spaceId: SPACE_A, edit: () => coordinated },
    ]);
    const queued = structuredClone(coordinated);
    queued.document.title = 'Queued afterward';
    session.submit(queued);

    release();
    await committing;
    await new Promise<void>((resolve) => {
      if (session.getState().persistence.kind === 'settled') resolve();
      else {
        const unsubscribe = session.subscribe(() => {
          if (session.getState().persistence.kind !== 'settled') return;
          unsubscribe();
          resolve();
        });
      }
    });

    expect(backend.requests).toHaveLength(2);
    expect(session.getState()).toMatchObject({
      working: { document: { title: 'Queued afterward' } },
      acknowledgedRevision: 5n,
    });
  });

  it('conflicts every existing participant and retains a deletion when any change conflicts', async () => {
    const backend = new StubBackend();
    const remoteA = loaded(SPACE_A, 7n);
    backend.result = {
      kind: 'conflict',
      conflicts: [{ spaceId: SPACE_A, current: remoteA }],
    };
    const registry = createSpaceSessionRegistry(backend);
    const sessionA = registry.open(loaded(SPACE_A));
    const sessionB = registry.open(loaded(SPACE_B, 8n));
    const updatedA = structuredClone(sessionA.getState().working);
    updatedA.document.title = 'Local A';

    await registry.submit([
      { kind: 'update', spaceId: SPACE_A, edit: () => updatedA },
      { kind: 'delete', spaceId: SPACE_B },
    ]);

    expect(sessionA.getState().persistence).toEqual({ kind: 'conflicted', current: remoteA });
    expect(sessionB.getState().persistence).toEqual({ kind: 'conflicted', current: undefined });
    expect(registry.session(SPACE_B)).toBe(sessionB);
  });

  it('lets a participant with no remote snapshot keep its local work and retry', async () => {
    const backend = new StubBackend();
    backend.queueResult({
      kind: 'conflict',
      conflicts: [{ spaceId: SPACE_A, current: loaded(SPACE_A, 7n) }],
    });
    const registry = createSpaceSessionRegistry(backend);
    const sessionA = registry.open(loaded(SPACE_A));
    const sessionB = registry.open(loaded(SPACE_B, 8n));
    const updatedA = structuredClone(sessionA.getState().working);
    updatedA.document.title = 'Local A';

    await registry.submit([
      { kind: 'update', spaceId: SPACE_A, edit: () => updatedA },
      { kind: 'delete', spaceId: SPACE_B },
    ]);
    expect(sessionB.getState().persistence).toEqual({ kind: 'conflicted', current: undefined });

    // Nothing remote came back for B, so its own revision is still the newest
    // it knows. Keeping local work has to re-commit against that, or the
    // non-dismissable conflict dialog has no exit at all.
    backend.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_B, revision: 9n }],
      deletedSpaceIds: [],
    });
    sessionB.resolveConflict(sessionB.getState().working);
    await vi.waitFor(() => expect(sessionB.getState().persistence).toEqual({ kind: 'settled' }));

    expect(backend.requests.at(-1)).toEqual({
      changes: [
        {
          kind: 'update',
          spaceId: SPACE_B,
          snapshot: sessionB.getState().working,
          expectedRevision: 8n,
        },
      ],
    });
    expect(sessionB.getState().acknowledgedRevision).toBe(9n);
  });

  /*
   * Every participant is already `coordinating` and every create already
   * provisional by the time the backend is called, and only a *returned* result
   * unwinds that. A throw has to unwind it too: left as it was, `coordinating`
   * never clears, so `submit`, `retry` and `resolveConflict` all early-return
   * for the rest of the session and those Spaces can never save again.
   */
  it('restores every participant and provisional create when the commit throws', async () => {
    const backend = new StubBackend();
    const registry = createSpaceSessionRegistry(backend);
    const sessionA = registry.open(loaded(SPACE_A));
    registry.open(loaded(SPACE_B, 8n));
    const created = loaded(SPACE_C, 0n).snapshot;
    backend.throwOnNextCommit = true;

    await expect(
      registry.submit([
        { kind: 'update', spaceId: SPACE_A, edit: (current) => current },
        { kind: 'update', spaceId: SPACE_B, edit: (current) => current },
        { kind: 'create', snapshot: created },
      ]),
    ).rejects.toThrow('backend exploded');

    expect(registry.entry(SPACE_C)).toBeUndefined();
    backend.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_A, revision: 4n }],
      deletedSpaceIds: [],
    });
    sessionA.submit({
      ...sessionA.getState().working,
      document: { ...sessionA.getState().working.document, title: 'A saves again' },
    });
    await vi.waitFor(() => expect(sessionA.getState().acknowledgedRevision).toBe(4n));
    expect(sessionA.getState().persistence).toEqual({ kind: 'settled' });
  });

  /*
   * The wait for a participant's in-flight commit is a real suspension point,
   * and edits made in it commit through the ordinary path first. A coordinated
   * update derived before the wait would be stored over them — the newer text
   * is already acknowledged, so nothing conflicts and the loss is silent.
   */
  it('applies a coordinated update to edits made while it waited', async () => {
    const backend = new StubBackend();
    const registry = createSpaceSessionRegistry(backend);
    const session = registry.open(loaded(SPACE_A));

    const release = backend.deferNextCommit();
    backend.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_A, revision: 4n }],
      deletedSpaceIds: [],
    });
    session.submit({
      ...session.getState().working,
      document: { ...session.getState().working.document, title: 'First' },
    });

    const coordinated = registry.submit([
      {
        kind: 'update',
        spaceId: SPACE_A,
        edit: (current) => ({
          ...current,
          cards: [
            ...current.cards,
            { id: SPACE_B, document: { title: 'Added', kind: 'markdown', body: '' } },
          ],
        }),
      },
    ]);

    // Lands during the wait and commits ahead of the coordinated change.
    session.submit({
      ...session.getState().working,
      document: { ...session.getState().working.document, title: 'Typed while waiting' },
    });
    backend.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_A, revision: 5n }],
      deletedSpaceIds: [],
    });
    backend.queueResult({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_A, revision: 6n }],
      deletedSpaceIds: [],
    });
    release();

    await coordinated;
    expect(session.getState().working.document.title).toBe('Typed while waiting');
    expect(session.getState().working.cards).toHaveLength(2);
  });

  it('removes a provisional create when the atomic commit fails', async () => {
    const backend = new StubBackend();
    backend.result = {
      kind: 'permanent-failure',
      code: 'invalid-commit',
      message: 'refused',
    };
    const registry = createSpaceSessionRegistry(backend);
    const created = loaded(SPACE_C, 0n).snapshot;

    await registry.submit([{ kind: 'create', snapshot: created }]);

    expect(registry.entry(SPACE_C)).toBeUndefined();
  });

  it('refuses duplicate participants, missing sessions, and creates over a live session', async () => {
    const registry = createSpaceSessionRegistry(new StubBackend());
    registry.open(loaded());

    await expect(
      registry.submit([
        { kind: 'delete', spaceId: SPACE_A },
        { kind: 'update', spaceId: SPACE_A, edit: () => loaded().snapshot },
      ]),
    ).rejects.toThrow('only once');
    await expect(registry.submit([{ kind: 'delete', spaceId: SPACE_B }])).rejects.toThrow(
      'no live session',
    );
    await expect(
      registry.submit([{ kind: 'create', snapshot: loaded().snapshot }]),
    ).rejects.toThrow('already has a live session');
  });

  it('validates every participant before installing a provisional create', async () => {
    const backend = new StubBackend();
    const registry = createSpaceSessionRegistry(backend);
    const created = loaded(SPACE_C, 0n).snapshot;

    await expect(
      registry.submit([
        { kind: 'create', snapshot: created },
        { kind: 'delete', spaceId: SPACE_B },
      ]),
    ).rejects.toThrow(`Space ${SPACE_B} has no live session`);

    expect(registry.entry(SPACE_C)).toBeUndefined();
    expect(backend.requests).toEqual([]);
  });

  it('turns malformed coordinated success into a protocol rejection', async () => {
    const backend = new StubBackend();
    const registry = createSpaceSessionRegistry(backend);
    const session = registry.open(loaded());

    await expect(
      registry.submit([{ kind: 'update', spaceId: SPACE_A, edit: (current) => current }]),
    ).resolves.toEqual({
      kind: 'permanent-failure',
      code: 'protocol',
      message: 'Commit result omitted a coordinated Space result',
    });
    expect(session.getState().persistence).toMatchObject({
      kind: 'rejected',
      failure: { code: 'protocol' },
    });
  });

  it.each([
    {
      result: { kind: 'retryable-failure', code: 'network', message: 'offline' } as const,
      persistence: 'failed',
    },
    {
      result: {
        kind: 'aggregate-refused',
        errors: [{ kind: 'meta-space-missing', metaSpaceId: SPACE_A }],
      } as const,
      persistence: 'rejected',
    },
  ])('installs a $result.kind coordinated failure', async ({ result, persistence }) => {
    const backend = new StubBackend();
    backend.result = result;
    const registry = createSpaceSessionRegistry(backend);
    const session = registry.open(loaded());

    await registry.submit([{ kind: 'update', spaceId: SPACE_A, edit: (current) => current }]);

    expect(session.getState().persistence.kind).toBe(persistence);
  });
});
