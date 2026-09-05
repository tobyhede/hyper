import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCardCreation } from '../src/card-creation-react';
import type { CardCreationSeams } from '../src/card-creation';

/**
 * Mounting the Card creation module.
 *
 * The transitions themselves are proven without React
 * (`card-creation-state.test.ts`) and the panes are proven from the controls an
 * author has (`card-creation.test.tsx`, `space-card-authoring.test.tsx`).
 * What only exists at the mount point is the instance: the module owns the
 * authoritative pane state now, so a hook that let React drop and rebuild it
 * would close an open pane and orphan an Edit already in flight.
 */

/** Seams that answer immediately, so what a test observes is the mounting. */
const seams = (): CardCreationSeams => ({
  readChoices: () => ({ choices: { kind: 'alias', targets: [] }, listing: null }),
  submit: () => ({ kind: 'none' }),
  reportBreak: () => undefined,
});

describe('useCardCreation', () => {
  /**
   * One instance for the life of the mount.
   *
   * A changed `seams` identity is the observable form of the guarantee: the
   * instance is held in state rather than in a cache React is free to discard,
   * so neither a re-render nor a dropped cache can answer "where is the pane"
   * with a second machine at `closed`.
   */
  it('keeps one module across a render that changes the seams identity', () => {
    const { result, rerender } = renderHook(({ mounted }) => useCardCreation(mounted), {
      initialProps: { mounted: seams() },
    });
    act(() => result.current.open('alias'));
    expect(result.current.state.pane.status).toBe('choosing');

    rerender({ mounted: seams() });

    expect(result.current.state.pane.status).toBe('choosing');
    expect(result.current.state.opening).toBe(1);
  });
});
