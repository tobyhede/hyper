import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type Resource } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { openTestSpace } from './opened-space';
const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const SPACE_RESOURCE = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const TARGET_SPACE = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const TARGET_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');

const EDGE = { from: RESOURCE_A, to: RESOURCE_B } as const;
const NONE = { pending: null, deleting: false };

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [RESOURCE_A]: { x: 10, y: 20, open: false },
          [RESOURCE_B]: { x: 300, y: 40, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [EDGE] }],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: RESOURCE_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

function open(stored: SpaceSnapshot = snapshot, storedRevision = 0n) {
  const loaded = { snapshot: stored, revision: 0n, exportedRevision: null };
  const backend = MemorySpaceBackend.asMeta({
    snapshot: stored,
    revision: storedRevision,
    exportedRevision: null,
  });
  const { spaceSession: session, spaceResources } = openTestSpace(backend, loaded);
  const reported: unknown[] = [];
  const composed = composeApp({
    spaceSession: session,
    selection: MAP_ID,
    spaceResources,
    reportObserverError: (error) => reported.push(error),
  });
  return { session, spaceResources, reported, ...composed };
}

/** The standing notice on Resource deletion's channel, or `null`. */
const deletionNotice = ({ commandOutcomes }: ReturnType<typeof open>) =>
  commandOutcomes.getState().notices.get('resource-delete') ?? null;

const lookupResource = (composed: ReturnType<typeof open>, id = RESOURCE_A): Resource =>
  composed.currentSpace().lookup.resource(id)!;

async function raiseConflict(
  session: ReturnType<typeof open>['session'],
  authoring: ReturnType<typeof open>['authoring'],
): Promise<void> {
  authoring.complete({ kind: 'deleted-edge', graphId: GRAPH_ID, edge: EDGE });
  await vi.waitFor(() => expect(session.getState().persistence.kind).toBe('conflicted'));
}

describe('arming and cancellation', () => {
  it('arms a confirmation without deleting or announcing success', () => {
    const opened = open();
    const { resourceDeletion, session } = opened;
    const before = session.getState().working;

    resourceDeletion.arm(lookupResource(opened));

    expect(resourceDeletion.getState().pending?.id).toBe(RESOURCE_A);
    expect(resourceDeletion.getState().deleting).toBe(false);
    expect(deletionNotice(opened)).toBeNull();
    expect(session.getState().working).toBe(before);
  });

  it('cancels the question without producing an Edit', () => {
    const opened = open();
    const { resourceDeletion, session } = opened;
    const before = session.getState().working;
    resourceDeletion.arm(lookupResource(opened));

    resourceDeletion.cancel();

    expect(resourceDeletion.getState().pending).toBeNull();
    expect(session.getState().working).toBe(before);
  });

  it('replaces an unanswered confirmation when a newer Resource is armed', () => {
    const opened = open();
    const { resourceDeletion } = opened;
    resourceDeletion.arm(lookupResource(opened, RESOURCE_A));

    resourceDeletion.arm(lookupResource(opened, RESOURCE_B));

    expect(resourceDeletion.getState().pending?.id).toBe(RESOURCE_B);
  });
});

describe('confirmation', () => {
  it('deletes an ordinary Resource through Space Authoring', async () => {
    const opened = open();
    const { resourceDeletion, session } = opened;
    resourceDeletion.arm(lookupResource(opened));

    resourceDeletion.confirm();
    await vi.waitFor(() => expect(resourceDeletion.getState()).toEqual(NONE));

    expect(session.getState().working.resources.map(({ id }) => id)).toEqual([RESOURCE_B]);
  });

  it('refuses an ordinary deletion and closes the confirmation', async () => {
    const referenced: SpaceSnapshot = {
      ...snapshot,
      resources: [
        snapshot.resources[0]!,
        {
          id: RESOURCE_B,
          document: { title: 'Reference Resource of A', kind: 'reference', target: RESOURCE_A },
        },
      ],
    };
    const opened = open(referenced);
    const { resourceDeletion, session } = opened;
    const before = session.getState().working;
    resourceDeletion.arm(lookupResource(opened));

    resourceDeletion.confirm();
    await vi.waitFor(() => expect(resourceDeletion.getState().pending).toBeNull());

    expect(deletionNotice(opened)?.title).toBe('Resource not deleted');
    expect(deletionNotice(opened)?.message).toContain('Reference Resources');
    expect(session.getState().working).toBe(before);
  });

  it('does not start another deletion while one is running', async () => {
    const { resourceDeletion, spaceResources } = open();
    let resolveDelete: ((value: { kind: 'completed' }) => void) | undefined;
    const deleteSpy = vi.spyOn(spaceResources, 'delete').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const spaceResource: Resource = {
      id: SPACE_RESOURCE,
      title: 'Linked',
      kind: 'space',
      spaceId: TARGET_SPACE,
      map: TARGET_MAP,
      graph: TARGET_GRAPH,
    };
    resourceDeletion.arm(spaceResource);
    resourceDeletion.confirm();
    expect(resourceDeletion.getState().deleting).toBe(true);

    resourceDeletion.confirm();

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    resolveDelete!({ kind: 'completed' });
    await vi.waitFor(() => expect(resourceDeletion.getState().deleting).toBe(false));
  });

  /**
   * A thrown deletion is a defect: it keeps `failureMessage`'s sentence on the
   * channel and now reaches the reporter as well, where it used to be swallowed.
   */
  it('reports a thrown Markdown Resource deletion and publishes its sentence', async () => {
    const opened = open();
    const { resourceDeletion, authoring, reported } = opened;
    const failure = new Error('coordination broke');
    vi.spyOn(authoring, 'complete').mockImplementation(() => {
      throw failure;
    });
    resourceDeletion.arm(lookupResource(opened));

    resourceDeletion.confirm();
    await vi.waitFor(() => expect(resourceDeletion.getState().pending).toBeNull());

    expect(deletionNotice(opened)).toEqual({
      title: 'Resource not deleted',
      message: 'coordination broke',
    });
    expect(reported).toEqual([failure]);
  });

  it('reports a thrown Space Resource deletion and publishes its sentence', async () => {
    const opened = open();
    const { resourceDeletion, spaceResources, reported } = opened;
    const failure = new Error('network failed');
    vi.spyOn(spaceResources, 'delete').mockRejectedValue(failure);
    const spaceResource: Resource = {
      id: SPACE_RESOURCE,
      title: 'Linked',
      kind: 'space',
      spaceId: TARGET_SPACE,
      map: TARGET_MAP,
      graph: TARGET_GRAPH,
    };
    resourceDeletion.arm(spaceResource);

    resourceDeletion.confirm();
    await vi.waitFor(() => expect(resourceDeletion.getState().pending).toBeNull());

    expect(deletionNotice(opened)).toEqual({
      title: 'Resource not deleted',
      message: 'network failed',
    });
    expect(reported).toEqual([failure]);
  });
});

