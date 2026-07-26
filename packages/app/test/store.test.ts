import { describe, expect, it } from 'vitest';
import { loadSpace, type Space } from '@project/graph';
import { createSpaceStore } from '../src/store';
import { cardFile } from './card-files';

function fixture(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: 's',
      title: 'Fixture',
      routes: [
        {
          id: 'r1',
          title: 'One',
          edges: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'c' },
          ],
        },
        { id: 'r2', title: 'Two', edges: [{ from: 'b', to: 'c' }] },
      ],
    },
    [cardFile('a'), cardFile('b'), cardFile('c')],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

describe('createSpaceStore', () => {
  it('starts with the space’s first route selected', () => {
    const { useStore } = createSpaceStore(fixture());
    expect(useStore.getState().selectedRouteId).toBe('r1');
  });

  it('selects a different route', () => {
    const { useStore } = createSpaceStore(fixture());
    useStore.getState().selectRoute('r2');
    expect(useStore.getState().selectedRouteId).toBe('r2');
  });

  it('selects no route in a space that has none (ADR 0015)', () => {
    const result = loadSpace({ version: 1, id: 's', title: 'New space', routes: [] }, [
      cardFile('a', 'Untitled'),
    ]);
    if (!result.ok) throw new Error('a route-less space should load');
    const { useStore } = createSpaceStore(result.space);
    expect(useStore.getState().selectedRouteId).toBeNull();
  });

  it('opens and closes a card independently of the selected route', () => {
    const { useStore } = createSpaceStore(fixture());
    useStore.getState().openCard('c');
    expect(useStore.getState()).toMatchObject({ openedCardId: 'c', selectedRouteId: 'r1' });
    useStore.getState().closeCard();
    expect(useStore.getState().openedCardId).toBeNull();
  });
});
