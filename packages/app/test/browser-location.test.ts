import { describe, expect, it } from 'vitest';
import { uuidSchema, type GraphId, type LayoutId, type SpaceSnapshot } from '@project/core';
import { productDestinationPath } from '@project/http';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { createBrowserLocation } from '../src/browser-location';
import { composeApp } from '../src/compose-app';
import { recordingHistory } from './browser-history';

/**
 * The rules that decide a browser history entry, proved without a DOM.
 *
 * Every one of these was reachable only through a full jsdom mount and a spy on
 * `window.history.pushState` before `browser-location.ts` existed — the shape
 * ADR 0081 removed one level in, arriving again as "a rule with no owner,
 * proved by the only instrument that can reach where it happens to live". What
 * makes them reachable here is that the browser is a five-member interface and
 * the recording adapter is a real implementation of it.
 *
 * What is deliberately *not* here is anything about a real browser honouring
 * these writes. `packages/app/e2e/space-routing.spec.ts` proves that, which a
 * fake cannot.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
/** Named by no Layout in the Space: the dead address a Back can land on. */
const MISSING_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout',
        kind: 'positioned',
        positions: {
          [CARD_A]: { x: 10, y: 20, open: false },
          [CARD_B]: { x: 300, y: 20, open: false },
        },
        graphs: [
          { id: GRAPH_ID, title: 'Graph', edges: [{ from: CARD_A, to: CARD_B }] },
          { id: SECOND_GRAPH_ID, title: 'Second Graph', edges: [] },
        ],
      },
      {
        id: OTHER_LAYOUT_ID,
        title: 'Other Layout',
        kind: 'positioned',
        positions: { [CARD_A]: { x: 0, y: 0, open: false } },
        graphs: [{ id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] }],
      },
    ],
    defaultLayout: LAYOUT_ID,
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

/** One Card whose Graph leaves it by an Edge back to itself. */
const selfEdge: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout',
        kind: 'positioned',
        positions: { [CARD_A]: { x: 10, y: 20, open: false } },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [{ from: CARD_A, to: CARD_A }] }],
      },
    ],
    defaultLayout: LAYOUT_ID,
  },
  cards: [{ id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } }],
};

const compose = (opened: SpaceSnapshot = snapshot) => {
  const loaded = { snapshot: opened, revision: 0n, exportedRevision: null };
  return composeApp({ spaceSession: openSpaceSession(new MemorySpaceBackend([loaded]), loaded) });
};

const layoutPath = (layoutId: LayoutId): string =>
  productDestinationPath({ kind: 'layout', spaceId: SPACE_ID, layoutId });

const layoutGraphPath = (layoutId: LayoutId, graphId: GraphId): string =>
  productDestinationPath({ kind: 'layout-graph', spaceId: SPACE_ID, layoutId, graphId });

const presentationPath = productDestinationPath({
  kind: 'presentation',
  spaceId: SPACE_ID,
  layoutId: LAYOUT_ID,
  graphId: GRAPH_ID,
  cardId: CARD_A,
});

const deadPath = layoutPath(MISSING_LAYOUT_ID);

