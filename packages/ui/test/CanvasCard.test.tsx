import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasCard } from '../src';

describe('CanvasCard kind and interaction state', () => {
  it('draws a creation preview without authored Markdown or open state', () => {
    render(
      <CanvasCard front={{ kind: 'preview' }} state="rest" title="Card 2" graphColor="#ffc53d" />,
    );

    expect(screen.getByRole('article', { name: 'Card 2' })).toHaveAttribute(
      'data-kind',
      'markdown',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('presents a Markdown front and its resting state', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: 'Markdown', open: true }}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );

    const card = screen.getByRole('article', { name: 'Strategies' });
    expect(card).toHaveAttribute('data-kind', 'markdown');
    expect(card).toHaveAttribute('data-state', 'rest');
    // Every kind draws its glyph, Markdown included — CardKindIcon has no
    // silent-nothing case, and the rail is not the centred, icon-optional
    // layout the pre-design-system Card used.
    expect(screen.getByRole('img', { name: 'Markdown Card' })).toBeVisible();
    expect(screen.queryByTestId('alias-marker')).not.toBeInTheDocument();
  });

  it('presents an Alias front with the Target title it must receive', () => {
    render(
      <CanvasCard
        front={{ kind: 'alias', aliasOf: 'Opening' }}
        state="selected"
        title="Opening, again"
        graphColor="#35d6c3"
      />,
    );

    const card = screen.getByRole('article', { name: 'Opening, again' });
    expect(card).toHaveAttribute('data-kind', 'alias');
    expect(card).toHaveAttribute('data-state', 'selected');
    expect(screen.getByRole('img', { name: 'Alias' })).toBeVisible();
    expect(screen.getByTestId('alias-marker')).toHaveTextContent('Opening');
  });

  it('offers an Alias its metadata Open operation without Markdown state', () => {
    const onOpen = vi.fn();
    render(
      <CanvasCard
        front={{ kind: 'alias', aliasOf: 'Opening', onOpen }}
        state="selected"
        title="Return"
        graphColor="#ffc53d"
      />,
    );

    screen.getByRole('button', { name: 'Open Card Return' }).click();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Close Card Return' })).not.toBeInTheDocument();
  });

  it('reflects dragging as its own external state, distinct from selected', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: 'Markdown', open: true }}
        state="dragging"
        title="Closing"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.getByRole('article', { name: 'Closing' })).toHaveAttribute(
      'data-state',
      'dragging',
    );
  });
});

