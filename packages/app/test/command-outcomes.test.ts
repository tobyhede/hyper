import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import {
  COMMAND_BROKE,
  type CommandChannel,
  type CommandNotice,
  type MapCommandResult,
} from '../src/command-outcomes';
import { composeApp } from '../src/compose-app';
import type { CoordinatedContextDeleteResult } from '../src/coordinated-context-delete';
import type { AuthoringResult } from '../src/space-authoring';
import type {
  SpaceResourceCreationResult,
  SpaceResourceDeletionResult,
} from '../src/space-resource-lifecycle';
import { openTestSpace } from './opened-space';

/**
 * Command outcomes through its interface, over a real composition: a real
 * Navigation moves the Map, real Space Authoring moves the replacement epoch,
 * and every operation is a fake whose settlement the test decides.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_A = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const GRAPH_B = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const MAP_A = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const MAP_B = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const CREATED = uuidSchema.parse('00000000-0000-4000-8000-000000000031');

const EDGE = { from: RESOURCE_A, to: RESOURCE_B } as const;

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_A,
        title: 'Map A',
        kind: 'positioned',
        positions: {
          [RESOURCE_A]: { x: 10, y: 20, open: false },
          [RESOURCE_B]: { x: 300, y: 40, open: false },
        },
        graphs: [{ id: GRAPH_A, title: 'Main', edges: [EDGE] }],
      },
      {
        id: MAP_B,
        title: 'Map B',
        kind: 'positioned',
        positions: { [RESOURCE_A]: { x: 10, y: 20, open: false } },
        graphs: [{ id: GRAPH_B, title: 'Other', edges: [] }],
      },
    ],
    defaultMap: MAP_A,
  },
  resources: [
    { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: RESOURCE_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

/** A stored revision ahead of the loaded one, so the first commit conflicts. */
function open(storedRevision = 0n) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const backend = MemorySpaceBackend.asMeta({
    snapshot: { ...snapshot, document: { ...snapshot.document, title: 'Stored' } },
    revision: storedRevision,
    exportedRevision: null,
  });
  const { spaceSession: session } = openTestSpace(backend, loaded);
  const reported: unknown[] = [];
  const composed = composeApp({
    spaceSession: session,
    selection: MAP_A,
    reportObserverError: (error) => reported.push(error),
  });
  return { session, reported, outcomes: composed.commandOutcomes, ...composed };
}

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (failure: Error) => void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve: ((value: Value) => void) | undefined;
  let reject: ((failure: Error) => void) | undefined;
  const promise = new Promise<Value>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

const refusedAuthoring: AuthoringResult = { kind: 'refused', refusal: { code: 'map-not-found' } };
const refusedDeletion: SpaceResourceDeletionResult = {
  kind: 'refused',
  refusal: { code: 'space-resource-not-found', resourceId: RESOURCE_A },
};
const refusedCreation: SpaceResourceCreationResult = {
  kind: 'refused',
  refusal: { code: 'map-not-found', mapId: MAP_A },
};
const MAP_GONE = 'This Map is no longer part of the Space.';
const mapReport: CommandNotice = { title: 'Map not created', message: 'Try a different name.' };
const refusedMap: MapCommandResult = { kind: 'refused', report: mapReport };
const refusedGraphDelete: CoordinatedContextDeleteResult = {
  kind: 'error',
  message: 'Graph refused.',
};
const completedAuthoring: AuthoringResult = { kind: 'completed' };
const unchangedAuthoring: AuthoringResult = { kind: 'unchanged' };
const queuedAuthoring: AuthoringResult = { kind: 'queued' };

const notice = (outcomes: ReturnType<typeof open>['outcomes'], channel: CommandChannel) =>
  outcomes.getState().notices.get(channel) ?? null;

/** Leave a refusal standing on every channel the table declares. */
async function refuseOnEveryChannel(outcomes: ReturnType<typeof open>['outcomes']): Promise<void> {
  outcomes.run('map-create', () => refusedMap);
  outcomes.run('map-manage', () => refusedMap);
  outcomes.run('map-delete', () => refusedMap);
  outcomes.run('graph-edit', () => refusedAuthoring);
  outcomes.run('graph-delete', () => refusedGraphDelete);
  outcomes.run('resource-delete', () => refusedAuthoring);
  outcomes.run('resource-remove', () => refusedAuthoring);
  outcomes.run('reference-create', () => refusedAuthoring);
  await outcomes.run('space-resource-create', () => Promise.resolve(refusedCreation));
  await outcomes.run(
    'space-open',
    () => Promise.resolve({ kind: 'refused', code: 'space-not-open' } as const),
    { subject: 'Elsewhere' },
  );
}

