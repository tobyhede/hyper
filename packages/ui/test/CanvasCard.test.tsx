import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasCard, type CanvasCardFront, type CanvasSpaceCardSelection } from '../src';

/**
 * Base UI's Select positions itself by measuring, and jsdom ships no pointer
 * capture. Both are reached before a Space Card's selector can open at all,
 * which is why this file needs the stubs `Select.test.tsx` already makes; the
 * `scrollIntoView` an item-aligned list calls is stubbed globally in
 * `vitest.setup.ts`.
 */
beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

describe('CanvasCard kind and interaction state', () => {
  it('does not expose entity actions when every supplied group is empty', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="selected"
        title="Empty"
        graphColor="#ffc53d"
        entityActions={[[], []]}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Actions for Card Empty' }),
    ).not.toBeInTheDocument();
  });

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
  });

  it('presents an Alias front by its kind alone', () => {
    render(
      <CanvasCard
        front={{ kind: 'alias', source: '', open: false }}
        state="selected"
        title="Opening, again"
        graphColor="#35d6c3"
      />,
    );

    const card = screen.getByRole('article', { name: 'Opening, again' });
    expect(card).toHaveAttribute('data-kind', 'alias');
    expect(card).toHaveAttribute('data-state', 'selected');
    expect(screen.getByRole('img', { name: 'Alias' })).toBeVisible();
  });

  it('offers an Alias the shared Open operation', () => {
    const onOpenChange = vi.fn(() => 'completed' as const);
    render(
      <CanvasCard
        front={{ kind: 'alias', source: 'Markdown', open: false, onOpenChange }}
        state="selected"
        title="Return"
        graphColor="#ffc53d"
      />,
    );

    screen.getByRole('button', { name: 'Open Card Return' }).click();
    expect(onOpenChange).toHaveBeenCalledWith(true);
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
  it('owns its read-only state and withholds supplied authoring operations', () => {
    render(
      <CanvasCard
        readOnly
        front={{
          kind: 'markdown',
          source: '',
          open: false,
          onOpenChange: vi.fn(() => 'completed' as const),
          onBeginEdit: vi.fn(),
        }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
        onBeginTitleEdit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Card A$/ })).not.toBeInTheDocument();
  });

  it('withdraws an active body editor when the Card becomes read-only', () => {
    const front: CanvasCardFront = {
      kind: 'markdown',
      source: 'Draft',
      open: true,
      editor: { onComplete: vi.fn(), onEnd: vi.fn() },
    };
    const { rerender } = render(
      <CanvasCard front={front} state="rest" title="A" graphColor="#ffc53d" />,
    );
    expect(screen.getByRole('button', { name: 'Save Card A' })).toBeVisible();

    rerender(<CanvasCard readOnly front={front} state="rest" title="A" graphColor="#ffc53d" />);

    expect(screen.queryByRole('button', { name: 'Save Card A' })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'A' })).toHaveAttribute(
      'data-content-editing',
      'false',
    );
  });

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
    // the control keeps its place in the rail's arrow order (ADR 0073). Drawn
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
    expect(heading.closest('.canvas-card__title')).toHaveAttribute('data-editable', 'false');
    fireEvent.click(heading);
    expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument();
  });

  it('wraps its heading in the Title’s one-activation control', () => {
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
    expect(heading.closest('.canvas-card__title')).toHaveAttribute('data-editable', 'true');
    expect(heading).toHaveAccessibleName('A');
    const control = screen.getByRole('button', { name: 'Edit Title A' });
    // The control wraps the heading and not the other way round. An accessible
    // name comes from an element's own label first and its content second, so a
    // heading *containing* a labelled control is named by that control and the
    // Title Lines are reachable through nothing (ADR 0065, ADR 0083).
    expect(control).toContainElement(heading);

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

/**
 * The Title ladder (ADR 0083). What the DOM has to say is the structure — a
 * block element per Title Line, carrying the role the domain gave it — and the
 * typography that structure hangs off is held by
 * `canvas-card-title-ladder.test.ts`, because jsdom computes no CSS.
 *
 * The distinction every one of these is protecting: a break the **author typed**
 * starts a rung; a break the **box chose** does not. jsdom cannot wrap text, so
 * the second half is proved where wrapping is real — the Ladle suite's
 * `markdown · long title` specimen, whose long single-line Title must stay one
 * `title`-role element however many visual lines it takes.
 */
describe('CanvasCard Title ladder', () => {
  const ladder = (): readonly { role: string | null; text: string }[] =>
    [...screen.getByRole('heading').querySelectorAll('.canvas-card__title-line')].map((line) => ({
      role: line.getAttribute('data-role'),
      text: line.textContent,
    }));

  it('draws a Title with no break as one element at the title role', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );

    expect(ladder()).toEqual([{ role: 'title', text: 'Strategies' }]);
  });

  /** Line one names the Card; line two qualifies it; line three and after repeat. */
  it('gives each authored line its role, and every line past the third the last one', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="rest"
        title={'Strategies\nNo strategy is privileged\nADR 0014\nADR 0041'}
        graphColor="#ffc53d"
      />,
    );

    expect(ladder()).toEqual([
      { role: 'title', text: 'Strategies' },
      { role: 'subtitle', text: 'No strategy is privileged' },
      { role: 'caption', text: 'ADR 0014' },
      { role: 'caption', text: 'ADR 0041' },
    ]);
  });

  /** An interior blank line is a gap the author meant, and it keeps its rung. */
  it('keeps an interior blank line as a line of its own', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="rest"
        title={'Strategies\n\nADR 0014'}
        graphColor="#ffc53d"
      />,
    );

    expect(ladder()).toEqual([
      { role: 'title', text: 'Strategies' },
      { role: 'subtitle', text: '' },
      { role: 'caption', text: 'ADR 0014' },
    ]);
  });

  /**
   * A Title that changed shape when a Card opened would teach an author that
   * Opening edits it, so Open and Closed draw the same ladder — and so does
   * every kind, the Card front being the one surface that draws one at all.
   */
  it('draws the same ladder Open and Closed, on every Card kind', () => {
    const title = 'Strategies\nNo strategy is privileged\nADR 0014';
    const fronts: readonly CanvasCardFront[] = [
      { kind: 'preview' },
      { kind: 'markdown', source: '', open: false },
      { kind: 'markdown', source: '', open: true },
      { kind: 'alias', source: '', open: false },
      { kind: 'alias', source: '', open: true },
      { kind: 'space', open: false },
      { kind: 'space', open: true },
    ];

    for (const front of fronts) {
      const { unmount } = render(
        <CanvasCard front={front} state="rest" title={title} graphColor="#ffc53d" />,
      );
      expect(ladder(), front.kind).toEqual([
        { role: 'title', text: 'Strategies' },
        { role: 'subtitle', text: 'No strategy is privileged' },
        { role: 'caption', text: 'ADR 0014' },
      ]);
      unmount();
    }
  });

  /**
   * ADR 0065's one-activation control covers the whole Title rather than its
   * first line: the editor it opens edits the whole string, and a control over
   * the name alone would say otherwise. One control, and the ladder inside it,
   * which is also what puts the hover and focus treatment across the ladder.
   */
  it('puts the whole ladder inside the one Title control', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="rest"
        title={'Strategies\nNo strategy is privileged\nADR 0014'}
        graphColor="#ffc53d"
        onBeginTitleEdit={() => undefined}
      />,
    );

    const control = screen.getByRole('button', {
      name: 'Edit Title Strategies\nNo strategy is privileged\nADR 0014',
    });
    const lines = control.querySelectorAll('.canvas-card__title-line');
    expect(lines).toHaveLength(3);
    expect(screen.getByRole('heading').querySelectorAll('.canvas-card__title-line')).toHaveLength(
      3,
    );
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

  it('restores focus to a title draft refused on blur', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={() => 'A Card title is required.'}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Card title' });

    act(() => input.blur());

    expect(input).toHaveFocus();
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

  /**
   * The Card front is the surface that asks for Title Lines (ADR 0083).
   *
   * `InlineTitleEditor.test.tsx` holds the capability itself; what is proved
   * here is that this front opts into it, which is the half a component
   * reading `variant` would not have needed and a Dock's name field must not
   * gain.
   */
  it('writes a Title on more than one line and completes it whole', () => {
    const onCompleteTitleEdit = vi.fn(() => null);
    render(
      <CanvasCard
        front={{ kind: 'markdown', source: '', open: false }}
        state="editing"
        title="Auth"
        graphColor="#ffc53d"
        onCompleteTitleEdit={onCompleteTitleEdit}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Card title' });
    expect(input).toBeInstanceOf(HTMLTextAreaElement);

    // Shift+Enter is the textarea's own line, so the edit is still running.
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onCompleteTitleEdit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Auth\nThe service, not the screen' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCompleteTitleEdit).toHaveBeenCalledWith('Auth\nThe service, not the screen');
  });
});

