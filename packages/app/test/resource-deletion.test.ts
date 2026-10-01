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
const NO_FALLBACK = () => null;

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

const spaceResource: Resource = {
  id: SPACE_RESOURCE,
  title: 'Linked',
  kind: 'space',
  spaceId: TARGET_SPACE,
  map: TARGET_MAP,
  graph: TARGET_GRAPH,
};

function open(stored: SpaceSnapshot = snapshot) {
  const loaded = { snapshot: stored, revision: 0n, exportedRevision: null };
  const backend = MemorySpaceBackend.asMeta(loaded);
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

/** Answer the standing question with Delete, and wait for it to settle. */
async function confirmed({ deleteConfirmation }: ReturnType<typeof open>): Promise<void> {
  deleteConfirmation.confirm();
  await vi.waitFor(() => expect(deleteConfirmation.getState().pending).toBeNull());
}

describe('asking', () => {
  it('asks Delete from Space about the Resource without deleting or announcing success', () => {
    const opened = open();
    const { resourceDeletion, deleteConfirmation, session } = opened;
    const before = session.getState().working;

    resourceDeletion.askToDelete(lookupResource(opened), NO_FALLBACK);

    expect(deleteConfirmation.getState()).toMatchObject({
      pending: { subject: { kind: 'resource', name: 'A' }, from: 'Space' },
      deleting: false,
    });
    expect(deletionNotice(opened)).toBeNull();
    expect(session.getState().working).toBe(before);
  });

  it('hands the confirmation the asking surface’s focus fallback', () => {
    const opened = open();
    const { resourceDeletion, deleteConfirmation } = opened;
    const focusFallback = () => null;

    resourceDeletion.askToDelete(lookupResource(opened), focusFallback);

    expect(deleteConfirmation.getState().pending?.focusFallback).toBe(focusFallback);
  });

  it('asks with what the deletion reaches in the Space it is asked over', () => {
    const opened = open();
    const { resourceDeletion, deleteConfirmation } = opened;

    resourceDeletion.askToDelete(lookupResource(opened), NO_FALLBACK);

    expect(
      deleteConfirmation.getState().pending?.reach?.map(({ title, graphs }) => ({
        title,
        graphs: graphs.map((graph) => graph.title),
      })),
    ).toEqual([{ title: 'Map 1', graphs: ['Main'] }]);
  });

  it('says a Space Resource’s deletion can take its Space with it', () => {
    const { resourceDeletion, deleteConfirmation } = open();

    resourceDeletion.askToDelete(spaceResource, NO_FALLBACK);

    expect(deleteConfirmation.getState().pending?.description).toContain(
      'last reference to its Space',
    );
  });
});

describe('deleting', () => {
  it('deletes an ordinary Resource through Space Authoring', async () => {
    const opened = open();
    const { resourceDeletion, session } = opened;
    resourceDeletion.askToDelete(lookupResource(opened), NO_FALLBACK);

    await confirmed(opened);

    expect(session.getState().working.resources.map(({ id }) => id)).toEqual([RESOURCE_B]);
  });

  it('deletes a Space Resource through Space Resource authoring, in the containing Space', async () => {
    const opened = open();
    const { resourceDeletion, spaceResources } = opened;
    const deleteSpy = vi.spyOn(spaceResources, 'delete').mockResolvedValue({ kind: 'completed' });
    resourceDeletion.askToDelete(spaceResource, NO_FALLBACK);

    await confirmed(opened);

    expect(deleteSpy.mock.calls).toEqual([
      [{ containingSpaceId: SPACE_ID, resourceId: SPACE_RESOURCE }],
    ]);
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
    resourceDeletion.askToDelete(lookupResource(opened), NO_FALLBACK);

    await confirmed(opened);

    expect(deletionNotice(opened)?.title).toBe('Resource not deleted');
    expect(deletionNotice(opened)?.message).toContain('Reference Resources');
    expect(session.getState().working).toBe(before);
  });

  /**
   * A thrown deletion is a defect: it keeps `failureMessage`'s sentence on the
   * channel and reaches the reporter as well.
   */
  it('reports a thrown Markdown Resource deletion and publishes its sentence', async () => {
    const opened = open();
    const { resourceDeletion, authoring, reported } = opened;
    const failure = new Error('coordination broke');
    vi.spyOn(authoring, 'complete').mockImplementation(() => {
      throw failure;
    });
    resourceDeletion.askToDelete(lookupResource(opened), NO_FALLBACK);

    await confirmed(opened);

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
    resourceDeletion.askToDelete(spaceResource, NO_FALLBACK);

    await confirmed(opened);

    expect(deletionNotice(opened)).toEqual({
      title: 'Resource not deleted',
      message: 'network failed',
    });
    expect(reported).toEqual([failure]);
  });
});
