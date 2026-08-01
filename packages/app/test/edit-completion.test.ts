import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Layout, type SpaceSnapshot } from '@project/core';
import type { Space } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { createPlacementEditor } from '../src/edit-completion';
import { createViewChoice, layoutPositionMap } from '../src/view';
import { completeDrag, node, settled } from './editor-fixtures';
import { waitForSettled } from './session-fixtures';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MINTED_ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const DEFAULT_LAYOUT_UUID = '00000000-0000-4000-8000-000000000021' as const;
const DEFAULT_LAYOUT_ID = uuidSchema.parse(DEFAULT_LAYOUT_UUID);
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const REENTRANT_LAYOUT_UUID = '00000000-0000-4000-8000-000000000023' as const;

const automaticSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Space',
    routes: [{ id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] }],
    layouts: [
      {
        id: OTHER_LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: { [CARD_B]: { x: 900, y: 700 } },
      },
    ],
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

const defaultLayout: Layout = {
  id: DEFAULT_LAYOUT_ID,
  title: 'Authored Layout',
  kind: 'positioned',
  positions: { [CARD_A]: { x: 10, y: 20 } },
  routes: [ROUTE_ID],
};
const otherLayout: Layout = {
  id: OTHER_LAYOUT_ID,
  title: 'Other Layout',
  kind: 'positioned',
  positions: { [CARD_B]: { x: 900, y: 700 } },
};
const positionedSnapshot: SpaceSnapshot = {
  ...automaticSnapshot,
  document: {
    ...automaticSnapshot.document,
    layouts: [defaultLayout, otherLayout],
    defaultView: DEFAULT_LAYOUT_ID,
  },
};

const projected = [node(CARD_A, 10, 20), node(CARD_B, 300, 20)];
const ignoreInstalledSpace = () => undefined;

