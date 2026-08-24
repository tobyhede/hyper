import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasCard } from '../src';

describe('CanvasCard kind and interaction state', () => {
  it('presents a Markdown front and its resting state', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown' }}
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

  it('reflects dragging as its own external state, distinct from selected', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown' }}
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

describe('CanvasCard Connect and Edit operations', () => {
  it('offers no action when neither operation is supplied', () => {
    render(
      <CanvasCard front={{ kind: 'markdown' }} state="selected" title="A" graphColor="#ffc53d" />,
    );

    expect(screen.queryByRole('button', { name: /^Connect from/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit Card/ })).not.toBeInTheDocument();
  });

  it('offers exactly the operation supplied, with no separate enabled flag', () => {
    const onConnect = vi.fn();
    render(
      <CanvasCard
        front={{ kind: 'markdown' }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
        onConnect={onConnect}
      />,
    );

    screen.getByRole('button', { name: 'Connect from A' }).click();
    expect(onConnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /^Edit Card/ })).not.toBeInTheDocument();
  });

  it('hides both actions while the title is being edited', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown' }}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onConnect={() => undefined}
        onEdit={() => undefined}
        onCompleteTitleEdit={() => null}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /^Connect from/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit Card/ })).not.toBeInTheDocument();
  });

  it('hides both actions while dragging', () => {
    render(
      <CanvasCard
        front={{ kind: 'markdown' }}
        state="dragging"
        title="A"
        graphColor="#ffc53d"
        onConnect={() => undefined}
        onEdit={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /^Connect from/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit Card/ })).not.toBeInTheDocument();
  });
});

describe('CanvasCard title', () => {
  it('draws a heading, not an editor, when no title-edit operation is supplied', () => {
    render(<CanvasCard front={{ kind: 'markdown' }} state="rest" title="A" graphColor="#ffc53d" />);

    const heading = screen.getByRole('heading', { name: 'A' });
    expect(heading).toHaveAttribute('data-editable', 'false');
    fireEvent.click(heading);
    expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument();
  });

  it('exposes the editable Title as a named control inside its heading', () => {
    const onBeginTitleEdit = vi.fn();
    render(
      <CanvasCard
        front={{ kind: 'markdown' }}
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
          front={{ kind: 'markdown' }}
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
        front={{ kind: 'markdown' }}
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
        front={{ kind: 'markdown' }}
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
          front={{ kind: 'markdown' }}
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
        front={{ kind: 'markdown' }}
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
