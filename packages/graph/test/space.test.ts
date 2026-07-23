import { describe, expect, it } from 'vitest';
import { getCard, getLayout, getRoute, loadSpace } from '../src/index';

const validInput = {
  version: 1,
  title: 'Test space',
  cards: [
    { id: 'a', title: 'A', kind: 'markdown', content: 'a.md' },
    { id: 'b', title: 'B', kind: 'markdown', content: 'b.md' },
  ],
  routes: [{ id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }] }],
};

describe('loadSpace', () => {
  it('turns valid input into a Space', () => {
    const result = loadSpace(validInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.title).toBe('Test space');
    expect(result.space.cards).toHaveLength(2);
    expect(result.space.routes).toHaveLength(1);
  });

  it('reports a bad shape as errors rather than throwing', () => {
    const result = loadSpace({ version: 1, title: 'X' }); // cards and routes missing
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => e.kind === 'invalid-shape')).toBe(true);
  });

  it('reports an unresolved reference, though the shape is valid', () => {
    const result = loadSpace({
      ...validInput,
      routes: [{ id: 'main', title: 'Main', steps: [{ target: 'ghost' }] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.kind === 'unresolved-route-step' && e.ref === 'ghost')).toBe(
      true,
    );
  });

  it('indexes the Space so lookups resolve by id', () => {
    const result = loadSpace(validInput);
    if (!result.ok) throw new Error('expected a valid space');
    expect(getCard(result.space, 'a')?.title).toBe('A');
    expect(getCard(result.space, 'missing')).toBeUndefined();
    expect(getRoute(result.space, 'main')?.title).toBe('Main');
    expect(getRoute(result.space, 'missing')).toBeUndefined();
  });
});

describe('loadSpace: layouts', () => {
  const working = {
    id: 'working',
    title: 'Working',
    kind: 'positioned',
    positions: { a: { x: 0, y: 0 }, b: { x: 320, y: 0 } },
  };

  it('gives a space with no declared layouts an empty list, never undefined', () => {
    const result = loadSpace(validInput);
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.layouts).toEqual([]);
    expect(result.space.defaultView).toBeUndefined();
  });

  it('carries and indexes the layouts it was given', () => {
    const result = loadSpace({ ...validInput, layouts: [working], defaultView: 'working' });
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.layouts).toHaveLength(1);
    expect(result.space.defaultView).toBe('working');
    expect(getLayout(result.space, 'working')?.positions['b']).toEqual({ x: 320, y: 0 });
    expect(getLayout(result.space, 'missing')).toBeUndefined();
  });

  it('resolves a built-in view name to no declared layout', () => {
    const result = loadSpace({ ...validInput, defaultView: 'graph' });
    if (!result.ok) throw new Error('expected a valid space');
    expect(getLayout(result.space, 'graph')).toBeUndefined();
  });

  it('rejects a layout positioning a card that does not exist', () => {
    const result = loadSpace({
      ...validInput,
      layouts: [{ ...working, positions: { ...working.positions, ghost: { x: 1, y: 1 } } }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.kind === 'layout-position-unknown-card' && e.ref === 'ghost'),
    ).toBe(true);
  });

  it('rejects a defaultView that names nothing', () => {
    const result = loadSpace({ ...validInput, layouts: [working], defaultView: 'nowhere' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.kind === 'unresolved-default-view' && e.ref === 'nowhere'),
    ).toBe(true);
  });
});
