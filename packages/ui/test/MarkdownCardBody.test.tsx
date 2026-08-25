import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasCard } from '../src';
import { MarkdownCardBody } from '../src/MarkdownCardBody';

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

/**
 * The body in the Card that mounts it, which is the only place the two ends of
 * an edit are drawn: this surface publishes them and the Card's rail draws them
 * (`card-content-edit.ts`). Mounted alone, the body keeps its keys and offers no
 * control of its own.
 */
const onCard = (props: Partial<Parameters<typeof MarkdownCardBody>[0]> = {}) => (
  <CanvasCard
    front={
      props.editor === undefined
        ? {
            kind: 'markdown',
            source: '# Strategies\n\nNo strategy is privileged.',
            open: true,
            onBeginEdit: props.onBeginEdit ?? vi.fn(),
          }
        : {
            kind: 'markdown',
            source: '# Strategies\n\nNo strategy is privileged.',
            open: true,
            editor: props.editor,
            onBeginEdit: props.onBeginEdit ?? vi.fn(),
          }
    }
    state="rest"
    title="Strategies"
    graphColor="#ffc53d"
  />
);

function EditingCard() {
  const [editing, setEditing] = useState(true);
  return (
    <CanvasCard
      front={
        editing
          ? {
              kind: 'markdown',
              source: '# Strategies\n\nNo strategy is privileged.',
              open: true,
              editor: { onComplete: vi.fn(), onEnd: () => setEditing(false) },
              onBeginEdit: () => setEditing(true),
            }
          : {
              kind: 'markdown',
              source: '# Strategies\n\nNo strategy is privileged.',
              open: true,
              onBeginEdit: () => setEditing(true),
            }
      }
      state="rest"
      title="Strategies"
      graphColor="#ffc53d"
    />
  );
}

