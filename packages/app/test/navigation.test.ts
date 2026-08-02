import { expect, it } from 'vitest';
import { uuidSchema, type UUID } from '@project/core';
import { loadSpace, type Space } from '@project/graph';
import { createNavigation } from '../src/navigation';
import { cardFile } from './card-files';

const uuid = (value: string): UUID => uuidSchema.parse(value);

const ROUTE_ONE = uuid('00000000-0000-4000-8000-000000000031');
const ROUTE_TWO = uuid('00000000-0000-4000-8000-000000000032');
const LAYOUT = uuid('00000000-0000-4000-8000-000000000041');

function fixture(): Space {
  const result = loadSpace(
    {
      version: 2,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Fixture',
      routes: [
        {
          id: ROUTE_ONE,
          title: 'One',
          edges: [
            {
              from: uuid('00000000-0000-4000-8000-000000000002'),
              to: uuid('00000000-0000-4000-8000-000000000003'),
            },
          ],
        },
        {
          id: ROUTE_TWO,
          title: 'Two',
          edges: [
            {
              from: uuid('00000000-0000-4000-8000-000000000003'),
              to: uuid('00000000-0000-4000-8000-000000000004'),
            },
          ],
        },
      ],
      layouts: [
        {
          id: LAYOUT,
          title: 'Second route',
          positions: {},
          routes: [ROUTE_TWO],
          activeRoute: ROUTE_TWO,
        },
      ],
    },
    [
      cardFile(uuid('00000000-0000-4000-8000-000000000002')),
      cardFile(uuid('00000000-0000-4000-8000-000000000003')),
      cardFile(uuid('00000000-0000-4000-8000-000000000004')),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

it('selects a renderer and its active Route without changing the Space', () => {
  const space = fixture();
  const navigation = createNavigation(() => space, { kind: 'view', view: 'graph' });
  navigation.present();

  navigation.selectRenderer({ kind: 'layout', layoutId: LAYOUT });

  expect(navigation.getState()).toMatchObject({
    selectedRenderer: { kind: 'layout', layoutId: LAYOUT },
    selectedView: 'graph',
    activeRouteId: ROUTE_TWO,
    mode: 'overview',
    walk: [],
  });
  expect(space.defaultView).toBeUndefined();

  navigation.selectRenderer({ kind: 'view', view: 'grid' });
  expect(navigation.getState().selectedView).toBe('grid');
});

it('traverses an Edge from the changing working Space without installing a copy', () => {
  const cardA = uuid('00000000-0000-4000-8000-000000000002');
  const cardB = uuid('00000000-0000-4000-8000-000000000003');
  const cardC = uuid('00000000-0000-4000-8000-000000000004');
  let working = fixture();
  const navigation = createNavigation(() => working, { kind: 'view', view: 'graph' });
  navigation.present();

  const changed = loadSpace(
    {
      version: 2,
      id: working.id,
      title: working.title,
      routes: [
        {
          id: ROUTE_ONE,
          title: 'One',
          edges: [
            { from: cardA, to: cardB },
            { from: cardA, to: cardC },
          ],
        },
        working.routes[1]!,
      ],
      layouts: working.layouts,
    },
    [cardFile(cardA), cardFile(cardB), cardFile(cardC, 'New destination')],
  );
  if (!changed.ok) throw new Error('changed fixture should load');
  working = changed.space;

  expect(navigation.moves()).toEqual([
    { cardId: cardB, title: 'B', selected: true },
    { cardId: cardC, title: 'New destination', selected: false },
  ]);
  navigation.selectBranch(1);
  navigation.advance();
  expect(navigation.activeCardId()).toBe(cardC);
});

it('activating a Route ends the current walk without changing the Space', () => {
  const space = fixture();
  const navigation = createNavigation(() => space, { kind: 'view', view: 'graph' });
  navigation.present();

  navigation.activateRoute(ROUTE_TWO);

  expect(navigation.getState()).toMatchObject({
    activeRouteId: ROUTE_TWO,
    mode: 'overview',
    walk: [],
    branchIndex: 0,
  });
  expect(space.defaultView).toBeUndefined();
});

it('continues the current walk when an Edit converts the renderer to a Layout', () => {
  const space = fixture();
  const navigation = createNavigation(() => space, { kind: 'view', view: 'graph' });
  navigation.present();
  const walk = navigation.getState().walk;

  navigation.continueInRenderer({ kind: 'layout', layoutId: LAYOUT });

  expect(navigation.getState()).toMatchObject({
    selectedRenderer: { kind: 'layout', layoutId: LAYOUT },
    activeRouteId: ROUTE_ONE,
    mode: 'presenting',
  });
  expect(navigation.getState().walk).toBe(walk);
});

it('opens and closes Cards, and closes an opened Card when presenting starts', () => {
  const space = fixture();
  const card = uuid('00000000-0000-4000-8000-000000000003');
  const navigation = createNavigation(() => space, { kind: 'view', view: 'graph' });

  navigation.openCard(card);
  expect(navigation.getState().openedCardId).toBe(card);
  navigation.closeCard();
  expect(navigation.getState().openedCardId).toBeNull();

  navigation.openCard(card);
  navigation.present();
  expect(navigation.getState()).toMatchObject({ mode: 'presenting', openedCardId: null });
  expect(navigation.activeCardId()).toBe(uuid('00000000-0000-4000-8000-000000000002'));
  navigation.exitPresenting();
  expect(navigation.getState()).toMatchObject({ mode: 'overview', walk: [] });
});

it('walks a fork, retreats along the walk, and reselects the Edge taken', () => {
  const cardA = uuid('00000000-0000-4000-8000-000000000002');
  const cardB = uuid('00000000-0000-4000-8000-000000000003');
  const cardC = uuid('00000000-0000-4000-8000-000000000004');
  const loaded = loadSpace(
    {
      version: 2,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Fork',
      routes: [
        {
          id: ROUTE_ONE,
          title: 'Fork',
          edges: [
            { from: cardA, to: cardB },
            { from: cardA, to: cardC },
          ],
        },
      ],
    },
    [cardFile(cardA), cardFile(cardB), cardFile(cardC)],
  );
  if (!loaded.ok) throw new Error('fork should load');
  const navigation = createNavigation(() => loaded.space, { kind: 'view', view: 'graph' });
  navigation.present();

  navigation.selectBranch(-1);
  expect(navigation.moves().find((move) => move.selected)?.cardId).toBe(cardC);
  navigation.advance();
  navigation.retreat();

  expect(navigation.activeCardId()).toBe(cardA);
  expect(navigation.moves().find((move) => move.selected)?.cardId).toBe(cardC);
  navigation.advance();
  expect(navigation.activeCardId()).toBe(cardC);
});
