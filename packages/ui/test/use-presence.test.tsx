import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresence } from '../src/use-presence';

let exitDurationMs = 200;
const readExitDuration = (): number => exitDurationMs;

function Specimen({ initial = null }: { readonly initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  const presence = usePresence(value, readExitDuration);
  return (
    <>
      <button type="button" onClick={() => setValue((current) => (current === null ? 'A' : null))}>
        Toggle
      </button>
      <button type="button" onClick={() => setValue('B')}>
        Show B
      </button>
      {presence.mounted && (
        <div data-testid="content" data-presence={presence.state}>
          {presence.value}
        </div>
      )}
    </>
  );
}

describe('usePresence', () => {
  beforeEach(() => {
    exitDurationMs = 200;
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

  it('reads the exit duration after leaving begins', () => {
    render(<Specimen />);
    const toggle = screen.getByRole('button', { name: 'Toggle' });
    fireEvent.click(toggle);
    act(() => void vi.advanceTimersByTime(16));
    exitDurationMs = 1;
    fireEvent.click(toggle);
    expect(screen.getByTestId('content')).toHaveAttribute('data-presence', 'leaving');
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('mounts nothing for an initial absent value', () => {
    render(<Specimen />);
    act(() => void vi.advanceTimersByTime(500));
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('enters with an initial present value', () => {
    render(<Specimen initial="A" />);
    expect(screen.getByTestId('content')).toHaveTextContent('A');
  });

  it('holds the last value it drew while leaving, until the exit duration has passed', () => {
    render(<Specimen />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    act(() => void vi.advanceTimersByTime(16));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    const content = screen.getByTestId('content');
    expect(content).toHaveAttribute('data-presence', 'leaving');
    expect(content).toHaveTextContent('A');
    act(() => void vi.advanceTimersByTime(199));
    expect(screen.getByTestId('content')).toHaveTextContent('A');
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('draws the new value when it returns while leaving', () => {
    render(<Specimen />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    act(() => void vi.advanceTimersByTime(16));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.click(screen.getByRole('button', { name: 'Show B' }));
    expect(screen.getByTestId('content')).toHaveAttribute('data-presence', 'entering');
    expect(screen.getByTestId('content')).toHaveTextContent('B');
    act(() => void vi.advanceTimersByTime(300));
    expect(screen.getByTestId('content')).toHaveTextContent('B');
  });

  it('draws the current value while present', () => {
    render(<Specimen />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    act(() => void vi.advanceTimersByTime(16));
    fireEvent.click(screen.getByRole('button', { name: 'Show B' }));
    expect(screen.getByTestId('content')).toHaveAttribute('data-presence', 'present');
    expect(screen.getByTestId('content')).toHaveTextContent('B');
  });
});
