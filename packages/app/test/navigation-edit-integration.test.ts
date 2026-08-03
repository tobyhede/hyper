import { expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { createPlacementEditor } from '../src/edit-completion';
import { createNavigation } from '../src/navigation';
import { createWorkingSpaceReader } from '../src/snapshot';
import { node } from './editor-fixtures';
import { waitForSettled } from './session-fixtures';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MINTED_ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const LAYOUT_UUID = '00000000-0000-4000-8000-000000000021' as const;
const LAYOUT_ID = uuidSchema.parse(LAYOUT_UUID);

/**
 * Edit completion drives the *real* Navigation here, not the fixture the rest of
 * the Edit tests use.
 *
 * Navigation refuses to activate a Route the working Space does not hold, and
 * the one caller that activates a Route it did not read from the Space is the
 * Edit that mints the Space's first. That is only safe because the effects run
 * in order — `session.submit` installs the working snapshot synchronously, and
 * only then is the Route activated. A test against a fixture Navigation cannot
 * see that ordering, so it is pinned against the real one.
 */
it('activates the first minted Route against the Space the Edit has already installed', async () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(LAYOUT_UUID);
  const newSpace: SpaceSnapshot = {
    id: SPACE_ID,
    document: { version: 2, title: 'New space', routes: [] },
    cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
  };
  const loaded = { snapshot: newSpace, revision: 0n, exportedRevision: null };
  const backend = new MemorySpaceBackend([loaded]);
  const session = openSpaceSession(backend, loaded);
  const readWorkingSpace = createWorkingSpaceReader();
  const navigation = createNavigation(() => readWorkingSpace(session.getState().working), {
    kind: 'view',
    view: 'graph',
  });
  const editor = createPlacementEditor({
    initialPositions: null,
    navigation,
    session,
    mintRouteId: () => MINTED_ROUTE_ID,
  });
  const visibleNodes = [node(CARD_A, 120, 240)];
  editor.getState().syncNodes(visibleNodes);
  // A route-less Space opens with no active Route at all.
  expect(navigation.getState().activeRouteId).toBeNull();

  expect(editor.getState().connectCards(CARD_A, CARD_A, visibleNodes)).toBe(true);

  expect(navigation.getState()).toMatchObject({
    activeRouteId: MINTED_ROUTE_ID,
    selectedRenderer: { kind: 'layout', layoutId: LAYOUT_ID },
  });
  expect(session.getState().working.document.routes).toEqual([
    { id: MINTED_ROUTE_ID, title: 'Route 1', edges: [{ from: CARD_A, to: CARD_A }] },
  ]);
  // The minted Route resolves against the working Space through the same read
  // the guard uses, so activating it again is accepted rather than refused.
  // (It is not presentable: a lone self-Edge is a fully cyclic Route and has no
  // entry Card, which is a traversal rule and not a persistence one.)
  expect(() => navigation.activateRoute(MINTED_ROUTE_ID)).not.toThrow();
  await waitForSettled(session.getState, session.subscribe);
});
