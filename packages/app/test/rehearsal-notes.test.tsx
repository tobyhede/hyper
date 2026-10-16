import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRehearsalNotes } from '../src/rehearsal-notes';

describe('the rehearsal notes under the Stage', () => {
  it('start hidden, and the toggle shows and hides them', () => {
    const { result } = renderHook(() => useRehearsalNotes(true));
    expect(result.current.shown).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.shown).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.shown).toBe(false);
  });

  it('start hidden again at the next presentation', () => {
    const { result, rerender } = renderHook(
      ({ presenting }: { readonly presenting: boolean }) => useRehearsalNotes(presenting),
      { initialProps: { presenting: true } },
    );
    act(() => result.current.toggle());
    expect(result.current.shown).toBe(true);

    rerender({ presenting: false });
    expect(result.current.shown).toBe(false);
    rerender({ presenting: true });
    expect(result.current.shown).toBe(false);
  });
});
