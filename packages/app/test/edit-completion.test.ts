import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Layout, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot, type Space } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { createPlacementEditor } from '../src/edit-completion';
import { ROUTE_PALETTE, routeColorMap } from '../src/colors';
import { createViewChoice, layoutPositionMap } from '../src/view';
import { completeDrag, node, settled } from './editor-fixtures';
import { waitForSettled } from './session-fixtures';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CREATED_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const MISSING_ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const MINTED_ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const MISSING_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const NOTES_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const DEFAULT_LAYOUT_UUID = '00000000-0000-4000-8000-000000000021' as const;
const DEFAULT_LAYOUT_ID = uuidSchema.parse(DEFAULT_LAYOUT_UUID);
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const REENTRANT_LAYOUT_UUID = '00000000-0000-4000-8000-000000000023' as const;
const MISSING_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');

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

/** A Space that carries no Layout at all — the normal hand-authored state (ADR 0025). */
const unlaidSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Space',
    routes: automaticSnapshot.document.routes,
  },
  cards: automaticSnapshot.cards,
};

const projected = [node(CARD_A, 10, 20), node(CARD_B, 300, 20)];
const ignoreInstalledSpace = () => undefined;

/**
 * A Space with no Route at all, whose sole Layout filters to no Routes — the
 * two cases below both start here, one minting the first Route into it and one
 * proving a placement-only edit leaves the empty filter alone. The loaded
 * wrapper is built per test because each opens its own backend and session.
 */
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
const routeLessLoaded = () => ({
  snapshot: routeLessSnapshot,
  revision: 0n,
  exportedRevision: null,
});