describe('CanvasCard Open and Close operation', () => {
  it('owns the rendered body of an open Markdown front', () => {
    const onOpenChange = vi.fn(() => 'completed' as const);
    render(
      <CanvasCard
        front={{
          kind: 'markdown',
          source: '## Authored placement',
          open: true,
          onOpenChange,
        }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Authored placement' })).toBeVisible();
    screen.getByRole('button', { name: 'Close Card A' }).click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('offers no action when neither operation is supplied', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.queryByRole('button', { name: /Card A$/ })).not.toBeInTheDocument();
  });

  it('names and draws the same working operation for each open state', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false, onOpenChange }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    const open = screen.getByRole('button', { name: 'Open Card A' });
    expect(open.querySelector('svg')).toHaveClass('lucide-maximize-2');
    open.click();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(
      <CanvasCard
        front={{ kind: 'markdown', source: 'Markdown', open: true, onOpenChange }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );
    const close = screen.getByRole('button', { name: 'Close Card A' });
    expect(close.querySelector('svg')).toHaveClass('lucide-minimize-2');
    close.click();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('offers Edit before Close whether or not the Card is open', () => {
    const onBeginContentEdit = vi.fn();
    const onOpenChange = vi.fn(() => 'completed' as const);
    const { rerender } = render(
      <CanvasCard
        front={{
          kind: 'markdown',
          source: '',
          open: false,
          onOpenChange,
          onBeginEdit: onBeginContentEdit,
        }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    const labels = () =>
      Array.from(screen.getByTestId('canvas-card-actions').querySelectorAll('button')).map(
        (button) => button.getAttribute('aria-label'),
      );
    expect(labels()).toEqual(['Edit Card A', 'Open Card A']);

    // Collapsed, Edit is the two gestures an author would otherwise make in
    // order, and both are the Card's own operations — opening is the same call
    // the Open control makes, so nothing about it has a second implementation.
    screen.getByRole('button', { name: 'Edit Card A' }).click();
    expect(onOpenChange).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(onBeginContentEdit).toHaveBeenCalledOnce();

    rerender(
      <CanvasCard
        front={{
          kind: 'markdown',
          source: 'Markdown',
          open: true,
          onOpenChange,
          onBeginEdit: onBeginContentEdit,
        }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    expect(labels()).toEqual(['Edit Card A', 'Close Card A']);
    // Open, it is only the caret: the Card is already the size it needs to be.
    screen.getByRole('button', { name: 'Edit Card A' }).click();
    expect(onOpenChange).toHaveBeenCalledOnce();
    expect(onBeginContentEdit).toHaveBeenCalledTimes(2);
  });

  it('withholds Edit from a collapsed Card that cannot be opened', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false, onBeginEdit: vi.fn() }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    // The first half of the pair is missing, so the caret would have nowhere to
    // land — a control that ran half of what it names is worse than none.
    expect(screen.queryByRole('button', { name: 'Edit Card A' })).not.toBeInTheDocument();
  });

  it('does not place the content caret when opening a collapsed Card is retained', () => {
    const onBeginContentEdit = vi.fn();
    render(
      <CanvasCard
        front={{
          kind: 'markdown',
          source: '',
          open: false,
          onOpenChange: () => 'retained',
          onBeginEdit: onBeginContentEdit,
        }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    screen.getByRole('button', { name: 'Edit Card A' }).click();

    expect(onBeginContentEdit).not.toHaveBeenCalled();
  });

  it('replaces Edit with the two ends of the edit its content is running, keeping Close', () => {
    const onComplete = vi.fn();
    const onEnd = vi.fn();
    const onBeginContentEdit = vi.fn();
    render(
      <CanvasCard
        front={{
          kind: 'markdown',
          source: 'Markdown',
          open: true,
          editor: { onComplete, onEnd },
          onOpenChange: vi.fn(),
          onBeginEdit: onBeginContentEdit,
        }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
        onBeginTitleEdit={vi.fn()}
      />,
    );

    const actions = screen.getByTestId('canvas-card-actions');
    // Close belongs to the Card rather than to the edit, so it keeps its slot
    // and says it is unavailable instead of vanishing — closing mid-edit would
    // drop the Card's box out from under a live caret holding a draft.
    expect(
      Array.from(actions.querySelectorAll('button')).map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual(['Save Card A', 'Cancel editing Card A', 'Close Card A']);
    // Unavailable through `aria-disabled` rather than the native property, so
    // the control keeps its place in the rail's arrow order (ADR 0070). Drawn
    // and unreachable is the state this replaces.
    const close = screen.getByRole('button', { name: 'Close Card A' });
    expect(close).toHaveAttribute('aria-disabled', 'true');
    expect(close).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Edit Title A' })).not.toBeInTheDocument();
    // The one fact the stylesheet reads to keep the rail up while the caret is
    // in the body, where no hover or focus of the rail's own is true.
    expect(screen.getByRole('article', { name: 'A' })).toHaveAttribute(
      'data-content-editing',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Card A' }));
    expect(onComplete).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing Card A' }));
    expect(onEnd).toHaveBeenCalledTimes(2);
    expect(onBeginContentEdit).not.toHaveBeenCalled();
  });

  it('draws those two ends as the rail actions beside them, not as a second kind', () => {
    render(
      <CanvasCard
        front={{
          kind: 'markdown',
          source: 'Markdown',
          open: true,
          editor: { onComplete: vi.fn(), onEnd: vi.fn() },
          onOpenChange: vi.fn(),
        }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    const actions = screen.getByTestId('canvas-card-actions');
    const buttons = Array.from(actions.querySelectorAll('button'));
    // One rail, one control treatment. A commit control that carried its own box
    // or its own type would read as a different kind of thing to the Close
    // button it sits beside.
    for (const button of buttons) {
      expect(button).toHaveClass('card__rail-action');
      expect(button.textContent).toBe('');
      expect(button.querySelector('svg')).toHaveAttribute('data-icon');
    }
    // The key each performs is still stated, which is how a control that
    // performs a shortcut announces it (`AddCardControl` does the same).
    expect(buttons[0]).toHaveAttribute('aria-keyshortcuts', 'Meta+Enter Control+Enter');
    expect(buttons[1]).toHaveAttribute('aria-keyshortcuts', 'Escape');
  });

  it('keeps the caret in the content when one of those two ends is pressed', () => {
    render(
      <CanvasCard
        front={{
          kind: 'markdown',
          source: 'Markdown',
          open: true,
          editor: { onComplete: vi.fn(), onEnd: vi.fn() },
          onOpenChange: vi.fn(),
        }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    // The rail is outside the writing surface, so a press on it would otherwise
    // pull the caret and the selection out of the document the author is still
    // in. `fireEvent` answers `false` for an event whose default was prevented,
    // which is what stops the browser moving focus to the button.
    for (const name of ['Save Card A', 'Cancel editing Card A']) {
      expect(fireEvent.mouseDown(screen.getByRole('button', { name }))).toBe(false);
    }
  });

  it('hides both actions while the title is being edited', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false, onOpenChange: () => 'completed' }}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={() => null}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /Card A$/ })).not.toBeInTheDocument();
  });

  it('hides both actions while dragging', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false, onOpenChange: () => 'completed' }}
        state="dragging"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.queryByRole('button', { name: /Card A$/ })).not.toBeInTheDocument();
  });
});

describe('CanvasCard title', () => {
  it('draws a heading, not an editor, when no title-edit operation is supplied', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    const heading = screen.getByRole('heading', { name: 'A' });
    expect(heading).toHaveAttribute('data-editable', 'false');
    fireEvent.click(heading);
    expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument();
  });

  it('exposes the editable Title as a named control inside its heading', () => {
    const onBeginTitleEdit = vi.fn();
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
        onBeginTitleEdit={onBeginTitleEdit}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'A' });
    expect(heading).toHaveAttribute('data-editable', 'true');
    expect(heading).toHaveAccessibleName('A');
    const control = screen.getByRole('button', { name: 'Edit Title A' });
    expect(heading).toContainElement(control);

    fireEvent.click(control);
    expect(onBeginTitleEdit).toHaveBeenCalledOnce();
  });

  /**
   * ADR 0065: the Title is its own control. Its pointer and keyboard events
   * must not also become the Card body's selection or Opening gestures.
   */
  it('does not let Title activation reach the Card around it', () => {
    const onBeginTitleEdit = vi.fn();
    const selectedCard = vi.fn();
    const pressedCard = vi.fn();
    render(
      <div onClick={selectedCard} onKeyDown={pressedCard}>
        <CanvasCard
          front={{ kind: 'markdown', source: '', open: false }}
          state="rest"
          title="A"
          graphColor="#ffc53d"
          onBeginTitleEdit={onBeginTitleEdit}
        />
      </div>,
    );

    const control = screen.getByRole('button', { name: 'Edit Title A' });
    fireEvent.click(control);
    fireEvent.keyDown(control, { key: 'Enter' });
    expect(onBeginTitleEdit).toHaveBeenCalledOnce();
    expect(selectedCard).not.toHaveBeenCalled();
    expect(pressedCard).not.toHaveBeenCalled();
  });
});

describe('CanvasCard title editor', () => {
  it('focuses and selects the draft on mount', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={() => null}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Card title' });
    expect(input).toHaveFocus();
    expect(input).toHaveValue('A');
  });

  it('keeps a refused draft field-local and completes a valid one with Enter', () => {
    const onCompleteTitleEdit = vi.fn((title: string) =>
      title.length === 0 ? 'A Card title is required.' : null,
    );
    const onReturnFocus = vi.fn();
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={onCompleteTitleEdit}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={onReturnFocus}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Card title' });

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('A Card title is required.');
    expect(onCompleteTitleEdit).toHaveBeenLastCalledWith('');
    expect(onReturnFocus).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Renamed A' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCompleteTitleEdit).toHaveBeenLastCalledWith('Renamed A');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onReturnFocus).toHaveBeenCalledOnce();
  });

  it('completes on blur, cancels and returns focus on Escape, and leaks no editor event', () => {
    const onCompleteTitleEdit = vi.fn(() => null);
    const onCancelTitleEdit = vi.fn();
    const onReturnFocus = vi.fn();
    const leakedClick = vi.fn();
    const leakedPointer = vi.fn();
    const leakedKey = vi.fn();
    render(
      <div onClick={leakedClick} onPointerDown={leakedPointer} onKeyDown={leakedKey}>
        <CanvasCard
          front={{ kind: 'markdown', source: '', open: false }}
          state="editing"
          title="A"
          graphColor="#ffc53d"
          onCompleteTitleEdit={onCompleteTitleEdit}
          onCancelTitleEdit={onCancelTitleEdit}
          onReturnFocus={onReturnFocus}
        />
      </div>,
    );
    const input = screen.getByRole('textbox', { name: 'Card title' });

    fireEvent.change(input, { target: { value: 'Blurred A' } });
    fireEvent.pointerDown(input);
    fireEvent.click(input);
    fireEvent.blur(input);
    expect(onCompleteTitleEdit).toHaveBeenCalledWith('Blurred A');
    // A blur is the author clicking elsewhere; taking focus back would be a steal.
    expect(onReturnFocus).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancelTitleEdit).toHaveBeenCalledOnce();
    expect(onReturnFocus).toHaveBeenCalledOnce();
    expect(leakedClick).not.toHaveBeenCalled();
    expect(leakedPointer).not.toHaveBeenCalled();
    expect(leakedKey).not.toHaveBeenCalled();
  });

  /**
   * `closingByKey` suppresses the blur that a key exit's own focus move
   * produces, so one completion is not counted twice. It is cleared by that
   * blur — and a caller whose `onReturnFocus` moves no focus (React Flow
   * declines to focus a node it is not making focusable) produces none, so the
   * flag stays raised over an editor that is still open and still being typed
   * into. Editing again is what says the exit did not happen, so it re-arms
   * blur completion rather than waiting for a blur that never came.
   */
  it('still completes on blur after further editing when a key exit moved no focus', () => {
    const onCompleteTitleEdit = vi.fn(() => null);
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={onCompleteTitleEdit}
        onCancelTitleEdit={vi.fn()}
        onReturnFocus={() => {
          /* a caller with nothing to focus: no blur follows */
        }}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Card title' });

    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCompleteTitleEdit).toHaveBeenCalledOnce();
    expect(onCompleteTitleEdit).toHaveBeenCalledWith('Renamed');

    // The caller left the editor open, so the author keeps typing and clicks away.
    fireEvent.change(input, { target: { value: 'Renamed again' } });
    fireEvent.blur(input);
    expect(onCompleteTitleEdit).toHaveBeenCalledTimes(2);
    expect(onCompleteTitleEdit).toHaveBeenLastCalledWith('Renamed again');
  });
});

