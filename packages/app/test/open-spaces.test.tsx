import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  type CommitResult,
} from '@project/persistence';
import { createOpenSpaces } from '../src/open-spaces';
import { OpenSpacesApplication } from '../src/components/OpenSpacesApplication';
import { unavailable } from './command-dock';
import { recordingHistory } from './browser-history';
import { productDestinationPath } from '@project/http';
import { mintingIds } from './minting';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const UNOPENED_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000ff');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const GRAPH_ONE = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const GRAPH_TWO = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const OTHER_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const META_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const META_GRAPH_ONE = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const META_GRAPH_TWO = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const META_SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');
const MINTED_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000c');
const SECOND_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000d');
const SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000e');
/**
 * A third Space, which is what a crossing needs to be a tree rather than a line.
 *
 * Two Spaces can only ever show a Space entered from another; re-homing needs
 * three, because what it asserts is where the Space below the exited one lands.
 */
const THIRD_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000f');
const THIRD_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const THIRD_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const THIRD_GRAPH_ONE = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const THIRD_GRAPH_TWO = uuidSchema.parse('00000000-0000-4000-8000-000000000013');

/**
 * Two aggregate-valid Spaces. Every Resource, Map and Graph id is distinct
 * across them, because a Space Resource coordination validates the whole aggregate
 * and refuses a duplicate id wherever it appears — and Meta carries the Space
 * Resource that owns the ordinary Space, which the same intake requires.
 */
const snapshot = (id: UUID, title: string): SpaceSnapshot => {
  const meta = id === META_ID;
  const third = id === THIRD_ID;
  const resourceId = meta ? RESOURCE_ID : third ? THIRD_RESOURCE_ID : OTHER_RESOURCE_ID;
  const mapId = meta ? META_MAP_ID : third ? THIRD_MAP_ID : MAP_ID;
  const graphOne = meta ? META_GRAPH_ONE : third ? THIRD_GRAPH_ONE : GRAPH_ONE;
  const graphTwo = meta ? META_GRAPH_TWO : third ? THIRD_GRAPH_TWO : GRAPH_TWO;
  return {
    id,
    document: {
      version: 1,
      title,
      defaultMap: mapId,
      maps: [
        {
          id: mapId,
          title: 'Map',
          kind: 'positioned',
          positions: meta
            ? {
                [resourceId]: { x: 0, y: 0, open: false },
                [META_SPACE_RESOURCE_ID]: { x: 0, y: 40, open: false },
              }
            : { [resourceId]: { x: 0, y: 0, open: false } },
          graphs: [
            { id: graphOne, title: 'One', edges: [] },
            { id: graphTwo, title: 'Two', edges: [] },
          ],
          activeGraph: graphOne,
        },
        // A second Map, so a selection made in an open Space can differ from
        // the one an address proposes. Only the Space those tests use needs it,
        // and its ids are its own — every Map and Graph id is distinct across
        // the three Spaces, because a Space Resource coordination validates the
        // whole aggregate and refuses a duplicate wherever it appears.
        ...(id === OTHER_ID
          ? [
              {
                id: SECOND_MAP_ID,
                title: 'Second Map',
                kind: 'positioned' as const,
                positions: {},
                graphs: [{ id: SECOND_GRAPH_ID, title: 'Second', edges: [] }],
                activeGraph: SECOND_GRAPH_ID,
              },
            ]
          : []),
      ],
    },
    resources: meta
      ? [
          { id: resourceId, document: { title: 'Resource', kind: 'markdown', body: '' } },
          {
            id: META_SPACE_RESOURCE_ID,
            // The Map `Other` opens on and that Map's Active Graph —
            // what the lifecycle would have stored had this Resource been authored
            // rather than written out (ADR 0079).
            document: {
              title: 'Other',
              kind: 'space',
              spaceId: OTHER_ID,
              map: MAP_ID,
              graph: GRAPH_ONE,
            },
          },
        ]
      : [{ id: resourceId, document: { title: 'Resource', kind: 'markdown', body: '' } }],
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
 * The third is opt-in rather than always present because a Space Resource
 * coordination is written over every Space the backend holds: a third one in
 * the default fixture changes what those tests are coordinating across, and
 * they assert on the requests it makes.
 */
const setup = (
  control?: MemorySpaceBackendTestControl,
  newId: () => UUID = () => RESOURCE_ID,
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
      metaSpaceTitle: spaces.find(([id]) => id === META_ID)?.[1] ?? 'Meta',
      newId,
      history,
    }),
  };
};

