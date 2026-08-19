import { describe, expect, it } from 'vitest';
import { spaceFileSchema } from '@project/core';
import { loadSpace, newSpace } from '../src/index';

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
    expect(result.space.graphs).toEqual([]);
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

  it("authors no position — centering is the view's job, not content", () => {
    // A position nobody wrote is authored content nobody wrote. `fitView` frames
    // whatever is on screen, so a new space declares no layout and no view.
    const { file } = newSpace();
    expect(file.layouts).toBeUndefined();
    expect(file.defaultRenderer).toBeUndefined();
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
