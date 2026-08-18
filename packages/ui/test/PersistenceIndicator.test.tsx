import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PersistenceIndicator, TooltipProvider } from '../src/index';

describe('PersistenceIndicator', () => {
  afterEach(() => vi.useRealTimers());

  it('shows a fixed-size neutral cue once settled, never disappearing entirely', () => {
    render(
      <TooltipProvider>
        <PersistenceIndicator state="settled" />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Persisted' })).toHaveAttribute(
      'data-state',
      'persisted',
    );
  });

  it.each([
    ['pending', 'Saving changes', 'saving'],
    ['failed', 'Changes not saved', 'failed'],
    ['rejected', 'Persistence rejected', 'rejected'],
  ] as const)('uses a compact labelled cue while %s', (state, label, cue) => {
    render(
      <TooltipProvider>
        <PersistenceIndicator state={state} />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: label })).toHaveAttribute('data-state', cue);
  });

  it('separates a retryable failure from a permanent rejection', () => {
    const { rerender } = render(
      <TooltipProvider>
        <PersistenceIndicator state="failed" />
      </TooltipProvider>,
    );

    // A red dot, the same shape the resting cues use: the work is still here
    // and the next attempt may clear it, so the toolbar stays quiet and the
    // pinned notice carries the reason and the action.
    const failed = screen.getByRole('button', { name: 'Changes not saved' });
    expect(failed.querySelector('svg')).toBeNull();
    expect(failed.querySelector('[aria-hidden="true"]')).toHaveClass('bg-destructive');

    rerender(
      <TooltipProvider>
        <PersistenceIndicator state="rejected" />
      </TooltipProvider>,
    );

    // A louder glyph, because it is not the same kind of news — no retry clears
    // a rejection, and the dialog that reports it has already been dismissed.
    const rejected = screen.getByRole('button', { name: 'Persistence rejected' });
    expect(rejected.querySelector('svg')).not.toBeNull();
  });

  it('shows a green cue for a completed save, then settles back to the neutral cue without disappearing', async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <TooltipProvider>
        <PersistenceIndicator state="pending" />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Saving changes' })).toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <PersistenceIndicator state="settled" />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Changes saved' })).toHaveAttribute(
      'data-state',
      'saved',
    );

    await act(() => vi.advanceTimersByTime(2_000));

    expect(screen.getByRole('button', { name: 'Persisted' })).toHaveAttribute(
      'data-state',
      'persisted',
    );
  });

  it('drops the saved cue when a fresh commit starts before it expires', async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <TooltipProvider>
        <PersistenceIndicator state="pending" />
      </TooltipProvider>,
    );

    rerender(
      <TooltipProvider>
        <PersistenceIndicator state="settled" />
      </TooltipProvider>,
    );
    rerender(
      <TooltipProvider>
        <PersistenceIndicator state="pending" />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Saving changes' })).toBeInTheDocument();

    await act(() => vi.advanceTimersByTime(2_000));

    expect(screen.getByRole('button', { name: 'Saving changes' })).toBeInTheDocument();
  });
});
