import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresence } from '../src/use-presence';

function Specimen() {
  const [visible, setVisible] = useState(false);
  const presence = usePresence(visible, 200);
  return (
    <>
      <button type="button" onClick={() => setVisible((value) => !value)}>
        Toggle
      </button>
      {presence.mounted && <div data-testid="content" data-presence={presence.state} />}
    </>
  );
}

describe('usePresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('enters, remains mounted while leaving, then unmounts', () => {
    render(<Specimen />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('content')).toHaveAttribute('data-presence', 'entering');

    act(() => void vi.advanceTimersByTime(16));
    expect(screen.getByTestId('content')).toHaveAttribute('data-presence', 'present');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('content')).toHaveAttribute('data-presence', 'leaving');
    act(() => void vi.advanceTimersByTime(199));
    expect(screen.getByTestId('content')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('cancels an exit when visibility returns', () => {
    render(<Specimen />);
    const toggle = screen.getByRole('button', { name: 'Toggle' });
    fireEvent.click(toggle);
    act(() => void vi.advanceTimersByTime(16));
    fireEvent.click(toggle);
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.click(toggle);
    act(() => void vi.advanceTimersByTime(16));
    expect(screen.getByTestId('content')).toHaveAttribute('data-presence', 'present');
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });
});
