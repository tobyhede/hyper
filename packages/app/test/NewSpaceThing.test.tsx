import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NewSpaceThing } from '../src/components/NewSpaceThing';
import type { SpaceThingTargetListing } from '../src/thing-creation';

/**
 * The Space Thing creation pane on its own, for the one thing the full-app
 * tests cannot reach.
 *
 * What this pane does while an Edit is in flight is its own contract, and it
 * is invisible from above: the state machine refuses `cancel` while
 * `submitting` too, so an app-level Escape passes whether or not this pane
 * withholds the dismissal. Both guards are wanted — the reducer keeps the
 * state right, and this keeps the surface from unmounting itself out from
 * under an Edit that completes regardless — so each needs its own test.
 */

const targets: SpaceThingTargetListing = { kind: 'read', spaces: [] };

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

describe('NewSpaceThing', () => {
  it('dismisses nothing while a coordinated Edit is in flight', () => {
    const onCancel = vi.fn();
    render(
      <NewSpaceThing
        targets={targets}
        refusal={null}
        busy
        onCreate={() => undefined}
        onCancel={onCancel}
        onRefusalStale={() => undefined}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('new-space-thing-title'), { key: 'Escape' });

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId('new-space-thing')).toBeVisible();
  });

  it('dismisses on Escape when no Edit is running', () => {
    const onCancel = vi.fn();
    render(
      <NewSpaceThing
        targets={targets}
        refusal={null}
        busy={false}
        onCreate={() => undefined}
        onCancel={onCancel}
        onRefusalStale={() => undefined}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('new-space-thing-title'), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
  });
});
