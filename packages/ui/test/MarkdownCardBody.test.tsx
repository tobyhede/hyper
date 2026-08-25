import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MarkdownCardBody } from '../src';

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

/**
 * The editor arrives behind `lazy`, so assertions about an active edit wait for
 * it. At rest, the body is the rendered Markdown used by presentation mode.
 */
const source = () =>
  screen.findByRole(
    'textbox',
    { name: 'Markdown source of Strategies' },
    // The editor deliberately crosses a dynamic-import boundary. Under the
    // full parallel coverage suite that chunk can arrive after Testing
    // Library's one-second default even though the focus handoff is healthy.
    { timeout: 5_000 },
  );

const body = (props: Partial<Parameters<typeof MarkdownCardBody>[0]> = {}) => (
  <MarkdownCardBody
    source={'# Strategies\n\nNo strategy is privileged.'}
    ariaLabel="Markdown source of Strategies"
    {...props}
  />
);

describe('MarkdownCardBody', () => {
  it('draws parsed Markdown at rest through the presentation renderer', () => {
    const { container } = render(
      <MarkdownCardBody
        source={'# Heading\n\nA paragraph with **bold** text.\n\n- one\n- two'}
        ariaLabel="Markdown source of Strategies"
        onBeginEdit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeVisible();
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('offers no gesture when the caller supplied nothing to begin an edit with', () => {
    const { container } = render(body());

    const surface = container.querySelector('.markdown-card-body');
    expect(surface).toHaveAttribute('data-editable', 'false');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('asks to begin an edit on one activation, and does not take the Card click with it', () => {
    const onBeginEdit = vi.fn();
    const onCardClick = vi.fn();
    render(<div onClick={onCardClick}>{body({ onBeginEdit })}</div>);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Markdown source of Strategies' }));

    expect(onBeginEdit).toHaveBeenCalledTimes(1);
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('leaves pointer-down available to begin a Card drag at rest', () => {
    const onPointerDown = vi.fn();
    render(<div onPointerDown={onPointerDown}>{body({ onBeginEdit: vi.fn() })}</div>);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Edit Markdown source of Strategies' }),
    );

    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it('takes a caret when the caller supplies an editor, and lets it go when the caller withdraws one', async () => {
    const editor = { onComplete: vi.fn(), onEnd: vi.fn() };
    const { rerender } = render(body({ onBeginEdit: vi.fn(), editor }));

    expect(await source()).toHaveAttribute('contenteditable', 'true');

    rerender(body({ onBeginEdit: vi.fn() }));
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(
      screen.getByRole('button', { name: 'Edit Markdown source of Strategies' }),
    ).toBeVisible();
  });

  it('commits the draft on Mod-Enter and abandons it on Escape', async () => {
    const editor = { onComplete: vi.fn(), onEnd: vi.fn() };
    const { rerender } = render(body({ onBeginEdit: vi.fn(), editor }));
    await source();

    fireEvent.keyDown(await source(), { key: 'Enter', metaKey: true });
    expect(editor.onComplete).toHaveBeenCalledWith('# Strategies\n\nNo strategy is privileged.');
    expect(editor.onEnd).toHaveBeenCalledTimes(1);

    editor.onComplete.mockClear();
    rerender(body({ onBeginEdit: vi.fn(), editor }));
    fireEvent.keyDown(await source(), { key: 'Escape' });
    // Abandoning completes nothing — the two exits differ in exactly this.
    expect(editor.onComplete).not.toHaveBeenCalled();
    expect(editor.onEnd).toHaveBeenCalledTimes(2);
  });

  it('commits a draft the author clicked away from, and not one they moved within', async () => {
    const editor = { onComplete: vi.fn(), onEnd: vi.fn() };
    const { container } = render(body({ onBeginEdit: vi.fn(), editor }));
    const editable = await source();
    const surface = container.querySelector('.markdown-card-body');
    if (surface === null) throw new Error('missing body surface');

    // `focusout` bubbles, so a move *inside* the editor arrives here too and is
    // not the author leaving.
    fireEvent.blur(surface, { relatedTarget: editable });
    expect(editor.onComplete).not.toHaveBeenCalled();

    fireEvent.blur(surface, { relatedTarget: document.body });
    expect(editor.onComplete).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['MacIntel', '⌘↵ Save · Esc Cancel'],
    ['Win32', 'Ctrl↵ Save · Esc Cancel'],
  ])('names the modifier for %s without changing the compact hint', async (platform, label) => {
    const platformGetter = vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    const { container } = render(
      body({ onBeginEdit: vi.fn(), editor: { onComplete: vi.fn(), onEnd: vi.fn() } }),
    );
    await source();
    const hint = container.querySelector('.markdown-card-body__shortcut-hint');
    if (hint === null) throw new Error('missing shortcut hint');

    expect(hint).toHaveTextContent(label);
    expect(hint.querySelectorAll('[data-slot="kbd"]')).toHaveLength(3);
    platformGetter.mockRestore();
  });

  // Two separate edits, so the lazy editor mounts twice — past the default budget.
  it(
    'still commits on blur in an edit that was never given the caret',
    { timeout: 20_000 },
    async () => {
      // An editor supplied with `autoFocus={false}` never runs the arm that clears
      // the closing flag, so a *previous* exit's flag survived into it and the
      // blur below found the surface already "leaving" — the author's draft went
      // nowhere, with nothing to see. The flag says what *this* exit is doing, so
      // no edit may inherit one from the edit before it.
      const editor = { onComplete: vi.fn(), onEnd: vi.fn() };
      const { container, rerender } = render(body({ onBeginEdit: vi.fn(), editor }));
      await source();
      fireEvent.keyDown(await source(), { key: 'Escape' });

      rerender(body({ onBeginEdit: vi.fn() }));
      rerender(body({ onBeginEdit: vi.fn(), editor, autoFocus: false }));
      await source();
      const surface = container.querySelector('.markdown-card-body');
      if (surface === null) throw new Error('missing body surface');

      fireEvent.blur(surface, { relatedTarget: document.body });
      expect(editor.onComplete).toHaveBeenCalledTimes(1);
    },
  );

  it('withholds the React Flow escape hatches until there is a caret to protect', () => {
    const { container, rerender } = render(body({ onBeginEdit: vi.fn() }));
    const surface = container.querySelector('.markdown-card-body');

    // At rest the rendered Markdown is text on a Card, and dragging by it is what
    // an author expects.
    expect(surface).not.toHaveClass('nodrag');

    rerender(body({ onBeginEdit: vi.fn(), editor: { onComplete: vi.fn(), onEnd: vi.fn() } }));
    expect(surface).toHaveClass('nodrag', 'nopan', 'nokey');
    // `nowheel` is deliberately absent: the wheel belongs to the canvas
    // everywhere, so no Expanded Card is a hole to wheel-pan across (ADR 0064).
    expect(surface).not.toHaveClass('nowheel');
  });
});
