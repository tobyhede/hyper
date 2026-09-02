import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  type CommitResult,
} from '@project/persistence';
import { createOpenSpaces } from '../src/open-spaces';
import { DEFAULT_VIEW_ID } from '../src/renderer';
import { productDestinationPath } from '@project/http';
import { mintingIds } from './minting';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const GRAPH_ONE = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const GRAPH_TWO = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const META_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const META_GRAPH_ONE = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const META_GRAPH_TWO = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const META_SPACE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');
const MINTED_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000c');

/**
 * Two aggregate-valid Spaces. Every Card, Layout and Graph id is distinct
 * across them, because a Space Card coordination validates the whole aggregate
 * and refuses a duplicate id wherever it appears — and Meta carries the Space
 * Card that owns the ordinary Space, which the same intake requires.
 */
const snapshot = (id: UUID, title: string): SpaceSnapshot => {
  const meta = id === META_ID;
  const cardId = meta ? CARD_ID : OTHER_CARD_ID;
  const layoutId = meta ? META_LAYOUT_ID : LAYOUT_ID;
  const graphOne = meta ? META_GRAPH_ONE : GRAPH_ONE;
  const graphTwo = meta ? META_GRAPH_TWO : GRAPH_TWO;
  return {
    id,
    document: {
      version: 1,
      title,
      defaultRenderer: layoutId,
      layouts: [
        {
          id: layoutId,
          title: 'Layout',
          kind: 'positioned',
          positions: meta
            ? {
                [cardId]: { x: 0, y: 0, open: false },
                [META_SPACE_CARD_ID]: { x: 0, y: 40, open: false },
              }
            : { [cardId]: { x: 0, y: 0, open: false } },
          graphs: [
            { id: graphOne, title: 'One', edges: [] },
            { id: graphTwo, title: 'Two', edges: [] },
          ],
          activeGraph: graphOne,
        },
      ],
    },
    cards: meta
      ? [
          { id: cardId, document: { title: 'Card', kind: 'markdown', body: '' } },
          {
            id: META_SPACE_CARD_ID,
            document: { title: 'Other', kind: 'space', spaceId: OTHER_ID },
          },
        ]
      : [{ id: cardId, document: { title: 'Card', kind: 'markdown', body: '' } }],
  };
};

const loaded = (id: UUID, title: string) => ({
  snapshot: snapshot(id, title),
  revision: 1n,
  exportedRevision: null,
});

const setup = (control?: MemorySpaceBackendTestControl, newId: () => UUID = () => CARD_ID) => {
  const backend = new MemorySpaceBackend(
    META_ID,
    [loaded(META_ID, 'Meta'), loaded(OTHER_ID, 'Other')],
    control,
  );
  return {
    backend,
    openSpaces: createOpenSpaces({ backend, metaSpaceId: META_ID, newId }),
  };
};