describe('titles and sentences', () => {
  it('publishes a refused Remove from Map under its own title', () => {
    const { outcomes } = open();

    expect(outcomes.run('resource-remove', () => refusedAuthoring)).toBe(refusedAuthoring);

    expect(notice(outcomes, 'resource-remove')).toEqual({
      title: 'Resource not removed',
      message: MAP_GONE,
    });
    expect(notice(outcomes, 'resource-delete')).toBeNull();
  });

  it('publishes both deletion refusals under "Resource not deleted"', async () => {
    const { outcomes } = open();

    outcomes.run('resource-delete', () => refusedAuthoring);
    expect(notice(outcomes, 'resource-delete')).toEqual({
      title: 'Resource not deleted',
      message: MAP_GONE,
    });

    await outcomes.run('space-resource-delete', () => Promise.resolve(refusedDeletion));
    expect(notice(outcomes, 'resource-delete')).toEqual({
      title: 'Resource not deleted',
      message: 'This Space Resource is no longer part of the Space.',
    });
  });

  it('publishes a refused Graph Edit under "Graph unchanged"', () => {
    const { outcomes } = open();

    expect(outcomes.run('graph-edit', () => refusedAuthoring)).toBe(refusedAuthoring);

    expect(notice(outcomes, 'graph-edit')).toEqual({
      title: 'Graph unchanged',
      message: MAP_GONE,
    });
  });

  it('publishes a refused Reference Resource creation under its own title', () => {
    const { outcomes } = open();

    outcomes.run('reference-create', () => refusedAuthoring);

    expect(notice(outcomes, 'reference-create')).toEqual({
      title: 'Reference Resource not created',
      message: MAP_GONE,
    });
  });

  it('publishes a Map report whole, without describing it', () => {
    const { outcomes } = open();

    outcomes.run('map-create', () => refusedMap);

    expect(notice(outcomes, 'map-create')).toBe(mapReport);
  });

  it('answers the caller the result its operation produced', async () => {
    const { outcomes } = open();
    const completed = { kind: 'completed', resourceId: CREATED } as const;

    await expect(
      outcomes.run('space-resource-create', () => Promise.resolve(completed)),
    ).resolves.toBe(completed);
  });

  it('clears the channel at the press and leaves it clear on completion', () => {
    const { outcomes } = open();
    outcomes.run('resource-remove', () => refusedAuthoring);

    outcomes.run('resource-remove', () => completedAuthoring);

    expect(notice(outcomes, 'resource-remove')).toBeNull();
  });

  it('leaves the channel clear on unchanged and queued', () => {
    const { outcomes } = open();
    outcomes.run('resource-remove', () => refusedAuthoring);
    outcomes.run('resource-remove', () => unchangedAuthoring);
    expect(notice(outcomes, 'resource-remove')).toBeNull();

    outcomes.run('resource-remove', () => refusedAuthoring);
    outcomes.run('resource-remove', () => queuedAuthoring);
    expect(notice(outcomes, 'resource-remove')).toBeNull();
  });
});

describe('the Map-change reset', () => {
  it('clears exactly the channels a Map change resets', async () => {
    const { outcomes, navigation } = open();
    await refuseOnEveryChannel(outcomes);
    expect(outcomes.getState().notices.size).toBe(10);

    navigation.selectMap(MAP_B);

    expect([...outcomes.getState().notices.keys()].sort()).toEqual([
      'reference-create',
      'space-command',
      'space-resource-create',
    ]);
  });

  it('publishes nothing when Navigation moves without changing the Map', () => {
    const { outcomes, navigation } = open();
    outcomes.run('resource-remove', () => refusedAuthoring);
    const before = outcomes.getState();

    navigation.activateGraph(GRAPH_A);

    expect(outcomes.getState()).toBe(before);
  });
});