describe('replacement invalidation', () => {
  it('discards an unanswered confirmation when the replacement epoch moves', async () => {
    const stored: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Stored' },
    };
    const opened = open(stored, 1n);
    const { resourceDeletion, authoring, session } = opened;
    await raiseConflict(session, authoring);
    resourceDeletion.arm(lookupResource(opened));
    expect(resourceDeletion.getState().pending?.id).toBe(RESOURCE_A);

    expect(authoring.acceptStoredSpace()).toBeNull();

    expect(resourceDeletion.getState()).toEqual(NONE);
  });

  it('suppresses a late success after replacement during deletion', async () => {
    const stored: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Stored' },
    };
    const opened = open(stored, 1n);
    const { resourceDeletion, authoring, session, spaceResources } = opened;
    let resolveDelete: ((value: { kind: 'completed' }) => void) | undefined;
    vi.spyOn(spaceResources, 'delete').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const spaceResource: Resource = {
      id: SPACE_RESOURCE,
      title: 'Linked',
      kind: 'space',
      spaceId: TARGET_SPACE,
      map: TARGET_MAP,
      graph: TARGET_GRAPH,
    };
    await raiseConflict(session, authoring);
    resourceDeletion.arm(spaceResource);
    resourceDeletion.confirm();
    expect(resourceDeletion.getState().deleting).toBe(true);

    expect(authoring.acceptStoredSpace()).toBeNull();
    expect(resourceDeletion.getState()).toEqual(NONE);

    resolveDelete!({ kind: 'completed' });
    await vi.waitFor(() => expect(resourceDeletion.getState()).toEqual(NONE));
    expect(session.getState().working.resources.map(({ id }) => id)).toEqual([
      RESOURCE_A,
      RESOURCE_B,
    ]);
  });

  it('lets a newer confirmation run after an older one was discarded mid-flight', async () => {
    const opened = open();
    const { resourceDeletion, session, spaceResources } = opened;
    let resolveFirst: ((value: { kind: 'completed' }) => void) | undefined;
    vi.spyOn(spaceResources, 'delete').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const spaceResource: Resource = {
      id: SPACE_RESOURCE,
      title: 'Linked',
      kind: 'space',
      spaceId: TARGET_SPACE,
      map: TARGET_MAP,
      graph: TARGET_GRAPH,
    };
    resourceDeletion.arm(spaceResource);
    resourceDeletion.confirm();
    resourceDeletion.arm(lookupResource(opened, RESOURCE_B));
    resourceDeletion.confirm();

    await vi.waitFor(() =>
      expect(session.getState().working.resources.map(({ id }) => id)).toEqual([RESOURCE_A]),
    );
    resolveFirst!({ kind: 'completed' });
    await vi.waitFor(() =>
      expect(session.getState().working.resources.map(({ id }) => id)).toEqual([RESOURCE_A]),
    );
  });

  it('keeps an armed confirmation across an ordinary Edit', () => {
    const opened = open();
    const { resourceDeletion, authoring } = opened;
    resourceDeletion.arm(lookupResource(opened));

    authoring.complete({
      kind: 'edited-resource',
      resourceId: RESOURCE_B,
      document: { title: 'Renamed', kind: 'markdown', body: 'B' },
    });

    expect(resourceDeletion.getState().pending?.id).toBe(RESOURCE_A);
  });
});

describe('disposal', () => {
  it('stops publishing after disposal', async () => {
    const { resourceDeletion, spaceResources } = open();
    let resolveDelete: ((value: { kind: 'completed' }) => void) | undefined;
    vi.spyOn(spaceResources, 'delete').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const spaceResource: Resource = {
      id: SPACE_RESOURCE,
      title: 'Linked',
      kind: 'space',
      spaceId: TARGET_SPACE,
      map: TARGET_MAP,
      graph: TARGET_GRAPH,
    };
    resourceDeletion.arm(spaceResource);
    resourceDeletion.confirm();
    const frozen = resourceDeletion.getState();
    resourceDeletion.dispose();

    resolveDelete!({ kind: 'completed' });
    await vi.waitFor(() => expect(resourceDeletion.getState()).toEqual(frozen));
  });
});