/** Distinct ids for a Space Card coordination, which mints several per call. */
const countingIds = (): (() => UUID) => {
  let next = 0x20;
  return () => uuidSchema.parse(`00000000-0000-4000-8000-0000000000${(next++).toString(16)}`);
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

  it('commits an edit queued behind a Space Card coordination before closing', async () => {
    const control = new MemorySpaceBackendTestControl();
    const { backend, openSpaces } = setup(control, countingIds());
    await openSpaces.open(META_ID);
    const other = await openSpaces.open(OTHER_ID);

    const release = control.deferNextCommit();
    const creating = openSpaces.spaceCards.create({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
      title: 'Child',
      position: { x: 10, y: 10 },
    });
    await vi.waitFor(() => expect(control.requests).toHaveLength(1));

    // The coordination has paused persistence on every session, so this edit is
    // parked as queued work and the session never announces `pending`. Closing
    // on that reading would retire a session with an uncommitted edit in hand.
    const edited = edit(other.session.getState().working);
    other.session.submit(edited);
    expect(other.session.getState().persistence.kind).toBe('settled');

    const closing = openSpaces.close(OTHER_ID);
    await Promise.resolve();
    await Promise.resolve();
    expect(openSpaces.entry(OTHER_ID)).toBe(other);

    release();
    await creating;
    await expect(closing).resolves.toEqual({ kind: 'closed' });
    await expect(backend.loadSpace(OTHER_ID)).resolves.toMatchObject({
      snapshot: { document: { title: edited.document.title } },
    });
  });

  it('closes through a coordination that starts while the close is waiting', async () => {
    const control = new MemorySpaceBackendTestControl();
    const { openSpaces } = setup(control, countingIds());
    await openSpaces.open(META_ID);
    await openSpaces.open(OTHER_ID);

    const releaseFirst = control.deferNextCommit();
    const first = openSpaces.spaceCards.create({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
      title: 'First child',
      position: { x: 10, y: 10 },
    });
    await vi.waitFor(() => expect(control.requests).toHaveLength(1));

    // Closing waits behind the running coordination, and a second coordination
    // then queues behind the same turn. When the first ends it wakes both: the
    // wait reports a retirable Space, and the second raises the barrier again
    // before the close gets to retire it. Retiring has to survive that window.
    const closing = openSpaces.close(OTHER_ID);
    const second = openSpaces.spaceCards.create({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
      title: 'Second child',
      position: { x: 20, y: 20 },
    });

    releaseFirst();
    await expect(closing).resolves.toEqual({ kind: 'closed' });
    await first;
    await second;
    expect(openSpaces.entry(OTHER_ID)).toBeUndefined();
  });

  it('mints a composed Space\u2019s Card identities from the minter it was given', async () => {
    const { openSpaces } = setup(undefined, mintingIds(MINTED_CARD_ID));
    const other = await openSpaces.open(OTHER_ID);

    expect(
      other.app.authoring.complete({ kind: 'created-card', anchor: { x: 100, y: 100 } }),
    ).toEqual({ kind: 'completed', createdCardId: MINTED_CARD_ID });

    expect(other.session.getState().working.cards.map(({ id }) => id)).toContain(MINTED_CARD_ID);
  });

  it('never reinstates a superseded Space when the one being left settles', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('pending'));

    // Meta cannot take the canvas until the Space being left settles, and by
    // the time it does the author has already chosen to stay where they are.
    const opening = openSpaces.open(META_ID);
    await Promise.resolve();
    await openSpaces.switchTo(OTHER_ID);

    release();
    await opening;
    expect(openSpaces.getState().activeSpaceId).toBe(OTHER_ID);
    expect(openSpaces.entry(META_ID)).toBeDefined();
  });

  it('reports the selection an already-open Space actually kept', async () => {
    const { openSpaces } = setup();
    const path = productDestinationPath({
      kind: 'space-view',
      spaceId: OTHER_ID,
      spaceViewId: LAYOUT_ID,
    });
    const first = await openSpaces.openPath(path);
    first.opened.app.navigation.selectRenderer(DEFAULT_VIEW_ID);

    // The Space is already open, so it keeps the selection it is being worked
    // in. Reporting the URL's selection anyway would have the caller open a
    // Graph against a Space View that was never selected.
    const again = await openSpaces.openPath(path);

    expect(again.opened).toBe(first.opened);
    expect(again.opening?.selection).toBe(DEFAULT_VIEW_ID);
  });

  it('detaches a closed Space\u2019s composition from its retired session', async () => {
    const { openSpaces } = setup();
    const other = await openSpaces.open(OTHER_ID);
    const seen: string[] = [];
    other.app.authoring.subscribe(() => seen.push('notified'));

    await expect(openSpaces.close(OTHER_ID)).resolves.toEqual({ kind: 'closed' });

    // The registry no longer owns this session, so a composition still driving
    // it would be a writer outside the one owner. Closing retires both.
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).not.toBe('pending'));
    expect(seen).toEqual([]);
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
