import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { OpenCard } from '../src/components/OpenCard';

/**
 * Its own file on purpose: the Markdown editor is a lazily loaded chunk, and
 * `lazy()` caches its resolution on the component. A test that needs the editor to
 * be *absent* at first render therefore cannot share a file with tests that have
 * already rendered one — there, the chunk is warm and mounts synchronously.
 */
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

const markdown = () => ({
  id: CARD_ID,
  title: 'A',
  kind: 'markdown' as const,
  body: '**A** source',
});

/** Let any focus queued for the next paint actually run. */
const flushAnimationFrames = async (): Promise<void> => {
  for (let frame = 0; frame < 2; frame += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
  }
};

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

describe('the opened Card, before its editor has loaded', () => {
  /**
   * Enter in the Title asks for the body, and the body may not have arrived yet. The
   * ask is therefore deferred — and a deferred ask has to be cancellable: an author
   * who goes on typing the title has plainly stopped waiting for it, and a caret that
   * jumps mid-word puts the rest of the title into the Markdown.
   */
  it('abandons a pending body focus when the author goes on typing the title', async () => {
    render(<OpenCard card={markdown()} onComplete={vi.fn(() => null)} onCancel={vi.fn()} />);
    const title = screen.getByRole('textbox', { name: 'Title' });
    title.focus();
    expect(screen.queryByRole('textbox', { name: 'Markdown source' })).not.toBeInTheDocument();

    fireEvent.keyDown(title, { key: 'Enter' });
    fireEvent.change(title, { target: { value: 'Renamed A' } });

    const source = await screen.findByRole('textbox', { name: 'Markdown source' });
    await flushAnimationFrames();

    expect(title).toHaveFocus();
    expect(source).not.toHaveFocus();
  });
});
