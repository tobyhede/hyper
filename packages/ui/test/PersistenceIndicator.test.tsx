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
    ['rejected', 'Persistence rejected', 'rejected'],
  ] as const)('uses a compact labelled cue while %s', (state, label, cue) => {
    render(
      <TooltipProvider>
        <PersistenceIndicator state={state} />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: label })).toHaveAttribute('data-state', cue);
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
