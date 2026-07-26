import { describe, expect, it } from 'vitest';
import { getCard, getLayout, getRoute, loadSpace } from '../src/index';
import { cardFile } from './card-files';

const validInput = {
  version: 1,
  id: 's',
  title: 'Test space',
  routes: [{ id: 'main', title: 'Main', edges: [{ from: 'a', to: 'b' }] }],
};

const validCards = [cardFile('a', 'A', 'Body of A.\n'), cardFile('b', 'B', 'Body of B.\n')];

describe('loadSpace', () => {
  it('carries the space id through to the Space', () => {
    const result = loadSpace(validInput, validCards);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.space.id).toBe('s');
  });

  it('turns valid input into a Space', () => {
    const result = loadSpace(validInput, validCards);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.title).toBe('Test space');
    expect(result.space.cards).toHaveLength(2);
    expect(result.space.routes).toHaveLength(1);
  });

  it('builds each card from its file, body included', () => {
    const result = loadSpace(validInput, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(getCard(result.space, 'a')).toEqual({
      id: 'a',
      title: 'A',
      kind: 'markdown',
      body: 'Body of A.\n',
    });
  });

  it('orders cards by title, whatever order the files arrived in', () => {
    const result = loadSpace({ ...validInput, routes: [] }, [
      cardFile('c', 'Carla'),
      cardFile('a', 'Anders'),
      cardFile('b', 'Bo'),
    ]);
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.cards.map((c) => c.title)).toEqual(['Anders', 'Bo', 'Carla']);
  });

  it('rejects the same card id in two files, naming both', () => {
    const result = loadSpace({ ...validInput, routes: [] }, [
      { path: 'intro.md', text: '---\nid: a\ntitle: A\n---\n' },
      { path: 'cards/a.md', text: '---\nid: a\ntitle: A again\n---\n' },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const duplicate = result.errors.find((e) => e.kind === 'duplicate-card-id');
    expect(duplicate?.message).toContain('intro.md');
    expect(duplicate?.message).toContain('cards/a.md');
  });

  it('reports a card file that will not parse, without throwing', () => {
    const result = loadSpace({ ...validInput, routes: [] }, [
      { path: 'cards/a.md', text: 'No frontmatter here.\n' },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.kind === 'missing-frontmatter')).toBe(true);
  });

  it('loads a space with no cards at all — a new space, before anything is written', () => {
    const result = loadSpace({ ...validInput, routes: [] }, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.cards).toEqual([]);
  });

  it('loads a space with no routes — cards, no structure yet (ADR 0015)', () => {
    const result = loadSpace({ ...validInput, routes: [] }, validCards);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.space.routes).toEqual([]);
    expect(result.space.cards).toHaveLength(2);
    expect(getCard(result.space, 'a')?.title).toBe('A');
  });

  it('reports a bad shape as errors rather than throwing', () => {
    const result = loadSpace({ version: 1, title: 'X' }, validCards); // id and routes missing
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => e.kind === 'invalid-shape')).toBe(true);
  });

  it('reports an unresolved reference, though the shape is valid', () => {
    const result = loadSpace(
      {
        ...validInput,
        routes: [{ id: 'main', title: 'Main', edges: [{ from: 'a', to: 'ghost' }] }],
      },
      validCards,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.kind === 'unresolved-route-edge' && e.ref === 'ghost')).toBe(
      true,
    );
  });

  it('indexes the Space so lookups resolve by id', () => {
    const result = loadSpace(validInput, validCards);
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
    const result = loadSpace(validInput, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.layouts).toEqual([]);
    expect(result.space.defaultView).toBeUndefined();
  });

  it('carries and indexes the layouts it was given', () => {
    const result = loadSpace(
      { ...validInput, layouts: [working], defaultView: 'working' },
      validCards,
    );
    if (!result.ok) throw new Error('expected a valid space');
    expect(result.space.layouts).toHaveLength(1);
    expect(result.space.defaultView).toBe('working');
    expect(getLayout(result.space, 'working')?.positions['b']).toEqual({ x: 320, y: 0 });
    expect(getLayout(result.space, 'missing')).toBeUndefined();
  });

  it('resolves a built-in view name to no declared layout', () => {
    const result = loadSpace({ ...validInput, defaultView: 'graph' }, validCards);
    if (!result.ok) throw new Error('expected a valid space');
    expect(getLayout(result.space, 'graph')).toBeUndefined();
  });

  it('rejects a layout positioning a card that does not exist', () => {
    const result = loadSpace(
      {
        ...validInput,
        layouts: [{ ...working, positions: { ...working.positions, ghost: { x: 1, y: 1 } } }],
      },
      validCards,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.kind === 'layout-position-unknown-card' && e.ref === 'ghost'),
    ).toBe(true);
  });

  it('rejects a defaultView that names nothing', () => {
    const result = loadSpace(
      { ...validInput, layouts: [working], defaultView: 'nowhere' },
      validCards,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.kind === 'unresolved-default-view' && e.ref === 'nowhere'),
    ).toBe(true);
  });
});
