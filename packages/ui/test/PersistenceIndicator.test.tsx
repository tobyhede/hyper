import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PersistenceIndicator, TooltipProvider } from '../src/index';

describe('PersistenceIndicator', () => {
  afterEach(() => vi.useRealTimers());

  it('stays entirely absent once work has settled', () => {
    const { container } = render(
      <TooltipProvider>
        <PersistenceIndicator state="settled" />
      </TooltipProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['pending', 'Saving changes'],
    ['rejected', 'Persistence rejected'],
  ] as const)('uses a compact labelled cue while %s', (state, label) => {
    render(
      <TooltipProvider>
        <PersistenceIndicator state={state} />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('confirms a completed save briefly before becoming transparent again', () => {
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

    expect(screen.getByRole('button', { name: 'Changes saved' })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByRole('button', { name: 'Changes saved' })).toHaveAttribute(
      'data-state',
      'exiting',
    );

    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('button', { name: 'Changes saved' })).not.toBeInTheDocument();
  });
});
