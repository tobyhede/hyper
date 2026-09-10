import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  type CommitResult,
} from '@project/persistence';
import { createOpenSpaces } from '../src/open-spaces';
import { recordingHistory } from './browser-history';
import { productDestinationPath } from '@project/http';
import { mintingIds } from './minting';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const UNOPENED_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000ff');
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
const SECOND_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000d');
const SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000e');
/**
 * A third Space, which is what a crossing needs to be a tree rather than a line.
 *
 * Two Spaces can only ever show a Space entered from another; re-homing needs
 * three, because what it asserts is where the Space below the exited one lands.
 */
const THIRD_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000f');
const THIRD_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const THIRD_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const THIRD_GRAPH_ONE = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const THIRD_GRAPH_TWO = uuidSchema.parse('00000000-0000-4000-8000-000000000013');

/**
 * Two aggregate-valid Spaces. Every Card, Layout and Graph id is distinct
 * across them, because a Space Card coordination validates the whole aggregate
 * and refuses a duplicate id wherever it appears — and Meta carries the Space
 * Card that owns the ordinary Space, which the same intake requires.
 */
const snapshot = (id: UUID, title: string): SpaceSnapshot => {
  const meta = id === META_ID;
  const third = id === THIRD_ID;
  const cardId = meta ? CARD_ID : third ? THIRD_CARD_ID : OTHER_CARD_ID;
  const layoutId = meta ? META_LAYOUT_ID : third ? THIRD_LAYOUT_ID : LAYOUT_ID;
  const graphOne = meta ? META_GRAPH_ONE : third ? THIRD_GRAPH_ONE : GRAPH_ONE;
  const graphTwo = meta ? META_GRAPH_TWO : third ? THIRD_GRAPH_TWO : GRAPH_TWO;
  return {
    id,
    document: {
      version: 1,
      title,
      defaultLayout: layoutId,
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
        // A second Layout, so a selection made in an open Space can differ from
        // the one an address proposes. Only the Space those tests use needs it,
        // and its ids are its own — every Layout and Graph id is distinct across
        // the three Spaces, because a Space Card coordination validates the
        // whole aggregate and refuses a duplicate wherever it appears.
        ...(id === OTHER_ID
          ? [
              {
                id: SECOND_LAYOUT_ID,
                title: 'Second Layout',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: SECOND_GRAPH_ID, title: 'Second', edges: [] }],
                activeGraph: SECOND_GRAPH_ID,
              },
            ]
          : []),
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

/**
 * Two Spaces, or three where a test needs a crossing to be a tree.
 *
 * The third is opt-in rather than always present because a Space Card
 * coordination is written over every Space the backend holds: a third one in
 * the default fixture changes what those tests are coordinating across, and
 * they assert on the requests it makes.
 */
const setup = (
  control?: MemorySpaceBackendTestControl,
  newId: () => UUID = () => CARD_ID,
  spaces: readonly (readonly [UUID, string])[] = [
    [META_ID, 'Meta'],
    [OTHER_ID, 'Other'],
  ],
) => {
  const history = recordingHistory();
  const backend = new MemorySpaceBackend(
    META_ID,
    spaces.map(([id, title]) => loaded(id, title)),
    control,
  );
  return {
    backend,
    history,
    openSpaces: createOpenSpaces({
      backend,
      metaSpaceId: META_ID,
      newId,
      history,
    }),
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
  it('authors the embedded Layout while preserving the full canvas selection', async () => {
    const { openSpaces } = setup();
    const target = await openSpaces.open(OTHER_ID, SECOND_LAYOUT_ID);
    const before = target.session.getState().working;
    expect(
      target.app.authoring.completeInLayout(LAYOUT_ID, {
        kind: 'opened-card',
        cardId: OTHER_CARD_ID,
      }).kind,
    ).toBe('completed');
    const after = target.session.getState().working;
    expect(
      after.document.layouts?.find((layout) => layout.id === LAYOUT_ID)?.positions[OTHER_CARD_ID]
        ?.open,
    ).toBe(true);
    expect(after.document.layouts?.find((layout) => layout.id === SECOND_LAYOUT_ID)).toEqual(
      before.document.layouts?.find((layout) => layout.id === SECOND_LAYOUT_ID),
    );
    expect(target.app.navigation.getState().selectedLayoutId).toBe(SECOND_LAYOUT_ID);
    expect(after.document.defaultLayout).toBe(before.document.defaultLayout);
  });

  it('opens an embedded target in the shared entry without leaving the containing Space', async () => {
    const { openSpaces } = setup();
    const containing = await openSpaces.open(META_ID);
    const target = await openSpaces.embed(OTHER_ID);

    expect(openSpaces.getState().activeSpaceId).toBe(containing.id);
    expect(openSpaces.entry(OTHER_ID)).toBe(target);
    expect(await openSpaces.embed(OTHER_ID)).toBe(target);
    expect(await openSpaces.enter(OTHER_ID)).toBe(target);
    expect(openSpaces.getState().activeSpaceId).toBe(OTHER_ID);
  });

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

    const reopened = await openSpaces.enter(OTHER_ID, SECOND_LAYOUT_ID);

    expect(reopened).toBe(other);
    expect(reopened.app.navigation.getState()).toMatchObject({
      selectedLayoutId: LAYOUT_ID,
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
    'keeps recoverable persistence state discoverable when exit is refused',
    async (result, expected) => {
      const control = new MemorySpaceBackendTestControl();
      control.queueResult(result);
      const { openSpaces } = setup(control);
      const other = await openSpaces.open(OTHER_ID);
      other.session.submit(edit(other.session.getState().working));
      await vi.waitFor(() => expect(other.session.getState().persistence.kind).not.toBe('pending'));
      await openSpaces.open(META_ID);

      await expect(openSpaces.exit(OTHER_ID)).resolves.toEqual(expected);
      expect(openSpaces.entry(OTHER_ID)).toBe(other);
      expect(openSpaces.getState().activeSpaceId).toBe(META_ID);
    },
  );

  it('waits for an in-flight commit before exiting', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('pending'));

    let exited = false;
    const exiting = openSpaces.exit(OTHER_ID).then((result) => {
      exited = result.kind === 'exited';
    });
    await Promise.resolve();
    expect(exited).toBe(false);

    release();
    await exiting;
    expect(openSpaces.entry(OTHER_ID)).toBeUndefined();
  });

  it('reopens a safely exited Space with a fresh session and selection', async () => {
    const { openSpaces } = setup();
    const first = await openSpaces.open(OTHER_ID);
    first.app.navigation.activateGraph(GRAPH_TWO);
    await openSpaces.exit(OTHER_ID);

    const reopened = await openSpaces.open(OTHER_ID);

    expect(reopened).not.toBe(first);
    expect(reopened.session).not.toBe(first.session);
    expect(reopened.app.navigation.getState()).toMatchObject({
      selectedLayoutId: LAYOUT_ID,
      activeGraphId: GRAPH_ONE,
    });
  });

  it('warns before exiting rejected work and permits an explicit exit', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'permanent-failure', code: 'forbidden', message: 'no' });
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('rejected'));

    await expect(openSpaces.exit(OTHER_ID)).resolves.toEqual({
      kind: 'warning',
      warning: 'persistence-rejected',
    });
    expect(openSpaces.entry(OTHER_ID)).toBe(other);
    await expect(openSpaces.exit(OTHER_ID, { warning: 'persistence-rejected' })).resolves.toEqual({
      kind: 'exited',
    });
    expect(openSpaces.entry(OTHER_ID)).toBeUndefined();
  });

  it('commits an edit queued behind a Space Card coordination before exiting', async () => {
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
    // parked as queued work and the session never announces `pending`. Exiting
    // on that reading would retire a session with an uncommitted edit in hand.
    const edited = edit(other.session.getState().working);
    other.session.submit(edited);
    expect(other.session.getState().persistence.kind).toBe('settled');

    const exiting = openSpaces.exit(OTHER_ID);
    await Promise.resolve();
    await Promise.resolve();
    expect(openSpaces.entry(OTHER_ID)).toBe(other);

    release();
    await creating;
    await expect(exiting).resolves.toEqual({ kind: 'exited' });
    await expect(backend.loadSpace(OTHER_ID)).resolves.toMatchObject({
      snapshot: { document: { title: edited.document.title } },
    });
  });

  it('exits through a coordination that starts while the exit is waiting', async () => {
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

    // Exiting waits behind the running coordination, and a second coordination
    // then queues behind the same turn. When the first ends it wakes both: the
    // wait reports a retirable Space, and the second raises the barrier again
    // before the exit gets to retire it. Retiring has to survive that window.
    const exiting = openSpaces.exit(OTHER_ID);
    const second = openSpaces.spaceCards.create({
      containingSpaceId: META_ID,
      layoutId: META_LAYOUT_ID,
      title: 'Second child',
      position: { x: 20, y: 20 },
    });

    releaseFirst();
    await expect(exiting).resolves.toEqual({ kind: 'exited' });
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

  it('never reinstates a Space exited while an activation waited on the one being left', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control);
    await openSpaces.open(OTHER_ID);
    const meta = await openSpaces.open(META_ID);
    meta.session.submit(edit(meta.session.getState().working));
    await vi.waitFor(() => expect(meta.session.getState().persistence.kind).toBe('pending'));

    // The activation parks until Meta settles. Exiting Other retires its
    // session and disposes its composition while it waits, so neither
    // reinstating it nor answering with it leaves the caller a Space anything
    // can commit for — the exit is the newer choice and the activation fails.
    const switching = openSpaces.switchTo(OTHER_ID);
    await Promise.resolve();
    await expect(openSpaces.exit(OTHER_ID)).resolves.toEqual({ kind: 'exited' });

    release();
    await expect(switching).rejects.toThrow('was exited while it was being activated');
    expect(openSpaces.entry(OTHER_ID)).toBeUndefined();
    expect(openSpaces.getState().entries).toEqual([meta]);
    expect(openSpaces.getState().activeSpaceId).toBe(META_ID);
  });

  it('reloads a Space chosen while its exit was still waiting', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    await openSpaces.open(META_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('pending'));

    // The exit parks until Other settles, and both caches still advertise the
    // entry it is going to retire while it does. The author choosing Other back
    // is the newer choice, so it waits the exit out and takes the Space the
    // exit leaves behind rather than the composition it has just retired.
    const exiting = openSpaces.exit(OTHER_ID);
    await Promise.resolve();
    const switching = openSpaces.switchTo(OTHER_ID);

    release();
    await expect(exiting).resolves.toEqual({ kind: 'exited' });
    const switched = await switching;

    expect(switched).not.toBe(other);
    expect(switched.session).not.toBe(other.session);
    expect(openSpaces.entry(OTHER_ID)).toBe(switched);
    expect(openSpaces.getState().activeSpaceId).toBe(OTHER_ID);
  });

  it('leaves a pending activation to finish when a later call throws before activating', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('pending'));

    const opening = openSpaces.open(META_ID);
    await Promise.resolve();
    // Neither call activates anything, so neither supersedes the choice
    // already waiting on the Space being left.
    await expect(openSpaces.switchTo(UNOPENED_ID)).rejects.toThrow('is not open');
    await expect(openSpaces.openPath('/not-a-product-url')).rejects.toThrow(
      'outside product addressing',
    );

    release();
    await opening;
    expect(openSpaces.getState().activeSpaceId).toBe(META_ID);
  });

  it('leaves a pending activation to finish when two later calls throw out of order', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('pending'));

    const opening = openSpaces.open(META_ID);
    await Promise.resolve();
    // Both number an intent and both give it back, earlier first. The earlier
    // one cannot subtract while the later is still outstanding, so the later
    // one uncovers a number that is itself abandoned. Stepping back only one
    // leaves the count resting on a choice nobody made, and the activation
    // still waiting on the Space being left reads it as a newer one.
    const earlier = openSpaces.openPath('/not-a-product-url');
    const later = openSpaces.openPath('/also-not-a-product-url');
    await expect(earlier).rejects.toThrow('outside product addressing');
    await expect(later).rejects.toThrow('outside product addressing');

    release();
    await opening;
    expect(openSpaces.getState().activeSpaceId).toBe(META_ID);
  });

  it('restores another open Space on Back and Forward without writing history', async () => {
    const { openSpaces, history } = setup();
    await openSpaces.open(META_ID);
    const metaPath = productDestinationPath({
      kind: 'layout',
      spaceId: META_ID,
      layoutId: META_LAYOUT_ID,
    });
    const other = await openSpaces.open(OTHER_ID);
    const otherPath = history.pathname();
    other.app.navigation.selectLayout(SECOND_LAYOUT_ID);
    const writes = [...history.writes];

    history.popTo(metaPath);
    await vi.waitFor(() => expect(openSpaces.getState().activeSpaceId).toBe(META_ID));
    expect(history.writes).toEqual(writes);

    history.popTo(otherPath);
    await vi.waitFor(() => expect(openSpaces.getState().activeSpaceId).toBe(OTHER_ID));
    expect(other.app.navigation.getState().selectedLayoutId).toBe(LAYOUT_ID);
    expect(history.writes).toEqual(writes);
  });

  it('reopens a closed Space from browser history without adding an entry', async () => {
    const { openSpaces, history } = setup();
    await openSpaces.open(META_ID);
    const original = await openSpaces.open(OTHER_ID);
    const path = history.pathname();
    await openSpaces.exit(OTHER_ID);
    const writes = [...history.writes];

    history.popTo(path);

    await vi.waitFor(() => expect(openSpaces.getState().activeSpaceId).toBe(OTHER_ID));
    expect(openSpaces.entry(OTHER_ID)).not.toBe(original);
    expect(history.writes).toEqual(writes);
  });

  it('reports the selection an already-open Space actually kept', async () => {
    const { openSpaces } = setup();
    const path = productDestinationPath({
      kind: 'layout',
      spaceId: OTHER_ID,
      layoutId: LAYOUT_ID,
    });
    const first = await openSpaces.openPath(path);
    first.opened.app.navigation.selectLayout(SECOND_LAYOUT_ID);

    // The Space is already open, so it keeps the selection it is being worked
    // in. Reporting the URL's selection anyway would have the caller open a
    // Graph against a Layout that was never selected.
    const again = await openSpaces.openPath(path);

    expect(again.opened).toBe(first.opened);
    expect(again.opening?.selection).toBe(SECOND_LAYOUT_ID);
  });

  it('detaches an exited Space\u2019s composition from its retired session', async () => {
    const { openSpaces } = setup();
    const other = await openSpaces.open(OTHER_ID);
    const seen: string[] = [];
    other.app.authoring.subscribe(() => seen.push('notified'));

    await expect(openSpaces.exit(OTHER_ID)).resolves.toEqual({ kind: 'exited' });

    // The registry no longer owns this session, so a composition still driving
    // it would be a writer outside the one owner. Exiting retires both.
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).not.toBe('pending'));
    expect(seen).toEqual([]);
  });

  it('accepts the baseline for a participant the conflict never named', async () => {
    const control = new MemorySpaceBackendTestControl();
    // The conflict names the cascade's target only. Meta is a participant
    // because the same edit removes its Space Card, but the repository never
    // complained about it, so it has no remote snapshot of its own. The named
    // Space carries a revision of its own so that Meta keeping 1n below is
    // evidence it held its own baseline rather than adopting the reported one.
    control.queueResult({
      kind: 'conflict',
      conflicts: [{ spaceId: OTHER_ID, current: { ...loaded(OTHER_ID, 'Remote'), revision: 9n } }],
    });
    const { openSpaces } = setup(control);
    const meta = await openSpaces.open(META_ID);
    await openSpaces.open(OTHER_ID);
    // What Meta is working on before the cascade. Whether this is also what is
    // *stored* is the claim under test, so it is not named for the conclusion.
    const beforeCascade = meta.session.getState().working;

    await openSpaces.spaceCards.delete({
      containingSpaceId: META_ID,
      cardId: META_SPACE_CARD_ID,
    });
    await vi.waitFor(() => expect(meta.session.getState().persistence.kind).toBe('conflicted'));
    expect(meta.session.getState().working.cards.map((card) => card.id)).not.toContain(
      META_SPACE_CARD_ID,
    );
    const before = meta.app.authoring.getState().replacementEpoch;

    // Reload is reachable here precisely because the baseline is what is
    // stored: the cascade never committed, so accepting it puts the Space Card
    // the edit removed back.
    expect(meta.app.authoring.acceptStoredSpace()).toBeNull();

    expect(meta.session.getState()).toMatchObject({
      working: beforeCascade,
      acknowledgedRevision: 1n,
      persistence: { kind: 'settled' },
    });
    expect(meta.session.getState().working.cards.map((card) => card.id)).toContain(
      META_SPACE_CARD_ID,
    );
    expect(meta.app.authoring.getState().replacementEpoch).toBe(before + 1);
  });

  it('has no stored side to accept for a Space the conflict reported gone', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'conflict',
      conflicts: [{ spaceId: OTHER_ID, current: undefined }],
    });
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('conflicted'));
    const before = other.app.authoring.getState();

    // Keeping local work is this one's recovery — it re-commits as a create —
    // so accepting answers with the reason and changes nothing.
    expect(other.app.authoring.acceptStoredSpace()).toEqual({ code: 'stored-space-deleted' });
    expect(other.app.authoring.getState().replacementEpoch).toBe(before.replacementEpoch);
    expect(other.session.getState().persistence.kind).toBe('conflicted');
  });

  /**
   * What the tree Open Spaces draws is a picture of.
   *
   * The open set is drawn as the tree that *crossing* makes, each Space under
   * the one it was entered from — the **Opener** CONTEXT.md gives the open set.
   * Production recorded no such crossing before this, so a surface indenting
   * anything was indenting a fact nothing held.
   *
   * It is display-only, and these tests are about the record rather than about
   * any behaviour hanging off it: Exit closes one Space whether or not something
   * was entered from it (ADR 0068), which is the next test but one.
   */
  const crossing = () =>
    setup(undefined, () => CARD_ID, [
      [META_ID, 'Meta'],
      [OTHER_ID, 'Other'],
      [THIRD_ID, 'Third'],
    ]);

  it('records the Space a crossing was made from, and records none for an address', async () => {
    const { openSpaces } = crossing();

    await openSpaces.open(META_ID);
    await openSpaces.enter(OTHER_ID);

    // Opened directly, with nothing on the canvas to have crossed from.
    expect(openSpaces.getState().openedFrom.get(META_ID)).toBe(null);
    expect(openSpaces.getState().openedFrom.get(OTHER_ID)).toBe(META_ID);

    // An address is not a crossing. Other is on the canvas and the location
    // changes underneath it, so the Space that arrives hangs off nothing —
    // recording Other here would put Third under a Space it was never entered
    // from, only standing beside.
    await openSpaces.openPath(
      productDestinationPath({ kind: 'layout', spaceId: THIRD_ID, layoutId: THIRD_LAYOUT_ID }),
    );

    expect(openSpaces.getState().openedFrom.get(THIRD_ID)).toBe(null);
  });

  it('keeps the opener a Space joined the set with when it is entered again', async () => {
    const { openSpaces } = crossing();
    await openSpaces.open(META_ID);
    await openSpaces.enter(OTHER_ID);
    await openSpaces.switchTo(META_ID);
    await openSpaces.enter(THIRD_ID);

    // Crossing back into a Space already open is returning to it, not entering
    // it. Rewriting the opener here would reshape the tree under a reader who
    // was only moving around in it.
    await openSpaces.enter(OTHER_ID);

    expect(openSpaces.getState().openedFrom.get(OTHER_ID)).toBe(META_ID);

    // An address records none only where it *opens* a Space. Resolving onto one
    // already open is the same return, so recording the address's own `null`
    // here would strand Other at the root of a tree it never sat at. Meta takes
    // the canvas first, because a URL onto the Space already being worked in
    // settles before it reaches the record at all.
    await openSpaces.switchTo(META_ID);
    await openSpaces.openPath(
      productDestinationPath({ kind: 'layout', spaceId: OTHER_ID, layoutId: LAYOUT_ID }),
    );

    expect(openSpaces.getState().activeSpaceId).toBe(OTHER_ID);

    expect(openSpaces.getState().openedFrom.get(OTHER_ID)).toBe(META_ID);
  });

  it('records no opener naming a Space that exited while the crossing was in flight', async () => {
    const { backend, openSpaces } = crossing();
    await openSpaces.open(META_ID);
    await openSpaces.enter(OTHER_ID);

    // The crossing reads its opener before the load, and Third's load parks, so
    // it holds Other for as long as that takes. Exiting Other inside that window
    // re-homes what the record already holds \u2014 and Third is not in it yet to be
    // re-homed, so the opener it lands with is one nothing re-homed.
    let releaseThird = (): void => undefined;
    const parked = new Promise<void>((resolve) => {
      releaseThird = resolve;
    });
    const load = backend.loadSpace.bind(backend);
    vi.spyOn(backend, 'loadSpace').mockImplementation(async (id) => {
      if (id === THIRD_ID) await parked;
      return await load(id);
    });

    const crossed = openSpaces.enter(THIRD_ID);
    await Promise.resolve();
    expect(await openSpaces.exit(OTHER_ID)).toEqual({ kind: 'exited' });

    releaseThird();
    await crossed;

    // Every opener names a Space that is open, which is what keeps the record
    // whole and the list the only way back to everything in it.
    const { entries, openedFrom } = openSpaces.getState();
    expect(entries.map(({ id }) => id)).toEqual([META_ID, THIRD_ID]);
    expect(openedFrom.get(THIRD_ID)).toBe(null);
  });

  it('re-homes what was entered from an exited Space onto that Space\u2019s own opener', async () => {
    const { openSpaces } = crossing();
    await openSpaces.open(META_ID);
    await openSpaces.enter(OTHER_ID);
    await openSpaces.enter(THIRD_ID);

    expect(await openSpaces.exit(OTHER_ID)).toEqual({ kind: 'exited' });

    // Still open, and still reachable in the list that is the only way back to
    // it. Walking up lazily could not answer this: the exited entry is gone and
    // its own opener with it, so there is no chain left to follow.
    const { entries, openedFrom } = openSpaces.getState();
    expect(entries.map(({ id }) => id)).toContain(THIRD_ID);
    expect(openedFrom.get(THIRD_ID)).toBe(META_ID);
    expect(openedFrom.has(OTHER_ID)).toBe(false);
  });

  it('joins a Space reopened while its exit was still waiting at the root', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control, () => CARD_ID, [
      [META_ID, 'Meta'],
      [OTHER_ID, 'Other'],
      [THIRD_ID, 'Third'],
    ]);
    await openSpaces.open(META_ID);
    const other = await openSpaces.enter(OTHER_ID);
    await openSpaces.enter(THIRD_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('pending'));

    // The exit parks until Other settles, and choosing Other back waits it out
    // and takes the Space the exit leaves behind. That Space is a new entry
    // opened by a choice from the list, which is not a crossing \u2014 so it joins
    // at the root, and does not recover the opener the exit re-homed away.
    const exiting = openSpaces.exit(OTHER_ID);
    await Promise.resolve();
    const switching = openSpaces.switchTo(OTHER_ID);

    release();
    await expect(exiting).resolves.toEqual({ kind: 'exited' });
    const reopened = await switching;

    expect(reopened).not.toBe(other);
    const { openedFrom } = openSpaces.getState();
    expect(openedFrom.get(OTHER_ID)).toBe(null);
    expect(openedFrom.get(THIRD_ID)).toBe(META_ID);
  });

  it('closes only the Space exited, whatever was entered from it', async () => {
    const { openSpaces } = crossing();
    await openSpaces.open(META_ID);
    await openSpaces.enter(OTHER_ID);
    await openSpaces.enter(THIRD_ID);

    await openSpaces.exit(OTHER_ID);

    // ADR 0068: closing one Space never closes another. The record is a history
    // and never a containment, so nothing cascades down it.
    expect(openSpaces.getState().entries.map(({ id }) => id)).toEqual([META_ID, THIRD_ID]);
  });

  it('never exits the permanent Meta Space', async () => {
    const { openSpaces } = setup();
    const meta = await openSpaces.open(META_ID);

    await expect(openSpaces.exit(META_ID)).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'meta-space-permanent' },
    });
    expect(openSpaces.entry(META_ID)).toBe(meta);
  });
});
