import { describe, expect, it } from 'vitest';
import {
  uuidSchema,
  type CardId,
  type Layout,
  type RouteId,
  type SpaceSnapshot,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { ROUTE_PALETTE, routeColorMap } from '../src/colors';
import { createPlacementEditor } from '../src/edit-completion';
import { layoutPositionMap } from '../src/view';
import { node } from './editor-fixtures';
import { authoringNavigation } from './navigation-fixtures';

/**
 * Composing one completed existing-Card connection into the next Space.
 *
 * Placement editing lives in `edit-completion.test.ts`; this is the structural
 * half — the Edge a drag between two Cards authors. A Route may contain cycles
 * and self-edges (ADR 0032), so the only rejection is an exact duplicate Edge
 * within one Route, and that is an idempotent no-op rather than an error.
 *
 * Everything here drives `connectCards`, the same entry point the canvas uses.
 * These cases previously called two exported helpers that no production code
 * path reached, one of which appended the Edge without writing placement — so
 * they were describing a composition the application never performed.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MINTED_ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const OTHER_ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const MISSING_ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const MISSING_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const CREATED_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const DEFAULT_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const MISSING_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');

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
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Space',
    routes: [{ id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] }],
    layouts: [defaultLayout, otherLayout],
    defaultView: DEFAULT_LAYOUT_ID,
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

/** A Space that carries no Layout at all — the normal hand-authored state (ADR 0025). */
const unlaidSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Space',
    routes: positionedSnapshot.document.routes,
  },
  cards: positionedSnapshot.cards,
};

const projected = [node(CARD_A, 10, 20), node(CARD_B, 300, 20)];

/**
 * The canvas seam: a session over the given Space, a selected Layout, and an
 * editor whose nodes are already on screen. `connect` is what a completed
 * drag between two Cards calls.
 */
function connectingIn(
  snapshot: SpaceSnapshot,
  layoutId = DEFAULT_LAYOUT_ID,
  activeRouteId: RouteId | null = ROUTE_ID,
) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
  const layout = (snapshot.document.layouts ?? []).find((candidate) => candidate.id === layoutId);
  const editor = createPlacementEditor({
    initialPositions: layout === undefined ? null : layoutPositionMap(layout),
    navigation: authoringNavigation({ kind: 'layout', layoutId }, () => activeRouteId),
    session,
  });
  editor.getState().syncNodes(projected);
  return {
    session,
    connect: (from = CARD_A, to = CARD_B) => editor.getState().connectCards(from, to, projected),
    create: (from: CardId, cardId: CardId, x: number, y: number) =>
      editor.getState().createConnectedCard(from, cardId, { x, y }),
  };
}

