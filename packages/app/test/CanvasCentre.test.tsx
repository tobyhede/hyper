import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { CanvasCentre, type VisibleCentre } from '../src/components/CanvasCentre';

/**
 * The reporter's lifetime, which is shorter than its reader's.
 *
 * `CanvasCentre` lives inside the canvas's `cards` branch, because it needs React
 * Flow's store. The controls that read it do not: the toolbar's Add Card and the
 * Alias creation pane are both drawn outside that branch, so the getter outlives
 * the provider whose store it closes over whenever the canvas leaves that branch
 * — a placement failure, or a Space replaced under it.
 *
 * A getter reading a store from an unmounted provider is not a viewport, so it
 * is withdrawn rather than left standing. `App` falls back to the origin, which
 * is what it already does before the first report.
 */
/** The `report` callback's last value, mutated in place so `mount`'s return stays live. */
interface CentreHolder {
  current: VisibleCentre | null;
}

/** What `mount` hands the test: a live reader over the holder, and a way to tear it down. */
interface MountedCanvasCentre {
  readonly centre: () => VisibleCentre | null;
  readonly unmount: () => void;
}

describe('CanvasCentre', () => {
  /**
   * A holder rather than a `let`, so the assignment inside the callback is not
   * narrowed away: TypeScript cannot see that `report` ran, and reads a bare
   * `let` as still `null` at every use below.
   */
  const mount = (): MountedCanvasCentre => {
    const reported: CentreHolder = { current: null };
    const view = render(
      <ReactFlowProvider>
        <CanvasCentre
          report={(next) => {
            reported.current = next;
          }}
        />
      </ReactFlowProvider>,
    );
    return { centre: () => reported.current, unmount: () => view.unmount() };
  };

  it('reports a getter that reads the live viewport', () => {
    const { centre } = mount();

    const reader = centre();
    expect(reader).not.toBeNull();
    const position = reader?.();
    expect(Number.isFinite(position?.x)).toBe(true);
    expect(Number.isFinite(position?.y)).toBe(true);
  });

  it('withdraws the getter when it unmounts', () => {
    const { centre, unmount } = mount();
    expect(centre()).not.toBeNull();

    unmount();

    expect(centre()).toBeNull();
  });
});