describe('completed placement composition', () => {
  // `vi.spyOn` reconfigures an existing spy rather than installing a fresh one,
  // so an unrestored `mockReturnValue` becomes the fallback behind a later
  // test's `mockReturnValueOnce` chain. Minted ids would then depend on which
  // tests ran before, which is the kind of order dependence that only shows up
  // once someone runs a single test in isolation.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects connections when the selected Layout shows no active Route', () => {
    const filteredLayout: Layout = { ...defaultLayout, routes: [] };
    const filteredSnapshot: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        layouts: [filteredLayout, otherLayout],
      },
    };
    const loaded = { snapshot: filteredSnapshot, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const viewChoice = createViewChoice({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    const initialPositions = layoutPositionMap(filteredLayout);
    const editor = createPlacementEditor({
      initialPositions,
      viewChoice,
      currentActiveRoute: () => null,
      session,
      installSpace: ignoreInstalledSpace,
    });
    editor.getState().syncNodes(projected);

    expect(editor.getState().connectCards(CARD_B, CARD_A, projected)).toBe(false);
    let createResult: boolean | undefined;
    expect(() => {
      createResult = editor
        .getState()
        .createConnectedCard(CARD_A, CREATED_CARD_ID, { x: 500, y: 300 });
    }).not.toThrow();

    expect(createResult).toBe(false);
    expect(editor.getState()).toMatchObject({
      positions: initialPositions,
      completedConnection: null,
    });
    expect(session.getState()).toMatchObject({
      acknowledgedRevision: 0n,
      working: filteredSnapshot,
    });
    expect(viewChoice.current()).toEqual({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
  });

  it('creates the first connected Card on a route-less Layout that filters every Route', async () => {
    const routeLessLayout: Layout = {
      id: DEFAULT_LAYOUT_ID,
      title: 'Authored Layout',
      kind: 'positioned',
      positions: { [CARD_A]: { x: 10, y: 20 } },
      routes: [],
    };
    const unrelatedLayout: Layout = {
      id: OTHER_LAYOUT_ID,
      title: 'Other Layout',
      kind: 'positioned',
      positions: { [CARD_A]: { x: 900, y: 700 } },
      routes: [],
    };
    const newSpaceSnapshot: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 2,
        title: 'New space',
        routes: [],
        layouts: [routeLessLayout, unrelatedLayout],
        defaultView: DEFAULT_LAYOUT_ID,
      },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const loaded = { snapshot: newSpaceSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const viewChoice = createViewChoice({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    let activeRouteId: typeof ROUTE_ID | null = null;
    const editor = createPlacementEditor({
      initialPositions: layoutPositionMap(routeLessLayout),
      viewChoice,
      currentActiveRoute: () => activeRouteId,
      session,
      installSpace: ignoreInstalledSpace,
      activateRoute: (routeId) => {
        activeRouteId = routeId;
      },
      mintRouteId: () => ROUTE_ID,
    });
    editor.getState().syncNodes([node(CARD_A, 10, 20)]);

    let completed: boolean | undefined;
    expect(() => {
      completed = editor
        .getState()
        .createConnectedCard(CARD_A, CREATED_CARD_ID, { x: 420, y: 360 });
    }).not.toThrow();

    expect(completed).toBe(true);
    expect(activeRouteId).toBe(ROUTE_ID);
    expect(viewChoice.current()).toEqual({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    expect(session.getState().working).toEqual({
      ...newSpaceSnapshot,
      document: {
        ...newSpaceSnapshot.document,
        routes: [
          {
            id: ROUTE_ID,
            title: 'Route 1',
            edges: [{ from: CARD_A, to: CREATED_CARD_ID }],
          },
        ],
        layouts: [
          {
            ...routeLessLayout,
            positions: {
              [CARD_A]: { x: 10, y: 20 },
              [CREATED_CARD_ID]: { x: 420, y: 360 },
            },
            routes: [ROUTE_ID],
            activeRoute: ROUTE_ID,
          },
          unrelatedLayout,
        ],
      },
      cards: [
        ...newSpaceSnapshot.cards,
        {
          id: CREATED_CARD_ID,
          document: { title: 'Card 2', kind: 'markdown', body: '' },
        },
      ],
    });
    await waitForSettled(session.getState, session.subscribe);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: session.getState().working,
      revision: 1n,
      exportedRevision: null,
    });
  });

  it('creates the first Route from an existing-Card self-connection in an empty Layout filter', async () => {
    const routeLessLayout: Layout = {
      id: DEFAULT_LAYOUT_ID,
      title: 'Authored Layout',
      kind: 'positioned',
      positions: { [CARD_A]: { x: 10, y: 20 } },
      routes: [],
    };
    const newSpaceSnapshot: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 2,
        title: 'New space',
        routes: [],
        layouts: [routeLessLayout],
        defaultView: DEFAULT_LAYOUT_ID,
      },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const loaded = { snapshot: newSpaceSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const viewChoice = createViewChoice({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    const editor = createPlacementEditor({
      initialPositions: layoutPositionMap(routeLessLayout),
      viewChoice,
      currentActiveRoute: () => null,
      session,
      installSpace: ignoreInstalledSpace,
      mintRouteId: () => ROUTE_ID,
    });
    const visibleNodes = [node(CARD_A, 10, 20)];
    editor.getState().syncNodes(visibleNodes);

    expect(editor.getState().connectCards(CARD_A, CARD_A, visibleNodes)).toBe(true);

    const working = session.getState().working;
    expect(working.document.routes).toEqual([
      {
        id: ROUTE_ID,
        title: 'Route 1',
        edges: [{ from: CARD_A, to: CARD_A }],
      },
    ]);
    expect(working.document.layouts).toEqual([
      {
        ...routeLessLayout,
        routes: [ROUTE_ID],
        activeRoute: ROUTE_ID,
      },
    ]);
    expect(loadSpaceSnapshot(working).ok).toBe(true);
    await waitForSettled(session.getState, session.subscribe);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: working,
      revision: 1n,
    });
  });

  it('keeps an omitted Layout route filter omitted when it creates the first Route', async () => {
    const routeLessLayout: Layout = {
      id: DEFAULT_LAYOUT_ID,
      title: 'Authored Layout',
      kind: 'positioned',
      positions: { [CARD_A]: { x: 10, y: 20 } },
    };
    const newSpaceSnapshot: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 2,
        title: 'New space',
        routes: [],
        layouts: [routeLessLayout],
        defaultView: DEFAULT_LAYOUT_ID,
      },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const loaded = { snapshot: newSpaceSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const editor = createPlacementEditor({
      initialPositions: layoutPositionMap(routeLessLayout),
      viewChoice: createViewChoice({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID }),
      currentActiveRoute: () => null,
      session,
      installSpace: ignoreInstalledSpace,
      mintRouteId: () => ROUTE_ID,
    });
    const visibleNodes = [node(CARD_A, 10, 20)];
    editor.getState().syncNodes(visibleNodes);

    expect(editor.getState().connectCards(CARD_A, CARD_A, visibleNodes)).toBe(true);

    const updatedLayout = session.getState().working.document.layouts?.[0];
    expect(updatedLayout).toMatchObject({
      id: DEFAULT_LAYOUT_ID,
      activeRoute: ROUTE_ID,
    });
    expect(updatedLayout).not.toHaveProperty('routes');
    await waitForSettled(session.getState, session.subscribe);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({ revision: 1n });
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
      expect(installed[0]!.defaultView).toBe(DEFAULT_LAYOUT_ID);
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
    const loaded = routeLessLoaded();
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

  it('preserves an empty route filter when only placement changes', async () => {
    const loaded = routeLessLoaded();
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
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

    // The working snapshot is the local state the editor installed; what the
    // filter has to survive is the round trip. Asserting the committed document
    // is what would catch a `routes` the submission path dropped or widened.
    await waitForSettled(session.getState, session.subscribe);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      revision: 1n,
      snapshot: {
        document: {
          routes: [],
          layouts: [
            {
              id: DEFAULT_LAYOUT_ID,
              positions: { [CARD_A]: { x: 70, y: 90 } },
              routes: [],
            },
          ],
        },
      },
    });
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

  it('adds an Edge to the active Route of the selected Layout, leaving other Layouts alone', async () => {
    const base: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        routes: [{ id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_B, to: CARD_B }] }],
      },
    };
    const loaded = { snapshot: base, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const viewChoice = createViewChoice({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    const installed: Space[] = [];
    const editor = createPlacementEditor({
      initialPositions: layoutPositionMap(defaultLayout),
      viewChoice,
      currentActiveRoute: () => ROUTE_ID,
      session,
      installSpace: (space) => installed.push(space),
    });
    editor.getState().syncNodes(projected);

    expect(editor.getState().connectCards(CARD_A, CARD_B, projected)).toBe(true);

    expect(session.getState().working.document.routes).toEqual([
      {
        id: ROUTE_ID,
        title: 'Main',
        edges: [
          { from: CARD_B, to: CARD_B },
          { from: CARD_A, to: CARD_B },
        ],
      },
    ]);
    expect(session.getState().working.document.layouts).toEqual([
      {
        id: DEFAULT_LAYOUT_ID,
        title: 'Authored Layout',
        kind: 'positioned',
        positions: { [CARD_A]: { x: 10, y: 20 } },
        routes: [ROUTE_ID],
        activeRoute: ROUTE_ID,
      },
      otherLayout,
    ]);
    expect(session.getState().working.document.defaultView).toBe(DEFAULT_LAYOUT_ID);
    expect(installed[0]?.routesById.get(ROUTE_ID)?.edges).toEqual([
      { from: CARD_B, to: CARD_B },
      { from: CARD_A, to: CARD_B },
    ]);
    expect(viewChoice.current()).toEqual({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    await waitForSettled(session.getState, session.subscribe);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({ revision: 1n });
  });

  // A duplicate is a duplicate only within one Route (ADR 0032), so the pair the
  // active Route already holds is still a real Edit on a Route beside it.
  it('accepts the same Card pair on a second Route', () => {
    const base: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        routes: [
          { id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] },
          { id: OTHER_ROUTE_ID, title: 'Alternative', edges: [] },
        ],
        layouts: [{ ...defaultLayout, routes: [ROUTE_ID, OTHER_ROUTE_ID] }, otherLayout],
      },
    };
    const loaded = { snapshot: base, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const editor = createPlacementEditor({
      initialPositions: layoutPositionMap(defaultLayout),
      viewChoice: createViewChoice({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID }),
      currentActiveRoute: () => OTHER_ROUTE_ID,
      session,
      installSpace: ignoreInstalledSpace,
    });
    editor.getState().syncNodes(projected);

    expect(editor.getState().connectCards(CARD_A, CARD_B, projected)).toBe(true);

    expect(session.getState().working.document.routes).toEqual([
      { id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] },
      { id: OTHER_ROUTE_ID, title: 'Alternative', edges: [{ from: CARD_A, to: CARD_B }] },
    ]);
    expect(session.getState().working.document.layouts?.[0]).toEqual({
      ...defaultLayout,
      routes: [ROUTE_ID, OTHER_ROUTE_ID],
      activeRoute: OTHER_ROUTE_ID,
    });
  });

  // Minting is the first connection's rule only, so an active Route the Space
  // does not hold is not a Space to mint into — it is a state no completed Edit
  // may reach, and the graph declines the gesture rather than choosing a Route.
  it('rejects connections when the active Route is not one the Space holds', () => {
    const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const viewChoice = createViewChoice({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    const initialPositions = layoutPositionMap(defaultLayout);
    const editor = createPlacementEditor({
      initialPositions,
      viewChoice,
      currentActiveRoute: () => MISSING_ROUTE_ID,
      session,
      installSpace: ignoreInstalledSpace,
    });
    editor.getState().syncNodes(projected);

    expect(editor.getState().connectCards(CARD_B, CARD_A, projected)).toBe(false);
    expect(editor.getState().createConnectedCard(CARD_A, CREATED_CARD_ID, { x: 500, y: 300 })).toBe(
      false,
    );

    expect(editor.getState()).toMatchObject({
      positions: initialPositions,
      completedConnection: null,
    });
    expect(session.getState()).toMatchObject({
      acknowledgedRevision: 0n,
      working: positionedSnapshot,
    });
    expect(viewChoice.current()).toEqual({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
  });

  // `Card 99 notes` does not wear the neutral form, so it is not counted and the
  // next Card is one past `Card 7` rather than one past the highest number that
  // happens to appear in a title.
  it('creates, places and connects the next neutral Card in the selected Layout only', async () => {
    const base: SpaceSnapshot = {
      ...positionedSnapshot,
      cards: [
        { id: CARD_A, document: { title: 'Card 2', kind: 'markdown', body: 'A' } },
        { id: CARD_B, document: { title: 'Card 7', kind: 'markdown', body: 'B' } },
        {
          id: NOTES_CARD_ID,
          document: { title: 'Card 99 notes', kind: 'markdown', body: 'custom' },
        },
      ],
    };
    const loaded = { snapshot: base, revision: 0n, exportedRevision: null };
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
    editor.getState().syncNodes([node(CARD_A, 10, 20)]);

    expect(editor.getState().createConnectedCard(CARD_A, CREATED_CARD_ID, { x: 420, y: 360 })).toBe(
      true,
    );

    const working = session.getState().working;
    expect(working.cards).toEqual([
      ...base.cards,
      { id: CREATED_CARD_ID, document: { title: 'Card 8', kind: 'markdown', body: '' } },
    ]);
    expect(working.document.routes).toEqual([
      {
        id: ROUTE_ID,
        title: 'Main',
        edges: [
          { from: CARD_A, to: CARD_B },
          { from: CARD_A, to: CREATED_CARD_ID },
        ],
      },
    ]);
    expect(working.document.layouts).toEqual([
      {
        id: DEFAULT_LAYOUT_ID,
        title: 'Authored Layout',
        kind: 'positioned',
        positions: {
          [CARD_A]: { x: 10, y: 20 },
          [CREATED_CARD_ID]: { x: 420, y: 360 },
        },
        routes: [ROUTE_ID],
        activeRoute: ROUTE_ID,
      },
      otherLayout,
    ]);
    expect(working.document.defaultView).toBe(DEFAULT_LAYOUT_ID);
    await waitForSettled(session.getState, session.subscribe);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({ revision: 1n });
  });

  // The Space a database startup creates: one Card, no Route and no Layout, so a
  // single gesture has to mint all three at once and still land as one revision.
  it('creates Card 2, Route 1 and Layout 1 while converting a route-less Algorithmic View', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(DEFAULT_LAYOUT_UUID);
    const newSpaceSnapshot: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 2, title: 'New space', routes: [] },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const loaded = { snapshot: newSpaceSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const viewChoice = createViewChoice({ kind: 'view', view: 'graph' });
    const activatedRoutes: string[] = [];
    const editor = createPlacementEditor({
      initialPositions: null,
      viewChoice,
      currentActiveRoute: () => null,
      session,
      installSpace: ignoreInstalledSpace,
      activateRoute: (routeId) => activatedRoutes.push(routeId),
      mintRouteId: () => MINTED_ROUTE_ID,
    });
    editor.getState().syncNodes([node(CARD_A, 120, 240)]);

    expect(editor.getState().createConnectedCard(CARD_A, CREATED_CARD_ID, { x: 420, y: 360 })).toBe(
      true,
    );

    const working = session.getState().working;
    expect(working.cards).toEqual([
      ...newSpaceSnapshot.cards,
      { id: CREATED_CARD_ID, document: { title: 'Card 2', kind: 'markdown', body: '' } },
    ]);
    expect(working.document.routes).toEqual([
      {
        id: MINTED_ROUTE_ID,
        title: 'Route 1',
        edges: [{ from: CARD_A, to: CREATED_CARD_ID }],
      },
    ]);
    expect(working.document.layouts).toEqual([
      {
        id: DEFAULT_LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: {
          [CARD_A]: { x: 120, y: 240 },
          [CREATED_CARD_ID]: { x: 420, y: 360 },
        },
        activeRoute: MINTED_ROUTE_ID,
      },
    ]);
    expect(working.document.defaultView).toBe(DEFAULT_LAYOUT_ID);
    expect(activatedRoutes).toEqual([MINTED_ROUTE_ID]);
    expect(viewChoice.current()).toEqual({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    await waitForSettled(session.getState, session.subscribe);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({ revision: 1n });
  });

  // A self-Edge is legal authored structure (ADR 0032), so it is enough on its
  // own to convert an Algorithmic View and mint the Space's first Route — which,
  // being first, is the one the authoring stroke was already drawn in.
  it('mints and activates Route 1 from a self-connection converting an Algorithmic View', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(DEFAULT_LAYOUT_UUID);
    const newSpaceSnapshot: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 2, title: 'New space', routes: [] },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const loaded = { snapshot: newSpaceSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const viewChoice = createViewChoice({ kind: 'view', view: 'graph' });
    const installed: Space[] = [];
    const editor = createPlacementEditor({
      initialPositions: null,
      viewChoice,
      currentActiveRoute: () => null,
      session,
      installSpace: (space) => installed.push(space),
      mintRouteId: () => MINTED_ROUTE_ID,
    });
    const visibleNodes = [node(CARD_A, 120, 240)];
    editor.getState().syncNodes(visibleNodes);

    expect(editor.getState().connectCards(CARD_A, CARD_A, visibleNodes)).toBe(true);

    const working = session.getState().working;
    expect(working.document.routes).toEqual([
      {
        id: MINTED_ROUTE_ID,
        title: 'Route 1',
        edges: [{ from: CARD_A, to: CARD_A }],
      },
    ]);
    expect(working.document.layouts).toEqual([
      {
        id: DEFAULT_LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: { [CARD_A]: { x: 120, y: 240 } },
        activeRoute: MINTED_ROUTE_ID,
      },
    ]);
    expect(working.document.defaultView).toBe(DEFAULT_LAYOUT_ID);
    expect(viewChoice.current()).toEqual({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID });
    expect(routeColorMap(installed[0]!)[MINTED_ROUTE_ID]).toBe(ROUTE_PALETTE[0]);
    await waitForSettled(session.getState, session.subscribe);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({ revision: 1n });
  });

  // Selecting a Layout the Space does not hold is not an authoring state to
  // recover from by inventing one, so the Edit fails naming it rather than
  // quietly converting the selection into a fresh Layout.
  it.each<[string, SpaceSnapshot]>([
    ['holds other Layouts', positionedSnapshot],
    ['holds no Layout at all', unlaidSnapshot],
  ])('fails when the selected Layout is not one the Space %s', (_case, base) => {
    const loaded = { snapshot: base, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const viewChoice = createViewChoice({ kind: 'layout', layoutId: MISSING_LAYOUT_ID });
    const editor = createPlacementEditor({
      initialPositions: null,
      viewChoice,
      currentActiveRoute: () => ROUTE_ID,
      session,
      installSpace: ignoreInstalledSpace,
    });
    editor.getState().syncNodes(projected);

    expect(() => completeDrag(editor, CARD_A, 70, 90)).toThrow(
      `The selected Layout ${MISSING_LAYOUT_ID} does not exist.`,
    );

    expect(session.getState()).toMatchObject({
      acknowledgedRevision: 0n,
      working: base,
    });
    expect(viewChoice.current()).toEqual({ kind: 'layout', layoutId: MISSING_LAYOUT_ID });
  });

  // Eligibility answers whether the active Route already holds the pair, not
  // whether the Cards exist, so normal domain intake is what catches a dangling
  // reference — and it must name the Card rather than store the Edge.
  it('fails naming a Card the Space does not hold when a completed connection references it', () => {
    const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const editor = createPlacementEditor({
      initialPositions: layoutPositionMap(defaultLayout),
      viewChoice: createViewChoice({ kind: 'layout', layoutId: DEFAULT_LAYOUT_ID }),
      currentActiveRoute: () => ROUTE_ID,
      session,
      installSpace: ignoreInstalledSpace,
    });
    editor.getState().syncNodes(projected);

    expect(() => editor.getState().connectCards(CARD_A, MISSING_CARD_ID, projected)).toThrow(
      new RegExp(`EditCompleted was emitted for invalid editing state:.*${MISSING_CARD_ID}`),
    );

    expect(session.getState()).toMatchObject({
      acknowledgedRevision: 0n,
      working: positionedSnapshot,
    });
  });
});