describe('the browser location', () => {
  /**
   * Startup reads the location once and composes from it, so the position the
   * application is at is already the one the location names — and where it is
   * not, the reader put it there. Correcting it here would silently undo a Back
   * taken before this module was listening.
   */
  it('writes nothing when it begins following, whatever the location says', () => {
    const app = compose();
    const history = recordingHistory(layoutPath(OTHER_LAYOUT_ID));
    const location = createBrowserLocation(history);

    location.follow(app);

    expect(history.writes).toEqual([]);
    expect(history.pathname()).toBe(layoutPath(OTHER_LAYOUT_ID));
    location.dispose();
  });

  /**
   * StrictMode invokes a mounting effect twice, and the redundant publication
   * that used to reach the sync effect reaches this module as an ordinary second
   * notification. Both are the same rule: a position already decided about is
   * decided about no further, which is what `syncedPosition` is for and why it
   * is private.
   */
  it('writes nothing when the same position is decided a second time', () => {
    const app = compose();
    const history = recordingHistory(layoutPath(OTHER_LAYOUT_ID));
    const location = createBrowserLocation(history);

    location.follow(app);
    location.follow(app);
    // Navigation republishing the selection it already holds: the notification
    // arrives, the position has not moved, and nothing is written.
    app.navigation.selectLayout(LAYOUT_ID);

    expect(history.writes).toEqual([]);
    location.dispose();
  });

  /**
   * The arrival is the reader's, and only the arrival. Rewriting the location
   * here would take the entry they navigated to.
   */
  it('reports a Back onto a dead address rather than correcting it', () => {
    const app = compose();
    const history = recordingHistory(layoutPath(LAYOUT_ID));
    const location = createBrowserLocation(history);
    location.follow(app);

    history.popTo(deadPath);

    expect(location.getState().destinationNotFound).toBe(true);
    expect(history.writes).toEqual([]);
    expect(history.pathname()).toBe(deadPath);
    location.dispose();
  });

  /**
   * A cleared report and a corrected location are one thing, not two.
   *
   * The choice is the Layout already selected, so the position does not move
   * and no entry is earned — while the location the reader is still on is the
   * one that could not be resolved, which reloads into a host 404. Reporting it
   * as answered and leaving it in the address bar is the half-fix.
   */
  it('corrects an unresolved location when a repeated Layout choice answers the report', () => {
    const app = compose();
    const history = recordingHistory(layoutPath(LAYOUT_ID));
    const location = createBrowserLocation(history);
    location.follow(app);
    history.popTo(deadPath);

    location.chooseLayout(LAYOUT_ID);

    expect(location.getState().destinationNotFound).toBe(false);
    expect(history.writes).toEqual([{ method: 'replace', path: layoutPath(LAYOUT_ID) }]);
    location.dispose();
  });

  /**
   * Presenting from an unresolved location is a move, and a move is answered.
   *
   * Leaving the dead path in the address bar strands the whole presentation
   * behind a URL that 404s on reload and is what Copy link copies. The guard
   * preserves the arrival, so it may only hold while the position has not moved.
   */
  it('clears the report and takes one entry when presenting moves off an unresolved location', () => {
    const app = compose();
    const history = recordingHistory(layoutPath(LAYOUT_ID));
    const location = createBrowserLocation(history);
    location.follow(app);
    history.popTo(deadPath);

    app.navigation.present();

    expect(location.getState().destinationNotFound).toBe(false);
    expect(history.writes).toEqual([{ method: 'push', path: presentationPath }]);
    location.dispose();
  });

  /**
   * Entering the presentation moves the address and earns its entry; advancing
   * across a self-Edge and retreating back out of it both grow and shrink the
   * Traversal history without moving the address, so neither takes another one.
   * Both used to push a duplicate entry (ADR 0081).
   */
  it('takes one entry for a presentation a self-Edge never moves', () => {
    const app = compose(selfEdge);
    const history = recordingHistory(layoutPath(LAYOUT_ID));
    const location = createBrowserLocation(history);
    location.follow(app);

    app.navigation.present();
    app.navigation.advance();
    app.navigation.retreat();

    expect(history.writes).toEqual([{ method: 'push', path: presentationPath }]);
    location.dispose();
  });

  /**
   * Activating a Graph makes the same deliberate move a Layout choice does — it
   * clears the addressed Card and answers the report — and differs in exactly
   * one thing, which is the reason it may not simply call the same operation:
   * it does not change the Layout, so the published projection stays.
   */
  it('answers the report from an activated Graph without disturbing the render adapter', () => {
    const app = compose();
    const history = recordingHistory(
      productDestinationPath({
        kind: 'layout-card',
        spaceId: SPACE_ID,
        layoutId: LAYOUT_ID,
        cardId: CARD_A,
      }),
    );
    const location = createBrowserLocation(history);
    location.follow(app);
    app.adapter.getState().syncProjection([], []);
    expect(location.getState().addressedCardId).toBe(CARD_A);
    history.popTo(deadPath);
    expect(location.getState().destinationNotFound).toBe(true);

    location.activateGraph(SECOND_GRAPH_ID);

    expect(location.getState()).toEqual({ addressedCardId: null, destinationNotFound: false });
    expect(history.writes).toEqual([
      { method: 'push', path: layoutGraphPath(LAYOUT_ID, SECOND_GRAPH_ID) },
    ]);
    expect(app.adapter.getState().projection).not.toBeNull();
    location.dispose();
  });

  /** The contrast the test above rests on: a Layout choice *does* clear it. */
  it('clears the published projection when a choice changes the Layout', () => {
    const app = compose();
    const location = createBrowserLocation(recordingHistory(layoutPath(LAYOUT_ID)));
    location.follow(app);
    app.adapter.getState().syncProjection([], []);

    location.chooseLayout(OTHER_LAYOUT_ID);

    expect(app.adapter.getState().projection).toBeNull();
    expect(app.navigation.getState().selectedLayoutId).toBe(OTHER_LAYOUT_ID);
    location.dispose();
  });

  it('resolves a destination against the current location for the clipboard', () => {
    const app = compose();
    const history = recordingHistory(layoutPath(LAYOUT_ID));
    const location = createBrowserLocation(history);
    location.follow(app);

    expect(location.href({ kind: 'layout', spaceId: SPACE_ID, layoutId: OTHER_LAYOUT_ID })).toBe(
      new URL(layoutPath(OTHER_LAYOUT_ID), history.href()).href,
    );
    location.dispose();
  });

  it('releases the Back listener it registered when disposed', () => {
    const history = recordingHistory(layoutPath(LAYOUT_ID));
    const location = createBrowserLocation(history);
    location.follow(compose());
    expect(history.listenerCount()).toBe(1);

    location.dispose();

    expect(history.listenerCount()).toBe(0);
  });

  /**
   * The location follows exactly one Space, and the Card it addresses is a fact
   * about that pair rather than about a mounted component's lifetime.
   */
  it('reads the addressed Card off the location of the Space it follows', () => {
    const app = compose();
    const location = createBrowserLocation(
      recordingHistory(
        productDestinationPath({
          kind: 'layout-card',
          spaceId: SPACE_ID,
          layoutId: LAYOUT_ID,
          cardId: CARD_B,
        }),
      ),
    );

    location.follow(app);

    expect(location.getState().addressedCardId).toBe(CARD_B);
    location.dispose();
  });
});
