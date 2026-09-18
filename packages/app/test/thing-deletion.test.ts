import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type Thing } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { composeApp } from '../src/compose-app';
import { openTestSpace } from './opened-space';
const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const THING_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const THING_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const SPACE_THING = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const TARGET_SPACE = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const TARGET_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const TARGET_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');

const EDGE = { from: THING_A, to: THING_B } as const;
const NONE = { pending: null, deleting: false, refusal: null };

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [THING_A]: { x: 10, y: 20, open: false },
          [THING_B]: { x: 300, y: 40, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [EDGE] }],
      },
    ],
    defaultDiagram: DIAGRAM_ID,
  },
  things: [
    { id: THING_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: THING_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

function open(stored: SpaceSnapshot = snapshot, storedRevision = 0n) {
  const loaded = { snapshot: stored, revision: 0n, exportedRevision: null };
  const backend = MemorySpaceBackend.asMeta({
    snapshot: stored,
    revision: storedRevision,
    exportedRevision: null,
  });
  const { spaceSession: session, spaceThings } = openTestSpace(backend, loaded);
  const composed = composeApp({ spaceSession: session, selection: DIAGRAM_ID, spaceThings });
  return { session, spaceThings, ...composed };
}

const lookupThing = (composed: ReturnType<typeof open>, id = THING_A): Thing =>
  composed.currentSpace().lookup.thing(id)!;

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
    const { thingDeletion, session } = opened;
    const before = session.getState().working;

    thingDeletion.arm(lookupThing(opened));

    expect(thingDeletion.getState().pending?.id).toBe(THING_A);
    expect(thingDeletion.getState().deleting).toBe(false);
    expect(thingDeletion.getState().refusal).toBeNull();
    expect(session.getState().working).toBe(before);
  });

  it('cancels the question without producing an Edit', () => {
    const opened = open();
    const { thingDeletion, session } = opened;
    const before = session.getState().working;
    thingDeletion.arm(lookupThing(opened));

    thingDeletion.cancel();

    expect(thingDeletion.getState().pending).toBeNull();
    expect(session.getState().working).toBe(before);
  });

  it('replaces an unanswered confirmation when a newer Thing is armed', () => {
    const opened = open();
    const { thingDeletion } = opened;
    thingDeletion.arm(lookupThing(opened, THING_A));

    thingDeletion.arm(lookupThing(opened, THING_B));

    expect(thingDeletion.getState().pending?.id).toBe(THING_B);
  });
});

describe('confirmation', () => {
  it('deletes an ordinary Thing through Space Authoring', async () => {
    const opened = open();
    const { thingDeletion, session } = opened;
    thingDeletion.arm(lookupThing(opened));

    thingDeletion.confirm();
    await vi.waitFor(() => expect(thingDeletion.getState()).toEqual(NONE));

    expect(session.getState().working.things.map(({ id }) => id)).toEqual([THING_B]);
  });

  it('refuses an ordinary deletion and closes the confirmation', async () => {
    const referenced: SpaceSnapshot = {
      ...snapshot,
      things: [
        snapshot.things[0]!,
        {
          id: THING_B,
          document: { title: 'Reference Thing of A', kind: 'reference', target: THING_A },
        },
      ],
    };
    const opened = open(referenced);
    const { thingDeletion, session } = opened;
    const before = session.getState().working;
    thingDeletion.arm(lookupThing(opened));

    thingDeletion.confirm();
    await vi.waitFor(() => expect(thingDeletion.getState().pending).toBeNull());

    expect(thingDeletion.getState().refusal).toContain('Reference Things');
    expect(session.getState().working).toBe(before);
  });

  it('does not start another deletion while one is running', async () => {
    const { thingDeletion, spaceThings } = open();
    let resolveDelete: ((value: { kind: 'completed' }) => void) | undefined;
    const deleteSpy = vi.spyOn(spaceThings, 'delete').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const spaceThing: Thing = {
      id: SPACE_THING,
      title: 'Linked',
      kind: 'space',
      spaceId: TARGET_SPACE,
      diagram: TARGET_DIAGRAM,
      graph: TARGET_GRAPH,
    };
    thingDeletion.arm(spaceThing);
    thingDeletion.confirm();
    expect(thingDeletion.getState().deleting).toBe(true);

    thingDeletion.confirm();

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    resolveDelete!({ kind: 'completed' });
    await vi.waitFor(() => expect(thingDeletion.getState().deleting).toBe(false));
  });

  it('reports an unexpected failure without treating it as a domain refusal', async () => {
    const opened = open();
    const { thingDeletion, authoring } = opened;
    vi.spyOn(authoring, 'complete').mockImplementation(() => {
      throw new Error('coordination broke');
    });
    thingDeletion.arm(lookupThing(opened));

    thingDeletion.confirm();
    await vi.waitFor(() => expect(thingDeletion.getState().refusal).toBe('coordination broke'));

    expect(thingDeletion.getState().pending).toBeNull();
  });

  it('reports a rejected promise from a Space Thing deletion', async () => {
    const { thingDeletion, spaceThings } = open();
    vi.spyOn(spaceThings, 'delete').mockRejectedValue(new Error('network failed'));
    const spaceThing: Thing = {
      id: SPACE_THING,
      title: 'Linked',
      kind: 'space',
      spaceId: TARGET_SPACE,
      diagram: TARGET_DIAGRAM,
      graph: TARGET_GRAPH,
    };
    thingDeletion.arm(spaceThing);

    thingDeletion.confirm();
    await vi.waitFor(() => expect(thingDeletion.getState().refusal).toBe('network failed'));
    expect(thingDeletion.getState().pending).toBeNull();
  });
});

