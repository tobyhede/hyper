import { describe, expect, it } from 'vitest';
import { spaceFileSchema, uuidSchema } from '@project/core';
import { initializeSpace, loadSpace, newSpace } from '../src/index';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

describe('newSpace', () => {
  it('is a real space file, not something that only nearly parses', () => {
    expect(spaceFileSchema.safeParse(newSpace().file).success).toBe(true);
  });

  it('loads, which is the only proof it is a space at all (ADR 0010)', () => {
    const { file, cardFiles } = newSpace();
    const result = loadSpace(file, cardFiles);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    expect(result.space.cards).toHaveLength(1);
    expect(result.space.layouts).toHaveLength(1);
    expect(result.space.graphs).toHaveLength(1);
  });

  it('begins neutral Card numbering at Card 1 with an empty body (ADR 0018, ADR 0020)', () => {
    const { file, cardFiles } = newSpace();
    const result = loadSpace(file, cardFiles);
    if (!result.ok) throw new Error('should load');

    const card = result.space.cards[0]!;
    expect(card.kind).toBe('markdown');
    expect(card.title).toBe('Card 1');
    expect(card.kind === 'markdown' && card.body).toBe('');
  });

  it('starts complete with its first Card at the canonical centred position', () => {
    const { file, cardFiles } = newSpace();
    const result = loadSpace(file, cardFiles);
    if (!result.ok) throw new Error('should load');

    const layout = result.space.layouts[0]!;
    const card = result.space.cards[0]!;
    expect(layout).toMatchObject({ title: 'Layout 1', activeGraph: layout.graphs[0]?.id });
    expect(layout.graphs).toMatchObject([{ title: 'Graph 1', edges: [] }]);
    expect(layout.positions[card.id]).toEqual({ x: 0, y: 0, open: false });
    expect(result.space.defaultLayout).toBe(layout.id);
  });

  it('mints fresh UUID identity for each new space and its first card', () => {
    const first = newSpace();
    const second = newSpace();

    expect(first.file.id).not.toBe(second.file.id);
    expect(first.cardFiles[0]?.text).not.toBe(second.cardFiles[0]?.text);
    expect(spaceFileSchema.safeParse(first.file).success).toBe(true);
  });

  it('puts the card in `cards/`, named for its id', () => {
    const { cardFiles } = newSpace();
    expect(cardFiles).toHaveLength(1);
    expect(cardFiles[0]!.path).toMatch(/^cards\/[0-9a-f-]{36}\.md$/);
  });

  it('is a fresh value each time, so one space cannot mutate another', () => {
    expect(newSpace()).not.toBe(newSpace());
    expect(newSpace().cardFiles).not.toBe(newSpace().cardFiles);
  });
});

describe('initializeSpace', () => {
  it('creates the same complete one-Card shape as newSpace from one identity source', () => {
    const ids = [SPACE_ID, CARD_ID, LAYOUT_ID, GRAPH_ID];
    const initialized = initializeSpace({
      title: 'Architecture',
      newId: () => {
        const id = ids.shift();
        if (id === undefined) throw new Error('initializer minted too many ids');
        return id;
      },
    });

    const result = loadSpace(initialized.file, initialized.cardFiles);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('\n'));

    expect(ids).toEqual([]);
    expect(result.space).toMatchObject({
      id: SPACE_ID,
      title: 'Architecture',
      cards: [{ id: CARD_ID, title: 'Architecture', kind: 'markdown', body: '' }],
    });
    expect(result.space.layouts).toEqual([
      {
        id: LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: { [CARD_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: GRAPH_ID,
      },
    ]);
    expect(result.space.defaultLayout).toBe(LAYOUT_ID);
  });
});