describe('completed connection composition', () => {
  it('creates, places and connects the next neutral Card in the selected Layout only', () => {
    const base: SpaceSnapshot = {
      ...positionedSnapshot,
      cards: [
        { id: CARD_A, document: { title: 'Card 2', kind: 'markdown', body: 'A' } },
        { id: CARD_B, document: { title: 'Card 7', kind: 'markdown', body: 'B' } },
        {
          id: MISSING_CARD_ID,
          document: { title: 'Card 99 notes', kind: 'markdown', body: 'custom' },
        },
      ],
    };

    const { session, create } = connectingIn(base);

    expect(create(CARD_A, CREATED_CARD_ID, 420, 360)).toBe(true);
    expect(session.getState().working).toEqual({
      ...base,
      document: {
        ...base.document,
        routes: [
          {
            id: ROUTE_ID,
            title: 'Main',
            edges: [
              { from: CARD_A, to: CARD_B },
              { from: CARD_A, to: CREATED_CARD_ID },
            ],
          },
        ],
        layouts: [
          {
            ...defaultLayout,
            positions: {
              [CARD_A]: { x: 10, y: 20 },
              [CREATED_CARD_ID]: { x: 420, y: 360 },
            },
            activeRoute: ROUTE_ID,
          },
          otherLayout,
        ],
        defaultView: DEFAULT_LAYOUT_ID,
      },
      cards: [
        ...base.cards,
        {
          id: CREATED_CARD_ID,
          document: { title: 'Card 8', kind: 'markdown', body: '' },
        },
      ],
    });
  });

  it('creates Card 2 and Route 1 while converting a route-less Algorithmic View', () => {
    const routeLess: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 2, title: 'New space', routes: [] },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };

    const loaded = { snapshot: routeLess, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const navigation = authoringNavigation({ kind: 'view', view: 'graph' }, () => null);
    const editor = createPlacementEditor({
      initialPositions: null,
      navigation,
      session,
      mintRouteId: () => MINTED_ROUTE_ID,
    });
    editor.getState().syncNodes([node(CARD_A, 120, 240)]);

    expect(editor.getState().createConnectedCard(CARD_A, CREATED_CARD_ID, { x: 420, y: 360 })).toBe(
      true,
    );
    expect(session.getState().working).toMatchObject({
      ...routeLess,
      document: {
        ...routeLess.document,
        routes: [
          {
            id: MINTED_ROUTE_ID,
            title: 'Route 1',
            edges: [{ from: CARD_A, to: CREATED_CARD_ID }],
          },
        ],
        layouts: [
          {
            title: 'Layout 1',
            kind: 'positioned',
            positions: {
              [CARD_A]: { x: 120, y: 240 },
              [CREATED_CARD_ID]: { x: 420, y: 360 },
            },
            activeRoute: MINTED_ROUTE_ID,
          },
        ],
      },
      cards: [
        ...routeLess.cards,
        {
          id: CREATED_CARD_ID,
          document: { title: 'Card 2', kind: 'markdown', body: '' },
        },
      ],
    });
    expect(navigation.selectedRenderer()).toEqual({
      kind: 'layout',
      layoutId: session.getState().working.document.defaultView,
    });
  });

  it('mints and activates Route 1 with the first Edge in one complete snapshot', () => {
    const routeLess: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 2, title: 'New space', routes: [] },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const loaded = { snapshot: routeLess, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    let activated: RouteId | null = null;
    const navigation = authoringNavigation(
      { kind: 'view', view: 'graph' },
      () => null,
      (routeId) => {
        activated = routeId;
      },
    );
    const editor = createPlacementEditor({
      initialPositions: null,
      navigation,
      session,
      mintRouteId: () => MINTED_ROUTE_ID,
    });
    const projectedCard = [node(CARD_A, 120, 240)];
    editor.getState().syncNodes(projectedCard);

    expect(editor.getState().connectCards(CARD_A, CARD_A, projectedCard)).toBe(true);

    const completed = session.getState().working;
    expect(completed.document.routes).toEqual([
      {
        id: MINTED_ROUTE_ID,
        title: 'Route 1',
        edges: [{ from: CARD_A, to: CARD_A }],
      },
    ]);
    expect(completed.document.layouts).toEqual([
      expect.objectContaining({
        title: 'Layout 1',
        kind: 'positioned',
        positions: { [CARD_A]: { x: 120, y: 240 } },
        activeRoute: MINTED_ROUTE_ID,
      }),
    ]);
    expect(navigation.selectedRenderer()).toEqual({
      kind: 'layout',
      layoutId: completed.document.defaultView,
    });
    expect(activated).toBe(MINTED_ROUTE_ID);
    const accepted = loadSpaceSnapshot(completed);
    if (!accepted.ok) throw new Error(accepted.errors.map((error) => error.message).join('; '));
    expect(routeColorMap(accepted.space)[MINTED_ROUTE_ID]).toBe(ROUTE_PALETTE[0]);
  });

  it('adds A → B to the active Route in a positioned Layout', () => {
    const base: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        routes: [{ id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_B, to: CARD_B }] }],
      },
    };
    const { session, connect } = connectingIn(base);

    expect(connect()).toBe(true);

    expect(session.getState().working).toEqual({
      ...base,
      document: {
        ...base.document,
        routes: [
          {
            id: ROUTE_ID,
            title: 'Main',
            edges: [
              { from: CARD_B, to: CARD_B },
              { from: CARD_A, to: CARD_B },
            ],
          },
        ],
        layouts: [{ ...defaultLayout, activeRoute: ROUTE_ID }, otherLayout],
        defaultView: DEFAULT_LAYOUT_ID,
      },
    });
  });

  it('returns no completed Edit for an Edge already in the active Route', () => {
    const { session, connect } = connectingIn(positionedSnapshot);

    expect(connect()).toBe(false);

    expect(session.getState().working).toEqual(positionedSnapshot);
  });

  it('allows the same Card pair on another visible Route', () => {
    const base: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        routes: [
          ...positionedSnapshot.document.routes,
          { id: OTHER_ROUTE_ID, title: 'Alternative', edges: [] },
        ],
        layouts: [{ ...defaultLayout, routes: [ROUTE_ID, OTHER_ROUTE_ID] }, otherLayout],
      },
    };
    const { session, connect } = connectingIn(base, DEFAULT_LAYOUT_ID, OTHER_ROUTE_ID);

    expect(connect()).toBe(true);

    const document = session.getState().working.document;
    expect(document.routes).toEqual([
      positionedSnapshot.document.routes[0],
      { id: OTHER_ROUTE_ID, title: 'Alternative', edges: [{ from: CARD_A, to: CARD_B }] },
    ]);
    expect(document.layouts?.[0]).toEqual({
      ...defaultLayout,
      routes: [ROUTE_ID, OTHER_ROUTE_ID],
      activeRoute: OTHER_ROUTE_ID,
    });
  });

  it('rejects a connection on a Route the Space does not have', () => {
    const { session, connect } = connectingIn(
      positionedSnapshot,
      DEFAULT_LAYOUT_ID,
      MISSING_ROUTE_ID,
    );

    expect(connect()).toBe(false);
    expect(session.getState().working).toEqual(positionedSnapshot);
  });

  it.each<[string, SpaceSnapshot]>([
    ['holds other Layouts', positionedSnapshot],
    ['holds no Layout at all', unlaidSnapshot],
  ])('rejects a connection into a Layout the Space does not have when it %s', (_case, base) => {
    const { connect } = connectingIn(base, MISSING_LAYOUT_ID);

    expect(() => connect(CARD_B, CARD_A)).toThrow(
      `The selected Layout ${MISSING_LAYOUT_ID} does not exist.`,
    );
  });

  it('rejects a connection to a Card the Space does not hold, naming it', () => {
    const { connect } = connectingIn(positionedSnapshot);

    expect(() => connect(CARD_A, MISSING_CARD_ID)).toThrow(
      new RegExp(`EditCompleted was emitted for invalid editing state:.*${MISSING_CARD_ID}`),
    );
  });

  it.each([
    ['cycle-closing', CARD_B, CARD_A],
    ['self', CARD_B, CARD_B],
  ])('accepts a %s Edge', (_kind, from, to) => {
    const { session, connect } = connectingIn(positionedSnapshot);

    expect(connect(from, to)).toBe(true);

    expect(session.getState().working.document.routes[0]?.edges).toEqual([
      { from: CARD_A, to: CARD_B },
      { from, to },
    ]);
  });
});
