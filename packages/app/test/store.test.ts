import { describe, expect, it } from 'vitest';
import { loadSpace, type Space } from '@project/graph';
import { createPresentationStore } from '../src/store';

function fixture(): Space {
  const result = loadSpace({
    version: 1,
    title: 'Fixture',
    cards: [
      { id: 'a', title: 'A', kind: 'markdown', content: 'a.md' },
      { id: 'b', title: 'B', kind: 'markdown', content: 'b.md' },
      { id: 'c', title: 'C', kind: 'markdown', content: 'c.md' },
    ],
    routes: [
      { id: 'r1', title: 'One', steps: [{ target: 'a' }, { target: 'b' }, { target: 'c' }] },
      { id: 'r2', title: 'Two', steps: [{ target: 'b' }] },
    ],
  });
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

describe('createPresentationStore', () => {
  it('starts with the space’s first route selected', () => {
    const { useStore } = createPresentationStore(fixture());
    expect(useStore.getState().selectedRouteId).toBe('r1');
  });

  it('resets the step when a different route is selected', () => {
    const { useStore } = createPresentationStore(fixture());
    useStore.getState().next(); // step 0 → 1 on r1
    expect(useStore.getState().stepIndex).toBe(1);
    useStore.getState().selectRoute('r2');
    expect(useStore.getState()).toMatchObject({ selectedRouteId: 'r2', stepIndex: 0 });
  });

  it('clamps stepping to the selected route’s length, read from the space', () => {
    const { useStore } = createPresentationStore(fixture());
    // r1 has 3 steps: next never runs past the last, prev never before the first.
    const { next, prev } = useStore.getState();
    next();
    next();
    next();
    next();
    expect(useStore.getState().stepIndex).toBe(2);
    prev();
    prev();
    prev();
    expect(useStore.getState().stepIndex).toBe(0);
  });

  it('will not enter presentation without a selected route', () => {
    const { useStore } = createPresentationStore(fixture());
    useStore.setState({ selectedRouteId: null });
    useStore.getState().enterPresentation();
    expect(useStore.getState().mode).toBe('overview');
  });

  it('cannot present a space with no routes, and selects none (ADR 0015)', () => {
    const result = loadSpace({
      version: 1,
      title: 'New space',
      cards: [{ id: 'a', title: 'Untitled', kind: 'markdown', content: 'a.md' }],
      routes: [],
    });
    if (!result.ok) throw new Error('a route-less space should load');
    const { useStore, selectActiveCardId } = createPresentationStore(result.space);

    expect(useStore.getState().selectedRouteId).toBeNull();
    useStore.getState().enterPresentation();
    expect(useStore.getState().mode).toBe('overview');
    expect(selectActiveCardId(useStore.getState())).toBeNull();
  });

  it('reports the active card only while presenting, at the current step', () => {
    const { useStore, selectActiveCardId } = createPresentationStore(fixture());
    expect(selectActiveCardId(useStore.getState())).toBeNull(); // overview
    useStore.getState().enterPresentation();
    expect(selectActiveCardId(useStore.getState())).toBe('a'); // r1 step 0
    useStore.getState().next();
    expect(selectActiveCardId(useStore.getState())).toBe('b'); // r1 step 1
  });
});
