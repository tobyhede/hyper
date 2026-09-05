// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { createCreationContinuation } from '../src/creation-continuation';

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');

describe('Card creation continuation', () => {
  it('waits for pane closure and projection, then selects and waits for naming acceptance', () => {
    const selectCard = vi.fn();
    const continuation = createCreationContinuation({
      selectCard,
      focusAddCard: vi.fn(),
      reportObserverError: vi.fn(),
    });
    continuation.request({ kind: 'created', cardKind: 'markdown', cardId: CARD_ID });
    const ready = {
      paneOpen: false,
      cards: [{ id: CARD_ID }],
      canName: true,
      canFocusAddCard: true,
    };
    continuation.resume({ ...ready, paneOpen: true });
    continuation.resume({ ...ready, cards: [] });
    expect(selectCard).not.toHaveBeenCalled();
    continuation.resume(ready);
    continuation.resume(ready);
    expect(selectCard).toHaveBeenCalledTimes(1);
    expect(selectCard).toHaveBeenCalledWith(CARD_ID);
    expect(continuation.getState().namingCardId).toBe(CARD_ID);
    continuation.named(CARD_ID);
    expect(continuation.getState().request).toBeNull();
    expect(continuation.getState().namingCardId).toBeNull();
  });
  it('selects a Space Card and returns focus to the menu once it is available', () => {
    const effects: string[] = [];
    const continuation = createCreationContinuation({
      selectCard: () => effects.push('select'),
      focusAddCard: () => effects.push('focus'),
      reportObserverError: vi.fn(),
    });
    const request = { kind: 'created', cardKind: 'space', cardId: CARD_ID } as const;
    continuation.request(request);
    const ready = {
      paneOpen: false,
      cards: [{ id: CARD_ID }],
      canName: false,
      canFocusAddCard: true,
    };
    continuation.resume({ ...ready, canFocusAddCard: false });
    expect(effects).toEqual([]);
    continuation.resume(ready);
    continuation.request(request);
    continuation.resume(ready);
    expect(effects).toEqual(['select', 'focus']);
    expect(continuation.getState()).toEqual({ request: null, namingCardId: null });
  });

  it('defers Alias naming while authoring is unavailable and ignores an unrelated acknowledgement', () => {
    const selectCard = vi.fn();
    const continuation = createCreationContinuation({
      selectCard,
      focusAddCard: vi.fn(),
      reportObserverError: vi.fn(),
    });
    continuation.request({ kind: 'created', cardKind: 'alias', cardId: CARD_ID });
    const ready = {
      paneOpen: false,
      cards: [{ id: CARD_ID }],
      canName: true,
      canFocusAddCard: true,
    };
    continuation.resume({ ...ready, canName: false });
    expect(selectCard).not.toHaveBeenCalled();
    continuation.resume(ready);
    continuation.named('another-card');
    expect(continuation.getState().namingCardId).toBe(CARD_ID);
    continuation.named(CARD_ID);
    continuation.resume(ready);
    expect(selectCard).toHaveBeenCalledTimes(1);
  });

  it('returns to the menu after each cancellation without selecting a Card', () => {
    const selectCard = vi.fn();
    const focusAddCard = vi.fn();
    const continuation = createCreationContinuation({
      selectCard,
      focusAddCard,
      reportObserverError: vi.fn(),
    });
    const ready = { paneOpen: false, cards: [], canName: false, canFocusAddCard: true };
    continuation.request({ kind: 'cancelled' });
    continuation.resume({ ...ready, paneOpen: true });
    expect(focusAddCard).not.toHaveBeenCalled();
    continuation.resume(ready);
    continuation.resume(ready);
    expect(focusAddCard).toHaveBeenCalledTimes(1);
    continuation.request({ kind: 'cancelled' });
    continuation.resume(ready);
    expect(focusAddCard).toHaveBeenCalledTimes(2);
    expect(selectCard).not.toHaveBeenCalled();
  });
});