describe('CanvasCard open Markdown front', () => {
  it('draws nothing below its Title while authored closed state says so', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.getByRole('article', { name: 'Strategies' })).toHaveAttribute(
      'data-expanded',
      'false',
    );
  });

  it('draws its Markdown below the Title and reports itself open', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: 'the Card’s own source', open: true }}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );

    const card = screen.getByRole('article', { name: 'Strategies' });
    expect(card).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByText('the Card’s own source')).toBeVisible();
  });

  it('keeps the Alias front limited to the Target it owns', () => {
    render(
      <CanvasCard
        front={{ kind: 'alias', aliasOf: 'Strategies' }}
        state="rest"
        title="Strategy overview"
        graphColor="#35d6c3"
      />,
    );

    expect(screen.getByTestId('alias-marker')).toHaveTextContent('Strategies');
    expect(screen.queryByText('a body')).not.toBeInTheDocument();
  });

  it('holds the Markdown body open while the Title is being renamed', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: 'the Card’s own source', open: true }}
        state="editing"
        title="Strategies"
        graphColor="#ffc53d"
        onCompleteTitleEdit={() => null}
        onCancelTitleEdit={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    // Expansion is what the Layout authored and the caret is a gesture, so the
    // two are independent rather than exclusive (ADR 0064).
    expect(screen.getByRole('textbox', { name: 'Card title' })).toBeVisible();
    expect(screen.getByText('the Card’s own source')).toBeVisible();
  });
});