describe('replacement invalidation', () => {
  it('discards an unanswered confirmation when the replacement epoch moves', async () => {
    const stored: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Stored' },
    };
    const opened = open(stored, 1n);
    const { thingDeletion, authoring, session } = opened;
    await raiseConflict(session, authoring);
    thingDeletion.arm(lookupThing(opened));
    expect(thingDeletion.getState().pending?.id).toBe(THING_A);

    expect(authoring.acceptStoredSpace()).toBeNull();

    expect(thingDeletion.getState()).toEqual(NONE);
  });

  it('suppresses a late success after replacement during deletion', async () => {
    const stored: SpaceSnapshot = {
      ...snapshot,
      document: { ...snapshot.document, title: 'Stored' },
    };
    const opened = open(stored, 1n);
    const { thingDeletion, authoring, session, spaceThings } = opened;
    let resolveDelete: ((value: { kind: 'completed' }) => void) | undefined;
    vi.spyOn(spaceThings, 'delete').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const spaceThing: Thing = {
      id: SPACE_THING,
      title: 'Linked',
      kind: 'space',
      spaceId: TARGET_SPACE,
      diagram: TARGET_DIAGRAM,
      graph: TARGET_GRAPH,
    };
    await raiseConflict(session, authoring);
    thingDeletion.arm(spaceThing);
    thingDeletion.confirm();
    expect(thingDeletion.getState().deleting).toBe(true);

    expect(authoring.acceptStoredSpace()).toBeNull();
    expect(thingDeletion.getState()).toEqual(NONE);

    resolveDelete!({ kind: 'completed' });
    await vi.waitFor(() => expect(thingDeletion.getState()).toEqual(NONE));
    expect(session.getState().working.things.map(({ id }) => id)).toEqual([THING_A, THING_B]);
  });

  it('lets a newer confirmation run after an older one was discarded mid-flight', async () => {
    const opened = open();
    const { thingDeletion, session, spaceThings } = opened;
    let resolveFirst: ((value: { kind: 'completed' }) => void) | undefined;
    vi.spyOn(spaceThings, 'delete').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const spaceThing: Thing = {
      id: SPACE_THING,
      title: 'Linked',
      kind: 'space',
      spaceId: TARGET_SPACE,
      diagram: TARGET_DIAGRAM,
      graph: TARGET_GRAPH,
    };
    thingDeletion.arm(spaceThing);
    thingDeletion.confirm();
    thingDeletion.arm(lookupThing(opened, THING_B));
    thingDeletion.confirm();

    await vi.waitFor(() =>
      expect(session.getState().working.things.map(({ id }) => id)).toEqual([THING_A]),
    );
    resolveFirst!({ kind: 'completed' });
    await vi.waitFor(() =>
      expect(session.getState().working.things.map(({ id }) => id)).toEqual([THING_A]),
    );
  });

  it('keeps an armed confirmation across an ordinary Edit', () => {
    const opened = open();
    const { thingDeletion, authoring } = opened;
    thingDeletion.arm(lookupThing(opened));

    authoring.complete({
      kind: 'edited-thing',
      thingId: THING_B,
      document: { title: 'Renamed', kind: 'markdown', body: 'B' },
    });

    expect(thingDeletion.getState().pending?.id).toBe(THING_A);
  });
});

describe('disposal', () => {
  it('stops publishing after disposal', async () => {
    const { thingDeletion, spaceThings } = open();
    let resolveDelete: ((value: { kind: 'completed' }) => void) | undefined;
    vi.spyOn(spaceThings, 'delete').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const spaceThing: Thing = {
      id: SPACE_THING,
      title: 'Linked',
      kind: 'space',
      spaceId: TARGET_SPACE,
      diagram: TARGET_DIAGRAM,
      graph: TARGET_GRAPH,
    };
    thingDeletion.arm(spaceThing);
    thingDeletion.confirm();
    const frozen = thingDeletion.getState();
    thingDeletion.dispose();

    resolveDelete!({ kind: 'completed' });
    await vi.waitFor(() => expect(thingDeletion.getState()).toEqual(frozen));
  });
});
