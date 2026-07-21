import { describe, expect, it } from 'vitest';
import { getCard, getRoute, loadSpace } from '../src/index';

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
