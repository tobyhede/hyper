import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type GraphId, type MapId } from '@project/core';
import type { PresentationScope } from '../src/navigation';
import { useRehearsalNotes } from '../src/rehearsal-notes';

const MAP_ID: MapId = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const TALK: GraphId = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const ENCORE: GraphId = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const talk: PresentationScope = { mapId: MAP_ID, graphId: TALK };

function rehearsing(initial: PresentationScope | null) {
  return renderHook(
    ({ scope }: { readonly scope: PresentationScope | null }) => useRehearsalNotes(scope),
    { initialProps: { scope: initial } },
  );
}

describe('the rehearsal notes under the Stage', () => {
  it('start hidden, and the toggle shows and hides them', () => {
    const { result } = rehearsing(talk);
    expect(result.current.shown).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.shown).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.shown).toBe(false);
  });

  it('stay shown across a reopening of the same Map and Graph', () => {
    const { result, rerender } = rehearsing(talk);
    act(() => result.current.toggle());

    // A reopening publishes a new state, so the scope arrives as a new value.
    rerender({ scope: { mapId: MAP_ID, graphId: TALK } });

    expect(result.current.shown).toBe(true);
  });

  it('start hidden again at the next presentation', () => {
    const { result, rerender } = rehearsing(talk);
    act(() => result.current.toggle());
    expect(result.current.shown).toBe(true);

    rerender({ scope: null });
    expect(result.current.shown).toBe(false);
    rerender({ scope: talk });
    expect(result.current.shown).toBe(false);
  });

  it('start hidden again when a reopening changes Graph', () => {
    const { result, rerender } = rehearsing(talk);
    act(() => result.current.toggle());

    rerender({ scope: { mapId: MAP_ID, graphId: ENCORE } });

    expect(result.current.shown).toBe(false);
  });
});