describe('continueAt', () => {
  it('requests the continuation at the id the operation minted', async () => {
    const { outcomes, continuation } = open();

    await outcomes.run(
      'space-resource-create',
      () => Promise.resolve({ kind: 'completed', resourceId: CREATED } as const),
      {
        continueAt: ({ resourceId }) => ({
          target: { kind: 'resource', resourceId },
          select: true,
          then: 'rename',
        }),
      },
    );

    expect(continuation.getState().pending).toEqual({
      target: { kind: 'resource', resourceId: CREATED },
      select: true,
      then: 'rename',
    });
  });

  it('continues a created Reference Resource at the id Space Authoring minted', () => {
    const { outcomes, continuation } = open();

    outcomes.run('reference-create', () => ({ kind: 'completed', createdResourceId: CREATED }), {
      continueAt: ({ createdResourceId }) =>
        createdResourceId === undefined
          ? null
          : {
              target: { kind: 'resource', resourceId: createdResourceId },
              select: true,
              then: 'rename',
            },
    });

    expect(continuation.getState().pending).toEqual({
      target: { kind: 'resource', resourceId: CREATED },
      select: true,
      then: 'rename',
    });
  });

  it('requests nothing where the completion names nothing to continue at', () => {
    const { outcomes, continuation } = open();

    outcomes.run('reference-create', () => completedAuthoring, { continueAt: () => null });

    expect(continuation.getState().pending).toBeNull();
  });

  it('requests nothing for a Reference Resource creation that did not complete', () => {
    const { outcomes, continuation } = open();
    const continueAt = vi.fn(
      () => ({ target: { kind: 'canvas' }, select: false, then: 'focus' }) as const,
    );

    outcomes.run('reference-create', () => refusedAuthoring, { continueAt });
    outcomes.run('reference-create', () => queuedAuthoring, { continueAt });
    outcomes.run('reference-create', () => unchangedAuthoring, { continueAt });

    expect(continueAt).not.toHaveBeenCalled();
    expect(continuation.getState().pending).toBeNull();
  });

  it('requests nothing on a refusal', async () => {
    const { outcomes, continuation } = open();
    const continueAt = vi.fn(
      () => ({ target: { kind: 'canvas' }, select: false, then: 'focus' }) as const,
    );

    await outcomes.run('space-resource-create', () => Promise.resolve(refusedCreation), {
      continueAt,
    });

    expect(continueAt).not.toHaveBeenCalled();
    expect(continuation.getState().pending).toBeNull();
    expect(notice(outcomes, 'space-resource-create')).toEqual({
      title: 'Space not created',
      message: MAP_GONE,
    });
  });
});

describe('a thrown operation', () => {
  it('reaches the reporter and publishes the break sentence, synchronously', () => {
    const { outcomes, reported } = open();
    const failure = new Error('removal broke');

    const answered = outcomes.run('resource-remove', () => {
      throw failure;
    });

    expect(answered).toBe(COMMAND_BROKE);
    expect(reported).toEqual([failure]);
    expect(notice(outcomes, 'resource-remove')).toEqual({
      title: 'Resource not removed',
      message: 'removal broke',
    });
  });

  it('reaches the reporter and publishes the break sentence, asynchronously', async () => {
    const { outcomes, reported } = open();
    const failure = new Error('coordination broke');

    await expect(
      outcomes.run('space-resource-create', () => Promise.reject(failure)),
    ).resolves.toBe(COMMAND_BROKE);

    expect(reported).toEqual([failure]);
    expect(notice(outcomes, 'space-resource-create')).toEqual({
      title: 'Space not created',
      message: 'This Resource was not created: coordination broke',
    });
  });

  it('says a thrown Graph Edit and Reference Resource creation in the words the failure carries', () => {
    const { outcomes, reported } = open();
    const graphFailure = new Error('recolour broke');
    const referenceFailure = new Error('reference broke');

    outcomes.run('graph-edit', () => {
      throw graphFailure;
    });
    outcomes.run('reference-create', () => {
      throw referenceFailure;
    });

    expect(reported).toEqual([graphFailure, referenceFailure]);
    expect(notice(outcomes, 'graph-edit')).toEqual({
      title: 'Graph unchanged',
      message: 'recolour broke',
    });
    expect(notice(outcomes, 'reference-create')).toEqual({
      title: 'Reference Resource not created',
      message: 'reference broke',
    });
  });

  it('reports a Map command throw and leaves its channel clear', () => {
    const { outcomes, reported } = open();
    const failure = new Error('map broke');

    outcomes.run('map-delete', () => {
      throw failure;
    });

    expect(reported).toEqual([failure]);
    expect(notice(outcomes, 'map-delete')).toBeNull();
  });
});