describe('completed placement composition', () => {
  // `vi.spyOn` reconfigures an existing spy rather than installing a fresh one,
  // so an unrestored `mockReturnValue` becomes the fallback behind a later
  // test's `mockReturnValueOnce` chain. Minted ids would then depend on which
  // tests ran before, which is the kind of order dependence that only shows up
  // once someone runs a single test in isolation.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['graph', 'grid'] as const)(
    'leaves the %s View untouched when the Edge already exists',
    (view) => {
      const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
      const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
      const viewChoice = createViewChoice({ kind: 'view', view });
      const editor = createPlacementEditor({
        initialPositions: null,
        viewChoice,
        currentActiveRoute: () => ROUTE_ID,
        session,
        installSpace: ignoreInstalledSpace,
      });
      editor.getState().syncNodes(projected);

      const completed = editor.getState().connectCards(CARD_A, CARD_B, projected);

      expect(completed).toBe(false);
      expect(editor.getState().positions).toBeNull();
      expect(session.getState()).toMatchObject({
        acknowledgedRevision: 0n,
        working: automaticSnapshot,
      });
      expect(viewChoice.current()).toEqual({ kind: 'view', view });
    },
  );

  it.each(['graph', 'grid'] as const)(
    'connects Cards from the %s View as one completed Edit',
    async (view) => {
      vi.spyOn(crypto, 'randomUUID').mockReturnValue(DEFAULT_LAYOUT_UUID);
      const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
      const backend = new MemorySpaceBackend([loaded]);
      const session = openSpaceSession(backend, loaded);
      const viewChoice = createViewChoice({ kind: 'view', view });
      // The installed Space and the submitted snapshot are two collaborators,
      // and Edit completion installs the first before notifying. Discarding the
      // Space would leave the half the graph actually renders from unasserted.
      const installed: Space[] = [];
      const editor = createPlacementEditor({
        initialPositions: null,
        viewChoice,
        currentActiveRoute: () => ROUTE_ID,
        session,
        installSpace: (space) => installed.push(space),
      });
      editor.getState().syncNodes(projected);

      const completed = editor.getState().connectCards(CARD_B, CARD_A, projected);

      expect(completed).toBe(true);
      expect(installed).toHaveLength(1);
      expect(installed[0]!.routesById.get(ROUTE_ID)?.edges).toEqual([
        { from: CARD_A, to: CARD_B },
        { from: CARD_B, to: CARD_A },
      ]);
      expect(session.getState().working).toMatchObject({
        document: {
          routes: [
            {
              id: ROUTE_ID,
              edges: [
                { from: CARD_A, to: CARD_B },
                { from: CARD_B, to: CARD_A },
              ],
            },
          ],
          layouts: [
            { id: OTHER_LAYOUT_ID },
            {
              id: DEFAULT_LAYOUT_ID,
              title: 'Layout 2',
              positions: {
                [CARD_A]: { x: 10, y: 20 },
                [CARD_B]: { x: 300, y: 20 },
              },
              activeRoute: ROUTE_ID,
            },
          ],
          defaultView: DEFAULT_LAYOUT_ID,
        },
      });
      expect(viewChoice.current()).toEqual({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
      await waitForSettled(session.getState, session.subscribe);
      await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({ revision: 1n });
    },
  );

  it('adds the first minted Route to a selected Layout that shows no Routes', async () => {
    const routeLessLayout: Layout = {
      id: DEFAULT_LAYOUT_ID,
      title: 'Focused Layout',
      kind: 'positioned',
      positions: { [CARD_A]: { x: 10, y: 20 } },
      routes: [],
    };
    const routeLessSnapshot: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 2,
        title: 'Route-less Space',
        routes: [],
        layouts: [routeLessLayout],
        defaultView: DEFAULT_LAYOUT_ID,
      },
      cards: [automaticSnapshot.cards[0]!],
    };
    const loaded = { snapshot: routeLessSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const viewChoice = createViewChoice({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    const activatedRoutes: string[] = [];
    const editor = createPlacementEditor({
      initialPositions: layoutPositionMap(routeLessLayout),
      viewChoice,
      currentActiveRoute: () => null,
      session,
      installSpace: ignoreInstalledSpace,
      activateRoute: (routeId) => activatedRoutes.push(routeId),
      mintRouteId: () => MINTED_ROUTE_ID,
    });
    const projectedCard = [node(CARD_A, 10, 20)];
    editor.getState().syncNodes(projectedCard);

    const completed = editor.getState().connectCards(CARD_A, CARD_A, projectedCard);

    expect(completed).toBe(true);
    expect(session.getState().working.document).toMatchObject({
      routes: [
        {
          id: MINTED_ROUTE_ID,
          title: 'Route 1',
          edges: [{ from: CARD_A, to: CARD_A }],
        },
      ],
      layouts: [
        {
          id: DEFAULT_LAYOUT_ID,
          title: 'Focused Layout',
          routes: [MINTED_ROUTE_ID],
          activeRoute: MINTED_ROUTE_ID,
        },
      ],
      defaultView: DEFAULT_LAYOUT_ID,
    });
    expect(activatedRoutes).toEqual([MINTED_ROUTE_ID]);
    expect(viewChoice.current()).toEqual({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });

    await waitForSettled(session.getState, session.subscribe);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      revision: 1n,
      snapshot: {
        document: {
          layouts: [
            {
              id: DEFAULT_LAYOUT_ID,
              title: 'Focused Layout',
              routes: [MINTED_ROUTE_ID],
              activeRoute: MINTED_ROUTE_ID,
            },
          ],
        },
      },
    });
  });

  it('preserves an empty route filter when only placement changes', () => {
    const routeLessLayout: Layout = {
      id: DEFAULT_LAYOUT_ID,
      title: 'Focused Layout',
      kind: 'positioned',
      positions: { [CARD_A]: { x: 10, y: 20 } },
      routes: [],
    };
    const routeLessSnapshot: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 2,
        title: 'Route-less Space',
        routes: [],
        layouts: [routeLessLayout],
        defaultView: DEFAULT_LAYOUT_ID,
      },
      cards: [automaticSnapshot.cards[0]!],
    };
    const loaded = { snapshot: routeLessSnapshot, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const editor = createPlacementEditor({
      initialPositions: layoutPositionMap(routeLessLayout),
      viewChoice: createViewChoice({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID }),
      currentActiveRoute: () => null,
      session,
      installSpace: ignoreInstalledSpace,
    });
    editor.getState().syncNodes([node(CARD_A, 10, 20)]);

    completeDrag(editor, CARD_A, 70, 90);

    expect(session.getState().working.document.routes).toEqual([]);
    expect(session.getState().working.document.layouts).toEqual([
      {
        id: DEFAULT_LAYOUT_ID,
        title: 'Focused Layout',
        kind: 'positioned',
        positions: { [CARD_A]: { x: 70, y: 90 } },
        routes: [],
      },
    ]);
  });

  it('converts current owner state, selects locally, and persists asynchronously', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(DEFAULT_LAYOUT_UUID);
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const viewChoice = createViewChoice({ kind: 'view', view: 'graph' });
    const selectionNotifications: {
      readonly selection: ReturnType<typeof viewChoice.current>;
      readonly defaultView: SpaceSnapshot['document']['defaultView'];
      readonly layoutIds: readonly string[];
    }[] = [];
    viewChoice.subscribe(() => {
      const working = session.getState().working;
      selectionNotifications.push({
        selection: viewChoice.current(),
        defaultView: working.document.defaultView,
        layoutIds: (working.document.layouts ?? []).map((layout) => layout.id),
      });
    });
    const editor = createPlacementEditor({
      initialPositions: null,
      viewChoice,
      currentActiveRoute: () => ROUTE_ID,
      session,
      installSpace: ignoreInstalledSpace,
    });

    editor.getState().syncNodes(projected);
    completeDrag(editor, CARD_A, 500, 400);

    expect(session.getState().acknowledgedRevision).toBe(0n);
    expect(session.getState().working.document.defaultView).toBe(DEFAULT_LAYOUT_ID);
    expect(session.getState().working.document.layouts?.at(-1)).toMatchObject({
      id: DEFAULT_LAYOUT_ID,
      title: 'Layout 2',
      activeRoute: ROUTE_ID,
      positions: {
        [CARD_A]: { x: 500, y: 400 },
        [CARD_B]: { x: 300, y: 20 },
      },
    });
    expect(viewChoice.current()).toEqual({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    expect(selectionNotifications).toEqual([
      {
        selection: { kind: 'layout', layoutId: DEFAULT_LAYOUT_ID },
        defaultView: DEFAULT_LAYOUT_ID,
        layoutIds: [OTHER_LAYOUT_ID, DEFAULT_LAYOUT_ID],
      },
    ]);
    await waitForSettled(session.getState, session.subscribe);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      revision: 1n,
      snapshot: { document: { defaultView: DEFAULT_LAYOUT_ID } },
    });
  });

  it('numbers a converted Layout after every existing neutral title', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { maxLength: 12 }), (numbers) => {
        const layouts: Layout[] = numbers.map((number, index) => ({
          id: uuidSchema.parse(`00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`),
          title: `Layout ${number}`,
          kind: 'positioned',
          positions: {},
        }));
        const base: SpaceSnapshot = {
          ...automaticSnapshot,
          document: { ...automaticSnapshot.document, layouts },
        };

        const loaded = { snapshot: base, revision: 0n, exportedRevision: null };
        const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
        const viewChoice = createViewChoice({ kind: 'view', view: 'graph' });
        const editor = createPlacementEditor({
          initialPositions: null,
          viewChoice,
          currentActiveRoute: () => ROUTE_ID,
          session,
          installSpace: ignoreInstalledSpace,
        });
        editor.getState().syncNodes(projected);
        completeDrag(editor, CARD_A, 1, 2);

        expect(session.getState().working.document.layouts?.slice(0, -1)).toEqual(layouts);
        expect(session.getState().working.document.layouts?.at(-1)?.title).toBe(
          `Layout ${Math.max(0, ...numbers) + 1}`,
        );
      }),
    );
  });

  it('preserves an existing Layout and unrelated Layouts when its first edit persists', async () => {
    const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const viewChoice = createViewChoice({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    const editor = createPlacementEditor({
      initialPositions: layoutPositionMap(defaultLayout),
      viewChoice,
      currentActiveRoute: () => ROUTE_ID,
      session,
      installSpace: ignoreInstalledSpace,
    });

    editor.getState().syncNodes(projected);
    completeDrag(editor, CARD_A, 700, 500);
    await waitForSettled(session.getState, session.subscribe);

    const persisted = await backend.loadSpace(SPACE_ID);
    expect(persisted?.revision).toBe(1n);
    expect(persisted?.snapshot.document.defaultView).toBe(DEFAULT_LAYOUT_ID);
    expect(persisted?.snapshot.document.layouts).toEqual([
      {
        id: defaultLayout.id,
        title: defaultLayout.title,
        kind: 'positioned',
        positions: { [CARD_A]: { x: 700, y: 500 } },
        routes: [ROUTE_ID],
        activeRoute: ROUTE_ID,
      },
      otherLayout,
    ]);
  });

  it('persists one revision when React Flow repeats an identical settled drag event', async () => {
    const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const editor = createPlacementEditor({
      initialPositions: layoutPositionMap(defaultLayout),
      viewChoice: createViewChoice({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID }),
      currentActiveRoute: () => ROUTE_ID,
      session,
      installSpace: ignoreInstalledSpace,
    });
    editor.getState().syncNodes(projected);

    completeDrag(editor, CARD_A, 700, 500);
    editor.getState().changeNodes(settled(CARD_A, 700, 500));
    await waitForSettled(session.getState, session.subscribe);

    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({ revision: 1n });
  });

  it('serializes a second completed Edit emitted while the first submits', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(DEFAULT_LAYOUT_UUID)
      .mockReturnValueOnce(REENTRANT_LAYOUT_UUID);
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const viewChoice = createViewChoice({ kind: 'view', view: 'graph' });
    const editor = createPlacementEditor({
      initialPositions: null,
      viewChoice,
      currentActiveRoute: () => ROUTE_ID,
      session,
      installSpace: ignoreInstalledSpace,
    });
    editor.getState().syncNodes(projected);
    let secondEditCompleted = false;
    session.subscribe(() => {
      if (secondEditCompleted || session.getState().working.document.defaultView === undefined) {
        return;
      }
      secondEditCompleted = true;
      completeDrag(editor, CARD_B, 600, 800);
    });

    completeDrag(editor, CARD_A, 500, 400);

    expect(session.getState().working.document.layouts).toHaveLength(2);
    expect(session.getState().working.document.layouts?.at(-1)).toMatchObject({
      id: DEFAULT_LAYOUT_ID,
      positions: {
        [CARD_A]: { x: 500, y: 400 },
        [CARD_B]: { x: 600, y: 800 },
      },
    });
    expect(session.getState().working.document.defaultView).toBe(DEFAULT_LAYOUT_ID);
    expect(viewChoice.current()).toEqual({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    await waitForSettled(session.getState, session.subscribe);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      revision: 2n,
      snapshot: {
        document: {
          defaultView: DEFAULT_LAYOUT_ID,
          layouts: [{ id: OTHER_LAYOUT_ID }, { id: DEFAULT_LAYOUT_ID }],
        },
      },
    });
  });

  it('finishes queued Edit completion before rethrowing a synchronous listener error', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(DEFAULT_LAYOUT_UUID);
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const viewChoice = createViewChoice({ kind: 'view', view: 'graph' });
    const editor = createPlacementEditor({
      initialPositions: null,
      viewChoice,
      currentActiveRoute: () => ROUTE_ID,
      session,
      installSpace: ignoreInstalledSpace,
    });
    editor.getState().syncNodes(projected);
    const listenerError = new Error('session listener failed');
    let listenerThrew = false;
    session.subscribe(() => {
      if (listenerThrew || session.getState().working.document.defaultView === undefined) return;
      listenerThrew = true;
      completeDrag(editor, CARD_B, 600, 800);
      throw listenerError;
    });

    let caught: unknown;
    try {
      completeDrag(editor, CARD_A, 500, 400);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(listenerError);
    expect(session.getState().working.document.layouts).toHaveLength(2);
    expect(session.getState().working.document.layouts?.at(-1)).toMatchObject({
      id: DEFAULT_LAYOUT_ID,
      positions: {
        [CARD_A]: { x: 500, y: 400 },
        [CARD_B]: { x: 600, y: 800 },
      },
    });
    expect(session.getState().working.document.defaultView).toBe(DEFAULT_LAYOUT_ID);
    expect(viewChoice.current()).toEqual({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    await waitForSettled(session.getState, session.subscribe);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      revision: 1n,
      snapshot: {
        document: {
          defaultView: DEFAULT_LAYOUT_ID,
          layouts: [{ id: OTHER_LAYOUT_ID }, { id: DEFAULT_LAYOUT_ID }],
        },
      },
    });
  });
});