describe('CanvasCard open Markdown front', () => {
  it('repeats transition durations cyclically when timing the opacity exit', async () => {
    vi.useFakeTimers();
    const computed = document.createElement('div').style;
    computed.transitionProperty = 'color, transform, width, opacity';
    computed.transitionDuration = '10ms, 100ms';
    const style = vi.spyOn(window, 'getComputedStyle').mockReturnValue(computed);
    const { rerender } = render(
      <CanvasCard
        front={{ kind: 'markdown', source: 'Leaving body', open: true }}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );

    rerender(
      <CanvasCard
        front={{ kind: 'markdown', source: 'Leaving body', open: false }}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );
    await act(() => vi.advanceTimersByTime(99));
    expect(screen.getByText('Leaving body')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Leaving body')).not.toBeInTheDocument();

    style.mockRestore();
    vi.useRealTimers();
  });

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

  it('draws no body on a closed Alias', () => {
    render(
      <CanvasCard
        front={{ kind: 'alias', source: '', open: false }}
        state="rest"
        title="Strategy overview"
        graphColor="#35d6c3"
      />,
    );

    expect(screen.getByRole('article', { name: 'Strategy overview' })).toHaveAttribute(
      'data-expanded',
      'false',
    );
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

describe('CanvasCard Space front', () => {
  const selection = (over: Partial<CanvasSpaceCardSelection> = {}): CanvasSpaceCardSelection => ({
    layouts: [
      { id: 'l1', title: 'Collection 1' },
      { id: 'l2', title: 'Collection 2' },
    ],
    graphs: [{ id: 'g1', title: 'Long' }],
    layoutId: 'l1',
    graphId: 'g1',
    onLayoutChange: vi.fn(),
    onGraphChange: vi.fn(),
    ...over,
  });

  /**
   * A Closed Space Card draws neither selector even when the selections are
   * available to it: those are what Opening it is for.
   */
  it('withholds both selectors while closed', () => {
    render(
      <CanvasCard
        front={{ kind: 'space', open: false, selection: selection() }}
        state="rest"
        title="Strategy elsewhere"
        graphColor="#35d6c3"
      />,
    );

    const card = screen.getByRole('article', { name: 'Strategy elsewhere' });
    expect(card).toHaveAttribute('data-kind', 'space');
    expect(screen.queryByTestId('space-card-layout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-card-graph')).not.toBeInTheDocument();
  });

  /**
   * Opening is the shared Card operation, not a Space-Card-specific one, so it
   * is the same rail control an Alias uses and it names the same two states. A
   * Space Card offers nothing beside it: it has no content of its own, so there
   * is no Edit, Save or Cancel for the rail to draw.
   */
  it('opens and closes through the shared rail control, and offers no content edit', () => {
    const onOpenChange = vi.fn(() => 'completed' as const);
    const { rerender } = render(
      <CanvasCard
        front={{ kind: 'space', open: false, onOpenChange }}
        state="selected"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    screen.getByRole('button', { name: 'Open Card Elsewhere' }).click();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: 'Edit Card Elsewhere' })).not.toBeInTheDocument();

    rerender(
      <CanvasCard
        front={{ kind: 'space', open: true, onOpenChange }}
        state="selected"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    screen.getByRole('button', { name: 'Close Card Elsewhere' }).click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('offers both selectors seeded with the Card’s own selections when open', () => {
    render(
      <CanvasCard
        front={{ kind: 'space', open: true, selection: selection() }}
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    // Named by their labels, not only reachable by test id: the two controls
    // are one word apart and an author has to be able to tell which is which.
    expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveTextContent('Collection 1');
    expect(screen.getByRole('combobox', { name: 'Graph' })).toHaveTextContent('Long');
    expect(screen.getByTestId('space-card-layout')).toBeEnabled();
    expect(screen.getByTestId('space-card-graph')).toBeEnabled();
  });

  /**
   * The Card publishes the choice and authors nothing itself — the selected
   * Layout is the caller's to store and hand back, which is what makes the
   * Graph list beside it the selected Layout's rather than a stale one.
   */
  it('publishes a chosen Layout without selecting it itself', () => {
    const onLayoutChange = vi.fn();
    render(
      <CanvasCard
        front={{
          kind: 'space',
          open: true,
          selection: selection({ onLayoutChange }),
        }}
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    // Opened and chosen from the keyboard: the list is Base UI's own, and its
    // arrow navigation is the path a pointer's click ends at anyway.
    fireEvent.keyDown(screen.getByTestId('space-card-layout'), { key: 'ArrowDown' });
    const chosen = screen.getByRole('option', { name: 'Collection 2' });
    fireEvent.keyDown(chosen, { key: 'ArrowDown' });
    fireEvent.keyDown(chosen, { key: 'Enter' });

    expect(onLayoutChange).toHaveBeenCalledWith('l2');
    expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveTextContent('Collection 1');
  });

  /** A Space with no Graphs is an ordinary thing to reference. */
  it('draws an empty list as unavailable rather than opening onto nothing', () => {
    render(
      <CanvasCard
        front={{
          kind: 'space',
          open: true,
          selection: selection({ graphs: [], graphId: null }),
        }}
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    const graph = screen.getByTestId('space-card-graph');
    expect(graph).toBeDisabled();
    expect(graph).toHaveTextContent('No Graph');
  });

  it('stands a plain note in for the selectors while the Space is unread', () => {
    render(
      <CanvasCard
        front={{ kind: 'space', open: true }}
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    expect(screen.getByText('Reading the referenced Space…')).toBeVisible();
    expect(screen.queryByTestId('space-card-layout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-card-graph')).not.toBeInTheDocument();
    // One note, not a live region: a canvas of Space Cards resolving would
    // otherwise announce each one, for a wait nobody asked for.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('withholds both selectors from a read-only Card', () => {
    render(
      <CanvasCard
        readOnly
        front={{ kind: 'space', open: true, selection: selection() }}
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    expect(screen.queryByTestId('space-card-layout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-card-graph')).not.toBeInTheDocument();
  });
});