/** Distinct ids for a Space Resource coordination, which mints several per call. */
const countingIds = (): (() => UUID) => {
  let next = 0x20;
  return () => uuidSchema.parse(`00000000-0000-4000-8000-0000000000${(next++).toString(16)}`);
};

const edit = (space: SpaceSnapshot): SpaceSnapshot => ({
  ...space,
  document: { ...space.document, title: `${space.document.title} edited` },
});

describe('Open Spaces', () => {
  it('lists Meta from startup while it is closed, and from its own session once open', async () => {
    const { openSpaces } = setup();
    await openSpaces.open(OTHER_ID);
    expect(openSpaces.entry(META_ID)).toBeUndefined();
    expect(openSpaces.listing()[0]).toEqual({
      spaceId: META_ID,
      title: 'Meta',
      depth: 0,
      open: false,
    });

    const meta = await openSpaces.open(META_ID);
    meta.session.submit(edit(meta.session.getState().working));
    expect(openSpaces.listing()[0]).toMatchObject({
      spaceId: META_ID,
      title: 'Meta edited',
      depth: 0,
      open: true,
    });
  });

  it('memoizes the listing on the open set’s state identity', async () => {
    const { openSpaces } = setup();
    await openSpaces.open(OTHER_ID);

    const first = openSpaces.listing();
    expect(openSpaces.listing()).toBe(first);

    const meta = await openSpaces.open(META_ID);
    const afterOpen = openSpaces.listing();
    expect(afterOpen).not.toBe(first);

    meta.session.submit(edit(meta.session.getState().working));
    const afterEdit = openSpaces.listing();
    expect(afterEdit).not.toBe(afterOpen);
    expect(openSpaces.listing()).toBe(afterEdit);
  });

  it('authors the embedded Map while preserving the full canvas selection', async () => {
    const { openSpaces } = setup();
    const target = await openSpaces.open(OTHER_ID, SECOND_MAP_ID);
    const before = target.session.getState().working;
    expect(
      target.app.authoring.completeInMap(MAP_ID, {
        kind: 'opened-resource',
        resourceId: OTHER_RESOURCE_ID,
      }).kind,
    ).toBe('completed');
    const after = target.session.getState().working;
    expect(
      after.document.maps?.find((map) => map.id === MAP_ID)?.positions[OTHER_RESOURCE_ID]?.open,
    ).toBe(true);
    expect(after.document.maps?.find((map) => map.id === SECOND_MAP_ID)).toEqual(
      before.document.maps?.find((map) => map.id === SECOND_MAP_ID),
    );
    expect(target.app.navigation.getState().selectedMapId).toBe(SECOND_MAP_ID);
    expect(after.document.defaultMap).toBe(before.document.defaultMap);
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

    const reopened = await openSpaces.enter(OTHER_ID, SECOND_MAP_ID);

    expect(reopened).toBe(other);
    expect(reopened.app.navigation.getState()).toMatchObject({
      selectedMapId: MAP_ID,
      activeGraphId: GRAPH_TWO,
    });
  });

  it('keeps the Enter framing seed across reads of the same entry', async () => {
    const { openSpaces } = setup();
    await openSpaces.open(META_ID);
    const framing = { centreX: 100, centreY: 50, zoom: 2 };
    const entered = await openSpaces.enter(OTHER_ID, MAP_ID, GRAPH_ONE, framing);

    expect(openSpaces.openingFraming(entered)).toEqual(framing);
    expect(openSpaces.openingFraming(entered)).toEqual(framing);

    await openSpaces.switchTo(META_ID);
    const again = await openSpaces.enter(OTHER_ID, SECOND_MAP_ID, GRAPH_TWO, {
      centreX: 1,
      centreY: 1,
      zoom: 1,
    });

    expect(again).toBe(entered);
    expect(openSpaces.openingFraming(again)).toEqual(framing);
  });

  /**
   * Embed mounts the target without activating it. Enter is then the first
   * canvas showing, and SpaceCanvas seeds from `openingFraming` on the
   * activation notify — so that notify must already carry the seed.
   */
  it('makes the Enter framing seed readable on the activation that first shows an embedded Space', async () => {
    const { openSpaces } = setup();
    await openSpaces.open(META_ID);
    const embedded = await openSpaces.embed(OTHER_ID);
    expect(openSpaces.getState().activeSpaceId).toBe(META_ID);
    expect(openSpaces.openingFraming(embedded)).toBeUndefined();

    const framing = { centreX: 100, centreY: 50, zoom: 2 };
    let capturedActivation = false;
    let framingAtActivation: typeof framing | undefined;
    const unsubscribe = openSpaces.subscribe(() => {
      if (capturedActivation || openSpaces.getState().activeSpaceId !== OTHER_ID) return;
      capturedActivation = true;
      const entry = openSpaces.entry(OTHER_ID);
      framingAtActivation = entry === undefined ? undefined : openSpaces.openingFraming(entry);
    });

    await openSpaces.enter(OTHER_ID, MAP_ID, GRAPH_ONE, framing);
    unsubscribe();

    expect(capturedActivation).toBe(true);
    expect(framingAtActivation).toEqual(framing);
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
      { kind: 'retryable-failure', code: 'network' } satisfies CommitResult,
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
      selectedMapId: MAP_ID,
      activeGraphId: GRAPH_ONE,
    });
  });

  it('warns before exiting rejected work and permits an explicit exit', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'permanent-failure', code: 'forbidden' });
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

  /**
   * A refused aggregate warns before exit exactly as a permanent rejection
   * does — both leave nothing stored to lose, and both recover only through a
   * further Edit rather than this Space's own persistence surface — even
   * though the two are distinct `SpaceSessionState['persistence']` kinds.
   */
  it('warns before exiting refused work and permits an explicit exit', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'aggregate-refused',
      errors: [{ kind: 'ordinary-space-unreferenced', spaceId: OTHER_ID }],
    });
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('refused'));

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

  it('refuses to exit work rejected for size, which Retry can still save', async () => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'permanent-failure', code: 'payload-too-large' });
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('rejected'));

    await expect(openSpaces.exit(OTHER_ID)).resolves.toEqual({
      kind: 'refused',
      refusal: { code: 'persistence-recovery-required', recovery: 'retry' },
    });
    expect(openSpaces.entry(OTHER_ID)).toBe(other);
  });

  it('commits an edit queued behind a Space Resource coordination before exiting', async () => {
    const control = new MemorySpaceBackendTestControl();
    const { backend, openSpaces } = setup(control, countingIds());
    await openSpaces.open(META_ID);
    const other = await openSpaces.open(OTHER_ID);

    const release = control.deferNextCommit();
    const creating = openSpaces.spaceResources.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
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
    const first = openSpaces.spaceResources.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      title: 'First child',
      position: { x: 10, y: 10 },
    });
    await vi.waitFor(() => expect(control.requests).toHaveLength(1));

    // Exiting waits behind the running coordination, and a second coordination
    // then queues behind the same turn. When the first ends it wakes both: the
    // wait reports a retirable Space, and the second raises the barrier again
    // before the exit gets to retire it. Retiring has to survive that window.
    const exiting = openSpaces.exit(OTHER_ID);
    const second = openSpaces.spaceResources.create({
      containingSpaceId: META_ID,
      mapId: META_MAP_ID,
      title: 'Second child',
      position: { x: 20, y: 20 },
    });

    releaseFirst();
    await expect(exiting).resolves.toEqual({ kind: 'exited' });
    await first;
    await second;
    expect(openSpaces.entry(OTHER_ID)).toBeUndefined();
  });

  it('mints a composed Space\u2019s Resource identities from the minter it was given', async () => {
    const { openSpaces } = setup(undefined, mintingIds(MINTED_RESOURCE_ID));
    const other = await openSpaces.open(OTHER_ID);

    expect(
      other.app.authoring.complete({ kind: 'created-resource', anchor: { x: 100, y: 100 } }),
    ).toEqual({ kind: 'completed', createdResourceId: MINTED_RESOURCE_ID });

    expect(other.session.getState().working.resources.map(({ id }) => id)).toContain(
      MINTED_RESOURCE_ID,
    );
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

  it('seeds the Resource’s Graph when Enter waits out an exit of the same Space', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control);
    const other = await openSpaces.open(OTHER_ID);
    other.app.navigation.activateGraph(GRAPH_TWO);
    await openSpaces.open(META_ID);
    other.session.submit(edit(other.session.getState().working));
    await vi.waitFor(() => expect(other.session.getState().persistence.kind).toBe('pending'));

    // Exit parks until Other settles, so Enter reads the still-advertised entry
    // and would treat this as a return if first-display were decided before the
    // wait. The entry is gone once the exit settles, and the reloaded Space is
    // a first canvas showing — GRAPH_TWO is not that Map's Active Graph, so
    // compose alone cannot look like a seed.
    const exiting = openSpaces.exit(OTHER_ID);
    await Promise.resolve();
    const entering = openSpaces.enter(OTHER_ID, MAP_ID, GRAPH_TWO);

    release();
    await expect(exiting).resolves.toEqual({ kind: 'exited' });
    const entered = await entering;

    expect(entered).not.toBe(other);
    expect(entered.app.navigation.getState()).toMatchObject({
      selectedMapId: MAP_ID,
      activeGraphId: GRAPH_TWO,
    });
  });

  it('does not apply a superseded Enter’s Graph once a later activation owns the canvas', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control);
    const meta = await openSpaces.open(META_ID);
    meta.session.submit(edit(meta.session.getState().working));
    await vi.waitFor(() => expect(meta.session.getState().persistence.kind).toBe('pending'));

    // Enter numbers first and parks until Meta settles. Open is the later
    // choice, so it owns the canvas. GRAPH_TWO is only applied by Enter's
    // first-display seed — compose opens the Map on GRAPH_ONE.
    const entering = openSpaces.enter(OTHER_ID, MAP_ID, GRAPH_TWO);
    await Promise.resolve();
    const opening = openSpaces.open(OTHER_ID);

    release();
    await entering;
    await opening;

    expect(openSpaces.getState().activeSpaceId).toBe(OTHER_ID);
    expect(openSpaces.entry(OTHER_ID)?.app.navigation.getState()).toMatchObject({
      selectedMapId: MAP_ID,
      activeGraphId: GRAPH_ONE,
    });
  });

  it('does not apply a superseded Enter’s Map once a later activation owns the canvas', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control);
    const meta = await openSpaces.open(META_ID);
    meta.session.submit(edit(meta.session.getState().working));
    await vi.waitFor(() => expect(meta.session.getState().persistence.kind).toBe('pending'));

    // Enter numbers first and parks until Meta settles. Open is the later
    // choice, so it owns the canvas. SECOND_MAP_ID is only applied by
    // Enter's first-display seed — compose opens the Space on MAP_ID.
    const entering = openSpaces.enter(OTHER_ID, SECOND_MAP_ID);
    await Promise.resolve();
    const opening = openSpaces.open(OTHER_ID);

    release();
    await entering;
    await opening;

    expect(openSpaces.getState().activeSpaceId).toBe(OTHER_ID);
    expect(openSpaces.entry(OTHER_ID)?.app.navigation.getState()).toMatchObject({
      selectedMapId: MAP_ID,
      activeGraphId: GRAPH_ONE,
    });
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
      kind: 'map',
      spaceId: META_ID,
      mapId: META_MAP_ID,
    });
    const other = await openSpaces.open(OTHER_ID);
    const otherPath = history.pathname();
    other.app.navigation.selectMap(SECOND_MAP_ID);
    const writes = [...history.writes];

    history.popTo(metaPath);
    await vi.waitFor(() => expect(openSpaces.getState().activeSpaceId).toBe(META_ID));
    expect(history.writes).toEqual(writes);

    history.popTo(otherPath);
    await vi.waitFor(() => expect(openSpaces.getState().activeSpaceId).toBe(OTHER_ID));
    expect(other.app.navigation.getState().selectedMapId).toBe(MAP_ID);
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
      kind: 'map',
      spaceId: OTHER_ID,
      mapId: MAP_ID,
    });
    const first = await openSpaces.openPath(path);
    first.opened.app.navigation.selectMap(SECOND_MAP_ID);

    // The Space is already open, so it keeps the selection it is being worked
    // in. Reporting the URL's selection anyway would have the caller open a
    // Graph against a Map that was never selected.
    const again = await openSpaces.openPath(path);

    expect(again.opened).toBe(first.opened);
    expect(again.opening?.selection).toBe(SECOND_MAP_ID);
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
    // because the same edit removes its Space Resource, but the repository never
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

    await openSpaces.spaceResources.delete({
      containingSpaceId: META_ID,
      resourceId: META_SPACE_RESOURCE_ID,
    });
    await vi.waitFor(() => expect(meta.session.getState().persistence.kind).toBe('conflicted'));
    expect(meta.session.getState().working.resources.map((resource) => resource.id)).not.toContain(
      META_SPACE_RESOURCE_ID,
    );
    const before = meta.app.authoring.getState().replacementEpoch;

    // Reload is reachable here precisely because the baseline is what is
    // stored: the cascade never committed, so accepting it puts the Space Resource
    // the edit removed back.
    expect(meta.app.authoring.acceptStoredSpace()).toBeNull();

    expect(meta.session.getState()).toMatchObject({
      working: beforeCascade,
      acknowledgedRevision: 1n,
      persistence: { kind: 'settled' },
    });
    expect(meta.session.getState().working.resources.map((resource) => resource.id)).toContain(
      META_SPACE_RESOURCE_ID,
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
   *
   * It is display-only, and these tests are about the record rather than about
   * any behaviour hanging off it: Exit closes one Space whether or not something
   * was entered from it (ADR 0068), which is the next test but one.
   */
  const crossing = () =>
    setup(undefined, () => RESOURCE_ID, [
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
      productDestinationPath({ kind: 'map', spaceId: THIRD_ID, mapId: THIRD_MAP_ID }),
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
      productDestinationPath({ kind: 'map', spaceId: OTHER_ID, mapId: MAP_ID }),
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
    // it. Walking up lazily cannot answer this: the exited entry is gone and
    // its own opener with it, so there is no chain left to follow.
    const { entries, openedFrom } = openSpaces.getState();
    expect(entries.map(({ id }) => id)).toContain(THIRD_ID);
    expect(openedFrom.get(THIRD_ID)).toBe(META_ID);
    expect(openedFrom.has(OTHER_ID)).toBe(false);
  });

  it('joins a Space reopened while its exit was still waiting at the root', async () => {
    const control = new MemorySpaceBackendTestControl();
    const release = control.deferNextCommit();
    const { openSpaces } = setup(control, () => RESOURCE_ID, [
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

  describe('choosing a row from the Open Spaces menu', () => {
    it('refuses to select a closed non-Meta Space', async () => {
      const { openSpaces } = setup();

      await expect(openSpaces.select(OTHER_ID)).resolves.toEqual({
        kind: 'refused',
        code: 'space-not-open',
      });
    });

    it('switches to an open Space', async () => {
      const { openSpaces } = setup();
      await openSpaces.open(META_ID);
      await openSpaces.open(OTHER_ID);
      await openSpaces.switchTo(META_ID);

      await expect(openSpaces.select(OTHER_ID)).resolves.toEqual({
        kind: 'switched',
        title: 'Other',
      });
      expect(openSpaces.getState().activeSpaceId).toBe(OTHER_ID);
    });

    it('answers switched for the Space already on the canvas', async () => {
      const { openSpaces } = setup();
      await openSpaces.open(OTHER_ID);

      await expect(openSpaces.select(OTHER_ID)).resolves.toEqual({
        kind: 'switched',
        title: 'Other',
      });
      expect(openSpaces.getState().activeSpaceId).toBe(OTHER_ID);
    });

    it('opens a closed Meta with no Opener', async () => {
      const { openSpaces } = setup();
      await openSpaces.open(OTHER_ID);

      await expect(openSpaces.select(META_ID)).resolves.toEqual({
        kind: 'opened',
        title: 'Meta',
      });
      expect(openSpaces.getState().activeSpaceId).toBe(META_ID);
      expect(openSpaces.getState().openedFrom.get(META_ID)).toBe(null);
    });

    it('still throws a load failure rather than answering refused', async () => {
      const { backend, openSpaces } = setup();
      vi.spyOn(backend, 'loadSpace').mockRejectedValueOnce(new Error('The space is unavailable.'));

      await expect(openSpaces.select(META_ID)).rejects.toThrow('The space is unavailable.');
    });
  });

  describe('the Opener', () => {
    it('names the Space a crossing was made from', async () => {
      const { openSpaces } = setup();
      await openSpaces.open(META_ID);
      const other = await openSpaces.enter(OTHER_ID);

      expect(openSpaces.opener(other.id)).toEqual({ spaceId: META_ID, title: 'Meta' });
    });

    it('answers null for a Space opened directly, and for one with nothing open', () => {
      const { openSpaces } = setup();

      expect(openSpaces.opener(META_ID)).toBeNull();
    });
  });

  /**
   * What the tree the Open Spaces menu draws is a picture of, read through
   * `listing()`.
   *
   * A row whose opener is absent is not among the cases: `listing()`'s only
   * producer, `openedFrom`, cannot produce one — every
   * entry begins with a real opener and `retireOpenSpace` re-homes what an exit
   * would otherwise strand — so there is no way to reach it through the public
   * seam.
   */
  describe('the tree the listing draws (ADR 0082)', () => {
    it('derives each row’s depth from the crossing that opened it', async () => {
      const { openSpaces } = crossing();
      await openSpaces.open(META_ID);
      await openSpaces.enter(OTHER_ID);
      await openSpaces.enter(THIRD_ID);

      expect(openSpaces.listing().map((row) => [row.title, row.depth])).toEqual([
        ['Meta', 0],
        ['Other', 1],
        ['Third', 2],
      ]);
    });

    it('keeps siblings in the order they were opened', async () => {
      const { openSpaces } = crossing();
      await openSpaces.open(META_ID);
      await openSpaces.enter(THIRD_ID);
      await openSpaces.switchTo(META_ID);
      await openSpaces.enter(OTHER_ID);

      expect(openSpaces.listing().map((row) => row.title)).toEqual(['Meta', 'Third', 'Other']);
    });

    it('draws Meta first even when it was entered from another Space', async () => {
      const { openSpaces } = crossing();
      await openSpaces.open(OTHER_ID);
      await openSpaces.enter(META_ID);
      await openSpaces.enter(THIRD_ID);

      expect(openSpaces.listing().map((row) => [row.title, row.depth])).toEqual([
        ['Meta', 0],
        ['Third', 1],
        ['Other', 0],
      ]);
    });

    it('draws Meta first when it was opened directly after another Space', async () => {
      const { openSpaces } = setup();
      await openSpaces.open(OTHER_ID);
      await openSpaces.open(META_ID);

      expect(openSpaces.listing().map((row) => row.title)).toEqual(['Meta', 'Other']);
    });
  });

  /**
   * The Meta-row rule: Meta's row does not
   * depend on the Space list read, and a failure to open it names Meta by the
   * title the menu drew rather than by a placeholder.
   */
  describe('Meta’s row in the Open Spaces menu', () => {
    it('lists a closed Meta by its title independently of the Space list read', async () => {
      const control = new MemorySpaceBackendTestControl();
      const { backend, openSpaces } = setup(control);
      const failingList = vi.spyOn(backend, 'listSpaces');
      failingList.mockRejectedValue(new Error('The Space list is unavailable.'));
      await openSpaces.open(OTHER_ID);

      // `listing()` never calls `listSpaces` at all, which is the whole of the
      // independence this proves: naming Meta cannot wait on, or fail with, a
      // read this derivation does not make.
      expect(failingList).not.toHaveBeenCalled();
      expect(openSpaces.listing()[0]).toEqual({
        spaceId: META_ID,
        title: 'Meta',
        depth: 0,
        open: false,
      });
    });
  });

  /**
   * The one rendered case decision 11 keeps: the Dock draws whatever
   * `listing()` computes, and a refusal to open the row it drew names the
   * Space by the title that row carried (decision 10) rather than by a
   * placeholder — ported from `space-set-freshness.test.tsx`'s "names Meta by
   * its title when it cannot be opened".
   */
  describe('choosing a closed Meta that cannot be opened, rendered', () => {
    beforeAll(() => {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe(): void {
            return undefined;
          }
          unobserve(): void {
            return undefined;
          }
          disconnect(): void {
            return undefined;
          }
        },
      );
      // Base UI's positioner measures, and jsdom ships neither pointer capture
      // nor `scrollIntoView`; both are reached before a menu can open.
      HTMLElement.prototype.hasPointerCapture = () => false;
      HTMLElement.prototype.setPointerCapture = () => undefined;
      HTMLElement.prototype.releasePointerCapture = () => undefined;
      HTMLElement.prototype.scrollIntoView = () => undefined;
    });

    afterAll(() => vi.unstubAllGlobals());

    /** A backend that cannot load the Meta Space, as a dropped request would. */
    class MetaUnloadableBackend extends MemorySpaceBackend {
      override loadSpace(id: Parameters<MemorySpaceBackend['loadSpace']>[0]) {
        return id === META_ID
          ? Promise.reject(new Error('The Meta Space is unavailable.'))
          : super.loadSpace(id);
      }
    }

    it('names Meta by the title the menu drew when it cannot be opened', async () => {
      const backend = new MetaUnloadableBackend(META_ID, [
        loaded(META_ID, 'Meta'),
        loaded(OTHER_ID, 'Other'),
      ]);
      const reported: unknown[] = [];
      const spaces = createOpenSpaces({
        backend,
        metaSpaceId: META_ID,
        metaSpaceTitle: 'Meta',
        newId: () => RESOURCE_ID,
        history: recordingHistory(),
        reportObserverError: (error) => reported.push(error),
      });
      const initial = await spaces.open(OTHER_ID);
      render(<OpenSpacesApplication spaces={spaces} initial={initial} />);
      const create = await screen.findByRole('button', { name: 'Create Markdown Resource' });
      await waitFor(() => expect(unavailable(create)).toBe(false));

      fireEvent.click(screen.getByRole('button', { name: 'Spaces. 1 open.' }));
      fireEvent.click(
        within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: 'Meta' }),
      );

      expect(await screen.findByText('Meta could not be opened.')).toBeInTheDocument();
      expect(screen.queryByText('That Space could not be opened.')).not.toBeInTheDocument();
    });
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