describe('dismiss', () => {
  it('clears only its channel', () => {
    const { outcomes } = open();
    outcomes.run('resource-remove', () => refusedAuthoring);
    outcomes.run('resource-delete', () => refusedAuthoring);

    outcomes.dismiss('resource-remove');

    expect(notice(outcomes, 'resource-remove')).toBeNull();
    expect(notice(outcomes, 'resource-delete')).not.toBeNull();
  });
});

describe('subject', () => {
  it('reaches the describers that name it', async () => {
    const { outcomes } = open();

    await outcomes.run('space-enter', () => Promise.reject(new Error('no such Space')), {
      subject: 'Target',
    });
    expect(notice(outcomes, 'space-command')).toEqual({
      title: 'Space command failed',
      message: 'Target could not be entered.',
    });

    await outcomes.run('space-exit', () => Promise.reject(new Error('stuck')), {
      subject: 'Target',
    });
    expect(notice(outcomes, 'space-command')?.message).toBe('Target could not be exited.');

    await outcomes.run(
      'space-open',
      () => Promise.resolve({ kind: 'refused', code: 'space-not-open' } as const),
      { subject: 'Elsewhere' },
    );
    expect(notice(outcomes, 'space-command')?.message).toBe('Elsewhere could not be opened.');
  });
});

describe('staleness', () => {
  it('drops a Map-scoped run that settles after the Map changed', async () => {
    const { outcomes, navigation } = open();
    const pending = deferred<AuthoringResult>();
    const running = outcomes.run('resource-delete', () => pending.promise);

    navigation.selectMap(MAP_B);
    pending.resolve(refusedAuthoring);

    await expect(running).resolves.toBe(refusedAuthoring);
    expect(notice(outcomes, 'resource-delete')).toBeNull();
  });

  it('keeps a run on a channel the Map change does not reset', async () => {
    const { outcomes, navigation } = open();
    const pending = deferred<SpaceResourceCreationResult>();
    const running = outcomes.run('space-resource-create', () => pending.promise);

    navigation.selectMap(MAP_B);
    pending.resolve(refusedCreation);
    await running;

    expect(notice(outcomes, 'space-resource-create')?.message).toBe(MAP_GONE);
  });

  it('leaves the newer outcome standing when two runs settle out of order', async () => {
    const { outcomes } = open();
    const older = deferred<SpaceResourceDeletionResult>();
    const newer = deferred<AuthoringResult>();
    const first = outcomes.run('space-resource-delete', () => older.promise);
    const second = outcomes.run('resource-delete', () => newer.promise);

    newer.resolve(refusedAuthoring);
    await second;
    older.resolve(refusedDeletion);
    await first;

    expect(notice(outcomes, 'resource-delete')?.message).toBe(MAP_GONE);
  });

  it('drops a run that settles after the Space was replaced', async () => {
    const { outcomes, authoring, session } = open(1n);
    authoring.complete({ kind: 'deleted-edge', graphId: GRAPH_A, edge: EDGE });
    await vi.waitFor(() => expect(session.getState().persistence.kind).toBe('conflicted'));
    const pending = deferred<AuthoringResult>();
    const running = outcomes.run('resource-delete', () => pending.promise);

    expect(authoring.acceptStoredSpace()).toBeNull();
    pending.resolve(refusedAuthoring);
    await running;

    expect(notice(outcomes, 'resource-delete')).toBeNull();
  });

  it('still reports a dropped settlement that threw', async () => {
    const { outcomes, navigation, reported } = open();
    const pending = deferred<AuthoringResult>();
    const running = outcomes.run('resource-delete', () => pending.promise);
    const failure = new Error('late break');

    navigation.selectMap(MAP_B);
    pending.reject(failure);

    await expect(running).resolves.toBe(COMMAND_BROKE);
    expect(reported).toEqual([failure]);
    expect(notice(outcomes, 'resource-delete')).toBeNull();
  });
});

describe('disposal', () => {
  it('publishes nothing for a Navigation move or a settling run', async () => {
    const { outcomes, navigation } = open();
    outcomes.run('resource-remove', () => refusedAuthoring);
    const pending = deferred<AuthoringResult>();
    const running = outcomes.run('resource-delete', () => pending.promise);
    const listener = vi.fn();
    outcomes.subscribe(listener);
    const frozen = outcomes.getState();

    outcomes.dispose();
    navigation.selectMap(MAP_B);
    pending.resolve(refusedAuthoring);
    await running;

    expect(outcomes.getState()).toBe(frozen);
    expect(listener).not.toHaveBeenCalled();
  });
});