describe('MarkdownCardBody', () => {
  it('draws parsed Markdown at rest through the presentation renderer', () => {
    const { container } = render(
      <MarkdownCardBody
        source={'# Heading\n\nA paragraph with **bold** text.\n\n- one\n- two'}
        ariaLabel="Markdown source of Strategies"
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

  it('makes the complete rendered Markdown surface the semantic edit control', () => {
    const onBeginEdit = vi.fn();
    render(body({ onBeginEdit }));

    const control = screen.getByRole('button', {
      name: 'Edit Markdown source of Strategies',
    });
    expect(control.querySelector('svg')).toBeInTheDocument();
    expect(control.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(control);

    expect(onBeginEdit).toHaveBeenCalledTimes(1);
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
    const { rerender } = render(body({ editor }));

    expect(await source()).toHaveAttribute('contenteditable', 'true');

    rerender(body());
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(screen.getByText('No strategy is privileged.')).toBeVisible();
  });

  it('commits the draft on Mod-Enter and abandons it on Escape', async () => {
    const editor = { onComplete: vi.fn(), onEnd: vi.fn() };
    const { rerender } = render(body({ editor }));
    await source();

    fireEvent.keyDown(await source(), { key: 'Enter', metaKey: true });
    expect(editor.onComplete).toHaveBeenCalledWith('# Strategies\n\nNo strategy is privileged.');
    expect(editor.onEnd).toHaveBeenCalledTimes(1);

    editor.onComplete.mockClear();
    rerender(body({ editor }));
    fireEvent.keyDown(await source(), { key: 'Escape' });
    // Abandoning completes nothing — the two exits differ in exactly this.
    expect(editor.onComplete).not.toHaveBeenCalled();
    expect(editor.onEnd).toHaveBeenCalledTimes(2);
  });

  it('keeps the draft and caret when the application retains a refused save', async () => {
    const editor = { onComplete: vi.fn(() => 'retained' as const), onEnd: vi.fn() };
    render(body({ editor }));
    const editable = await source();

    fireEvent.keyDown(editable, { key: 'Enter', metaKey: true });

    expect(editor.onComplete).toHaveBeenCalledWith('# Strategies\n\nNo strategy is privileged.');
    expect(editor.onEnd).not.toHaveBeenCalled();
    expect(await source()).toBeVisible();
  });

  it('keeps a draft the author clicked away from, committing and abandoning nothing', async () => {
    const editor = { onComplete: vi.fn(), onEnd: vi.fn() };
    const { container } = render(body({ editor }));
    const editable = await source();
    const surface = container.querySelector('.markdown-card-body');
    if (surface === null) throw new Error('missing body surface');

    // Four exits and no more: two keys and the two controls that pair with them.
    // A pointer landing elsewhere on the canvas does not get to decide what
    // happens to a document — losing one to a stray click is not a cost worth
    // paying to save the author from saying which exit they wanted.
    fireEvent.blur(surface, { relatedTarget: editable });
    fireEvent.blur(surface, { relatedTarget: document.body });

    expect(editor.onComplete).not.toHaveBeenCalled();
    expect(editor.onEnd).not.toHaveBeenCalled();
    expect(await source()).toBeVisible();
  });

  it.each([
    ['MacIntel', '⌘+↵Save'],
    ['Win32', 'Ctrl+↵Save'],
  ])('names the modifier for %s and sets each key beside its word', async (platform, save) => {
    const platformGetter = vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    const { container } = render(body({ editor: { onComplete: vi.fn(), onEnd: vi.fn() } }));
    await source();
    const hint = container.querySelector('.markdown-card-body__shortcut-hint');
    if (hint === null) throw new Error('missing shortcut hint');

    // Two pairs, each its own element, so what sets them apart is a `gap` rule
    // rather than a separator character wedged into one run of glyphs. The gap
    // itself is a computed style and belongs to the browser test.
    expect(
      Array.from(hint.querySelectorAll('.markdown-card-body__shortcut')).map(
        (pair) => pair.textContent,
      ),
    ).toEqual([save, 'EscCancel']);
    expect(hint.querySelectorAll('[data-slot="kbd"]')).toHaveLength(3);
    platformGetter.mockRestore();
  });

  it('offers no control of its own when nothing published a rail to draw one on', async () => {
    render(body({ editor: { onComplete: vi.fn(), onEnd: vi.fn() } }));
    await source();

    expect(screen.queryByRole('button', { name: /^Save Card/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cancel editing Card/ })).not.toBeInTheDocument();
  });

  it('takes the same two exits from the rail as from its own keys', async () => {
    const editor = { onComplete: vi.fn(), onEnd: vi.fn() };
    render(onCard({ editor }));
    await source();

    // Abandoning has nothing to commit — the pairing `onEnd` deliberately does
    // not repeat, since it fires on every exit including the committing ones.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing Card Strategies' }));
    expect(editor.onComplete).not.toHaveBeenCalled();
    expect(editor.onEnd).toHaveBeenCalledOnce();

    await source();
    fireEvent.click(screen.getByRole('button', { name: 'Save Card Strategies' }));
    expect(editor.onComplete).toHaveBeenCalledOnce();
    expect(editor.onComplete).toHaveBeenCalledWith('# Strategies\n\nNo strategy is privileged.');
    expect(editor.onEnd).toHaveBeenCalledTimes(2);
  });

  it('withdraws those two ends from the rail when the caret goes back', async () => {
    const { rerender } = render(onCard({ editor: { onComplete: vi.fn(), onEnd: vi.fn() } }));
    await source();
    expect(screen.getByRole('button', { name: 'Save Card Strategies' })).toBeVisible();

    rerender(onCard());

    expect(screen.queryByRole('button', { name: 'Save Card Strategies' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel editing Card Strategies' }),
    ).not.toBeInTheDocument();
  });

  it.each([['Save Card Strategies'], ['Cancel editing Card Strategies']])(
    'returns focus to Edit after leaving through %s',
    async (action) => {
      render(<EditingCard />);
      await source();

      fireEvent.click(screen.getByRole('button', { name: action }));

      expect(screen.getByRole('button', { name: 'Edit Card Strategies' })).toHaveFocus();
    },
  );

  // Two separate edits, so the lazy editor mounts twice — past the default budget.
  it(
    'ends a second edit from its own keys, including one never given the caret',
    { timeout: 20_000 },
    async () => {
      const editor = { onComplete: vi.fn(), onEnd: vi.fn() };
      const { rerender } = render(body({ editor }));
      await source();
      fireEvent.keyDown(await source(), { key: 'Escape' });

      // An editor supplied with `autoFocus={false}` is one the caret was never
      // placed in. Its keys are still its own — nothing about a previous exit
      // may survive into it and spend this edit's.
      rerender(body());
      rerender(body({ editor, autoFocus: false }));
      const editable = await source();

      fireEvent.keyDown(editable, { key: 'Enter', metaKey: true });
      expect(editor.onComplete).toHaveBeenCalledTimes(1);
      expect(editor.onEnd).toHaveBeenCalledTimes(2);
    },
  );

  it('withholds the React Flow escape hatches until there is a caret to protect', () => {
    const { container, rerender } = render(body());
    const surface = container.querySelector('.markdown-card-body');

    // At rest the rendered Markdown is text on a Card, and dragging by it is what
    // an author expects.
    expect(surface).not.toHaveClass('nodrag');

    rerender(body({ editor: { onComplete: vi.fn(), onEnd: vi.fn() } }));
    expect(surface).toHaveClass('nodrag', 'nopan', 'nokey');
    // `nowheel` is deliberately absent: the wheel belongs to the canvas
    // everywhere, so no Expanded Card is a hole to wheel-pan across (ADR 0064).
    expect(surface).not.toHaveClass('nowheel');
  });
});
