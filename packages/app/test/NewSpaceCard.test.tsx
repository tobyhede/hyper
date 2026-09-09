import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NewSpaceCard } from '../src/components/NewSpaceCard';
import type { SpaceCardTargetListing } from '../src/card-creation';

/**
 * The Space Card creation pane on its own, for the one thing the full-app
 * tests cannot reach.
 *
 * What this pane does while an Edit is in flight is its own contract, and it
 * is invisible from above: the state machine refuses `cancel` while
 * `submitting` too, so an app-level Escape passes whether or not this pane
 * withholds the dismissal. Both guards are wanted — the reducer keeps the
 * state right, and this keeps the surface from unmounting itself out from
 * under an Edit that completes regardless — so each needs its own test.
 */

const targets: SpaceCardTargetListing = { kind: 'read', spaces: [] };

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

describe('NewSpaceCard', () => {
  it('dismisses nothing while a coordinated Edit is in flight', () => {
    const onCancel = vi.fn();
    render(
      <NewSpaceCard
        targets={targets}
        refusal={null}
        busy
        onCreate={() => undefined}
        onCancel={onCancel}
        onRefusalStale={() => undefined}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('new-space-card-title'), { key: 'Escape' });

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId('new-space-card')).toBeVisible();
  });

  it('dismisses on Escape when no Edit is running', () => {
    const onCancel = vi.fn();
    render(
      <NewSpaceCard
        targets={targets}
        refusal={null}
        busy={false}
        onCreate={() => undefined}
        onCancel={onCancel}
        onRefusalStale={() => undefined}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('new-space-card-title'), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
  });
});
