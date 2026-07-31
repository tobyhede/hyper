import { describe, expect, it } from 'vitest';
import { uuidSchema, type Layout, type SpaceSnapshot } from '@project/core';
import { completePositionedConnection } from '../src/edit-completion';

/**
 * Composing one completed existing-Card connection into the next Space.
 *
 * Placement editing lives in `edit-completion.test.ts`; this is the structural
 * half — the Edge a drag between two Cards authors. A Route may contain cycles
 * and self-edges (ADR 0032), so the only rejection is an exact duplicate Edge
 * within one Route, and that is an idempotent no-op rather than an error.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const MISSING_ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const MISSING_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const DEFAULT_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const MISSING_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');

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

describe('completed connection composition', () => {
  it('adds A → B to the active Route in a positioned Layout', () => {
    const base: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        routes: [{ id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_B, to: CARD_B }] }],
      },
    };

    const completed = completePositionedConnection(base, {
      layoutId: DEFAULT_LAYOUT_ID,
      routeId: ROUTE_ID,
      from: CARD_A,
      to: CARD_B,
    });

    expect(completed).toEqual({
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
    const before = structuredClone(positionedSnapshot);

    const completed = completePositionedConnection(positionedSnapshot, {
      layoutId: DEFAULT_LAYOUT_ID,
      routeId: ROUTE_ID,
      from: CARD_A,
      to: CARD_B,
    });

    expect(completed).toBeNull();
    expect(positionedSnapshot).toEqual(before);
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

    const completed = completePositionedConnection(base, {
      layoutId: DEFAULT_LAYOUT_ID,
      routeId: OTHER_ROUTE_ID,
      from: CARD_A,
      to: CARD_B,
    });

    expect(completed?.document.routes).toEqual([
      positionedSnapshot.document.routes[0],
      {
        id: OTHER_ROUTE_ID,
        title: 'Alternative',
        edges: [{ from: CARD_A, to: CARD_B }],
      },
    ]);
    expect(completed?.document.layouts?.[0]).toEqual({
      ...defaultLayout,
      routes: [ROUTE_ID, OTHER_ROUTE_ID],
      activeRoute: OTHER_ROUTE_ID,
    });
  });

  it('rejects a connection on a Route the Space does not have', () => {
    expect(() =>
      completePositionedConnection(positionedSnapshot, {
        layoutId: DEFAULT_LAYOUT_ID,
        routeId: MISSING_ROUTE_ID,
        from: CARD_A,
        to: CARD_B,
      }),
    ).toThrow(`The active Route ${MISSING_ROUTE_ID} does not exist.`);
  });

  it.each<[string, SpaceSnapshot]>([
    ['holds other Layouts', positionedSnapshot],
    ['holds no Layout at all', unlaidSnapshot],
  ])('rejects a connection into a Layout the Space does not have when it %s', (_case, base) => {
    expect(() =>
      completePositionedConnection(base, {
        layoutId: MISSING_LAYOUT_ID,
        routeId: ROUTE_ID,
        from: CARD_B,
        to: CARD_A,
      }),
    ).toThrow(`The selected Layout ${MISSING_LAYOUT_ID} does not exist.`);
  });

  it('rejects a connection to a Card the Space does not hold, naming it', () => {
    expect(() =>
      completePositionedConnection(positionedSnapshot, {
        layoutId: DEFAULT_LAYOUT_ID,
        routeId: ROUTE_ID,
        from: CARD_A,
        to: MISSING_CARD_ID,
      }),
    ).toThrow(new RegExp(`Completed connection produced an invalid Space:.*${MISSING_CARD_ID}`));
  });

  it.each([
    ['cycle-closing', CARD_B, CARD_A],
    ['self', CARD_B, CARD_B],
  ])('accepts a %s Edge', (_kind, from, to) => {
    const completed = completePositionedConnection(positionedSnapshot, {
      layoutId: DEFAULT_LAYOUT_ID,
      routeId: ROUTE_ID,
      from,
      to,
    });

    expect(completed?.document.routes[0]?.edges).toEqual([
      { from: CARD_A, to: CARD_B },
      { from, to },
    ]);
  });
});
