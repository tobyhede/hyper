import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  type CommitResult,
} from '@project/persistence';
import { createOpenSpaces } from '../src/open-spaces';
import { DEFAULT_VIEW_ID } from '../src/renderer';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const GRAPH_ONE = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const GRAPH_TWO = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');

const snapshot = (id: UUID, title: string): SpaceSnapshot => {
  const cardId = id === META_ID ? CARD_ID : OTHER_CARD_ID;
  return {
    id,
    document: {
      version: 1,
      title,
      defaultRenderer: LAYOUT_ID,
      layouts: [
        {
          id: LAYOUT_ID,
          title: 'Layout',
          kind: 'positioned',
          positions: { [cardId]: { x: 0, y: 0, open: false } },
          graphs: [
            { id: GRAPH_ONE, title: 'One', edges: [] },
            { id: GRAPH_TWO, title: 'Two', edges: [] },
          ],
          activeGraph: GRAPH_ONE,
        },
      ],
    },
    cards: [{ id: cardId, document: { title: 'Card', kind: 'markdown', body: '' } }],
  };
};

const loaded = (id: UUID, title: string) => ({
  snapshot: snapshot(id, title),
  revision: 1n,
  exportedRevision: null,
});

const setup = (control?: MemorySpaceBackendTestControl) => {
  const backend = new MemorySpaceBackend(
    META_ID,
    [loaded(META_ID, 'Meta'), loaded(OTHER_ID, 'Other')],
    control,
  );
  return {
    backend,
    openSpaces: createOpenSpaces({ backend, metaSpaceId: META_ID, newId: () => CARD_ID }),
  };
};

const edit = (space: SpaceSnapshot): SpaceSnapshot => ({
  ...space,
  document: { ...space.document, title: `${space.document.title} edited` },
});

describe('Open Spaces', () => {
  it('opens and composes one live entry per Space id even when openings race', async () => {
    const { backend, openSpaces } = setup();
    const loadSpace = vi.spyOn(backend, 'loadSpace');

    const [direct, entered] = await Promise.all([
      openSpaces.open(OTHER_ID),
      openSpaces.enter(OTHER_ID),
    ]);

    expect(entered).toBe(direct);
    expect(entered.session).toBe(direct.session);
    expect(entered.app).toBe(direct.app);
    expect(loadSpace).toHaveBeenCalledTimes(1);
  });

  it('retains a Space selection while switching and reopening it', async () => {
    const { openSpaces } = setup();
    const other = await openSpaces.open(OTHER_ID);
    other.app.navigation.activateGraph(GRAPH_TWO);
    await openSpaces.open(META_ID);

    const reopened = await openSpaces.enter(OTHER_ID, DEFAULT_VIEW_ID);

    expect(reopened).toBe(other);
    expect(reopened.app.navigation.getState()).toMatchObject({
      selectedRenderer: LAYOUT_ID,
      activeGraphId: GRAPH_TWO,
    });
  });

  it('waits for the Space being left to finish its in-flight commit', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('pending'));

    let switched = false;
    const switching = openSpaces.open(META_ID).then(() => {
      switched = true;
    });
    await Promise.resolve();
    expect(switched).toBe(false);

    release();
    await switching;
    expect(openSpaces.getState().activeSpaceId).toBe(META_ID);
  });

  it.each([
    [
      { kind: 'retryable-failure', code: 'network', message: 'offline' } satisfies CommitResult,
      { kind: 'refused', refusal: { code: 'persistence-recovery-required', recovery: 'retry' } },
    ],
    [
      {
        kind: 'conflict',
        conflicts: [{ spaceId: OTHER_ID, current: loaded(OTHER_ID, 'Remote') }],
      } satisfies CommitResult,
      {
        kind: 'refused',
        refusal: { code: 'persistence-recovery-required', recovery: 'resolve-conflict' },
      },
    ],
  ])(
    'keeps recoverable persistence state discoverable when close is refused',
    async (result, expected) => {
      const control = new MemorySpaceBackendTestControl();
      control.queueResult(result);
      const { openSpaces } = setup(control);
      const other = await openSpaces.open(OTHER_ID);
      other.session.submit(edit(other.session.getState().working));
      await vi.waitFor(() => expect(other.session.getState().persistence.kind).not.toBe('pending'));
      await openSpaces.open(META_ID);

      await expect(openSpaces.close(OTHER_ID)).resolves.toEqual(expected);
      expect(openSpaces.entry(OTHER_ID)).toBe(other);
      expect(openSpaces.getState().activeSpaceId).toBe(META_ID);
    },
  );

  it('waits for an in-flight commit before closing', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('pending'));

    let closed = false;
    const closing = openSpaces.close(OTHER_ID).then((result) => {
      closed = result.kind === 'closed';
    });
    await Promise.resolve();
    expect(closed).toBe(false);

    release();
    await closing;
    expect(openSpaces.entry(OTHER_ID)).toBeUndefined();
  });

  it('reopens a safely closed Space with a fresh session and selection', async () => {
    const { openSpaces } = setup();
    const first = await openSpaces.open(OTHER_ID);
    first.app.navigation.activateGraph(GRAPH_TWO);
    await openSpaces.close(OTHER_ID);

    const reopened = await openSpaces.open(OTHER_ID);

    expect(reopened).not.toBe(first);
    expect(reopened.session).not.toBe(first.session);
    expect(reopened.app.navigation.getState()).toMatchObject({
      selectedRenderer: LAYOUT_ID,
      activeGraphId: GRAPH_ONE,
    });
  });

  it('warns before closing rejected work and permits an explicit close', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'permanent-failure', code: 'forbidden', message: 'no' });
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('rejected'));

    await expect(openSpaces.close(OTHER_ID)).resolves.toEqual({
      kind: 'warning',
      warning: 'persistence-rejected',
    });
    expect(openSpaces.entry(OTHER_ID)).toBe(other);
    await expect(openSpaces.close(OTHER_ID, { warning: 'persistence-rejected' })).resolves.toEqual({
      kind: 'closed',
    });
    expect(openSpaces.entry(OTHER_ID)).toBeUndefined();
  });

  it('never closes the permanent Meta Space', async () => {
    const { openSpaces } = setup();
    const meta = await openSpaces.open(META_ID);

    await expect(openSpaces.close(META_ID)).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'meta-space-permanent' },
    });
    expect(openSpaces.entry(META_ID)).toBe(meta);
  });
});
