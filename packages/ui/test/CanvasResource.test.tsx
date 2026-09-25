import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CanvasResource,
  type CanvasSpaceResourceSelection,
  type CanvasResourceFront,
} from '../src';

/**
 * Base UI's menus position themselves by measuring, and jsdom ships no pointer
 * capture. The stubs are for the entity-action menus this file opens; the
 * `scrollIntoView` an item-aligned list calls is stubbed globally in
 * `vitest.setup.ts`.
 */
beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

describe('CanvasResource kind and interaction state', () => {
  it('does not expose entity actions when every supplied group is empty', () => {
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false }}
        state="selected"
        title="Empty"
        graphColor="#ffc53d"
        entityActions={[[], []]}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Actions for Resource Empty' }),
    ).not.toBeInTheDocument();
  });

  it('draws a creation preview without authored Markdown or open state', () => {
    render(
      <CanvasResource
        front={{ kind: 'preview' }}
        state="rest"
        title="Resource 2"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.getByRole('article', { name: 'Resource 2' })).toHaveAttribute(
      'data-kind',
      'markdown',
    );
    expect(screen.getByRole('img', { name: 'Markdown Resource' })).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('presents a Markdown front and its resting state', () => {
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: 'Markdown', open: true }}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );

    const resource = screen.getByRole('article', { name: 'Strategies' });
    expect(resource).toHaveAttribute('data-kind', 'markdown');
    expect(resource).toHaveAttribute('data-state', 'rest');
    // Every kind draws its glyph, Markdown included — ResourceKindIcon has no
    // silent-nothing case, and the rail is not the centred, icon-optional
    // map the pre-design-system Resource used.
    expect(screen.queryByRole('img', { name: 'Markdown Resource' })).toBeNull();
  });

  it('presents a Reference Resource front by its kind alone', () => {
    render(
      <CanvasResource
        front={{
          kind: 'reference',
          target: { kind: 'markdown', source: '' },
          open: false,
          onOpenChange: vi.fn(() => 'completed' as const),
        }}
        state="selected"
        title="Opening, again"
        graphColor="#35d6c3"
      />,
    );

    const resource = screen.getByRole('article', { name: 'Opening, again' });
    expect(resource).toHaveAttribute('data-kind', 'reference');
    expect(resource).toHaveAttribute('data-state', 'selected');
    expect(screen.getByRole('img', { name: 'Reference Resource' })).toBeVisible();
  });

  it('offers a Reference Resource the shared Open operation', () => {
    const onOpenChange = vi.fn(() => 'completed' as const);
    render(
      <CanvasResource
        front={{
          kind: 'reference',
          target: { kind: 'markdown', source: 'Markdown' },
          open: false,
          onOpenChange,
        }}
        state="selected"
        title="Return"
        graphColor="#ffc53d"
      />,
    );

    screen.getByRole('button', { name: 'Open Resource Return' }).click();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: 'Close Resource Return' })).not.toBeInTheDocument();
  });

  it('reflects dragging as its own external state, distinct from selected', () => {
    render(
      <CanvasResource
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

describe('CanvasResource Open and Close operation', () => {
  it('owns its read-only state and withholds supplied authoring operations', () => {
    render(
      <CanvasResource
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

    expect(screen.queryByRole('button', { name: /Resource A$/ })).not.toBeInTheDocument();
  });

  it('withdraws an active body editor when the Resource becomes read-only', () => {
    const front: CanvasResourceFront = {
      kind: 'markdown',
      source: 'Draft',
      open: true,
      editor: { onComplete: vi.fn(), onEnd: vi.fn() },
    };
    const { rerender } = render(
      <CanvasResource front={front} state="rest" title="A" graphColor="#ffc53d" />,
    );
    expect(screen.getByRole('button', { name: 'Save Resource A' })).toBeVisible();

    rerender(<CanvasResource readOnly front={front} state="rest" title="A" graphColor="#ffc53d" />);

    expect(screen.queryByRole('button', { name: 'Save Resource A' })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'A' })).toHaveAttribute(
      'data-content-editing',
      'false',
    );
  });

  it('owns the rendered body of an open Markdown front', () => {
    const onOpenChange = vi.fn(() => 'completed' as const);
    render(
      <CanvasResource
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
    screen.getByRole('button', { name: 'Close Resource A' }).click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('offers no action when neither operation is supplied', () => {
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.queryByRole('button', { name: /Resource A$/ })).not.toBeInTheDocument();
  });

  it('names and draws the same working operation for each open state', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false, onOpenChange }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    const open = screen.getByRole('button', { name: 'Open Resource A' });
    expect(open.querySelector('svg')).toHaveClass('lucide-maximize-2');
    open.click();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(
      <CanvasResource
        front={{ kind: 'markdown', source: 'Markdown', open: true, onOpenChange }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );
    const close = screen.getByRole('button', { name: 'Close Resource A' });
    expect(close.querySelector('svg')).toHaveClass('lucide-minimize-2');
    close.click();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('offers Edit before Close whether or not the Resource is open', () => {
    const onBeginContentEdit = vi.fn();
    const onOpenChange = vi.fn(() => 'completed' as const);
    const { rerender } = render(
      <CanvasResource
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
      // The commands, which are the labelled buttons; the kind glyph trails them.
      Array.from(
        screen.getByTestId('canvas-resource-actions').querySelectorAll('button[aria-label]'),
      ).map((button) => button.getAttribute('aria-label'));
    expect(labels()).toEqual(['Edit Resource A', 'Open Resource A']);

    // Collapsed, Edit is the two gestures an author would otherwise make in
    // order, and both are the Resource's own operations — opening is the same call
    // the Open control makes, so nothing about it has a second implementation.
    screen.getByRole('button', { name: 'Edit Resource A' }).click();
    expect(onOpenChange).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(onBeginContentEdit).toHaveBeenCalledOnce();

    rerender(
      <CanvasResource
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

    expect(labels()).toEqual(['Edit Resource A', 'Close Resource A']);
    // Open, it is only the caret: the Resource is already the size it needs to be.
    screen.getByRole('button', { name: 'Edit Resource A' }).click();
    expect(onOpenChange).toHaveBeenCalledOnce();
    expect(onBeginContentEdit).toHaveBeenCalledTimes(2);
  });

  it('withholds Edit from a collapsed Resource that cannot be opened', () => {
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false, onBeginEdit: vi.fn() }}
        state="selected"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    // The first half of the pair is missing, so the caret would have nowhere to
    // land — a control that ran half of what it names is worse than none.
    expect(screen.queryByRole('button', { name: 'Edit Resource A' })).not.toBeInTheDocument();
  });

  it('does not place the content caret when opening a collapsed Resource is retained', () => {
    const onBeginContentEdit = vi.fn();
    render(
      <CanvasResource
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

    screen.getByRole('button', { name: 'Edit Resource A' }).click();

    expect(onBeginContentEdit).not.toHaveBeenCalled();
  });

  it('replaces Edit with the two ends of the edit its content is running, keeping Close', () => {
    const onComplete = vi.fn();
    const onEnd = vi.fn();
    const onBeginContentEdit = vi.fn();
    render(
      <CanvasResource
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

    const actions = screen.getByTestId('canvas-resource-actions');
    // Close belongs to the Resource rather than to the edit, so it keeps its slot
    // and says it is unavailable instead of vanishing — closing mid-edit would
    // drop the Resource's box out from under a live caret holding a draft.
    expect(
      Array.from(actions.querySelectorAll('button')).map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual(['Save Resource A', 'Cancel editing Resource A', 'Close Resource A']);
    // Unavailable through `aria-disabled` rather than the native property, so
    // the control keeps its place in the rail's arrow order (ADR 0073) rather
    // than being drawn and unreachable.
    const close = screen.getByRole('button', { name: 'Close Resource A' });
    expect(close).toHaveAttribute('aria-disabled', 'true');
    expect(close).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Edit Title A' })).not.toBeInTheDocument();
    // The one fact the stylesheet reads to keep the rail up while the caret is
    // in the body, where no hover or focus of the rail's own is true.
    expect(screen.getByRole('article', { name: 'A' })).toHaveAttribute(
      'data-content-editing',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Resource A' }));
    expect(onComplete).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing Resource A' }));
    expect(onEnd).toHaveBeenCalledTimes(2);
    expect(onBeginContentEdit).not.toHaveBeenCalled();
  });

  it('draws those two ends as the rail actions beside them, not as a second kind', () => {
    render(
      <CanvasResource
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

    const actions = screen.getByTestId('canvas-resource-actions');
    const buttons = Array.from(actions.querySelectorAll('button'));
    // One rail, one control treatment. A commit control that carried its own box
    // or its own type would read as a different kind of control to the Close
    // button it sits beside.
    for (const button of buttons) {
      expect(button).toHaveClass('resource__rail-action');
      expect(button.textContent).toBe('');
      expect(button.querySelector('svg')).toHaveAttribute('data-icon');
    }
    // The key each performs is still stated, which is how a control that
    // performs a shortcut announces it (`docs/agents/ui.md`). These two are the
    // repo's worked example of that convention.
    expect(buttons[0]).toHaveAttribute('aria-keyshortcuts', 'Meta+Enter Control+Enter');
    expect(buttons[1]).toHaveAttribute('aria-keyshortcuts', 'Escape');
  });

  it('keeps the caret in the content when one of those two ends is pressed', () => {
    render(
      <CanvasResource
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
    for (const name of ['Save Resource A', 'Cancel editing Resource A']) {
      expect(fireEvent.mouseDown(screen.getByRole('button', { name }))).toBe(false);
    }
  });

  it('hides both actions while the title is being edited', () => {
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false, onOpenChange: () => 'completed' }}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={() => null}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /Resource A$/ })).not.toBeInTheDocument();
  });

  it('hides both actions while dragging', () => {
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false, onOpenChange: () => 'completed' }}
        state="dragging"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    expect(screen.queryByRole('button', { name: /Resource A$/ })).not.toBeInTheDocument();
  });
});

describe('CanvasResource title', () => {
  it('draws a heading, not an editor, when no title-edit operation is supplied', () => {
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
      />,
    );

    const heading = screen.getByRole('heading', { name: 'A' });
    expect(heading.closest('.canvas-resource__title')).toHaveAttribute('data-editable', 'false');
    fireEvent.click(heading);
    expect(screen.queryByRole('textbox', { name: 'Resource title' })).not.toBeInTheDocument();
  });

  it('wraps its heading in the Title’s one-activation control', () => {
    const onBeginTitleEdit = vi.fn();
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false }}
        state="rest"
        title="A"
        graphColor="#ffc53d"
        onBeginTitleEdit={onBeginTitleEdit}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'A' });
    expect(heading.closest('.canvas-resource__title')).toHaveAttribute('data-editable', 'true');
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
   * must not also become the Resource body's selection or Opening gestures.
   */
  it('does not let Title activation reach the Resource around it', () => {
    const onBeginTitleEdit = vi.fn();
    const selectedResource = vi.fn();
    const pressedResource = vi.fn();
    render(
      <div onClick={selectedResource} onKeyDown={pressedResource}>
        <CanvasResource
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
    expect(selectedResource).not.toHaveBeenCalled();
    expect(pressedResource).not.toHaveBeenCalled();
  });
});

/**
 * The Title ladder (ADR 0083). What the DOM has to say is the structure — a
 * block element per Title Line, carrying the role the domain gave it — and the
 * typography that structure hangs off is held by
 * `canvas-resource-title-ladder.test.ts`, because jsdom computes no CSS.
 *
 * The distinction every one of these is protecting: a break the **author typed**
 * starts a rung; a break the **box chose** does not. jsdom cannot wrap text, so
 * the second half is proved where wrapping is real — the Ladle suite's
 * `markdown · long title` specimen, whose long single-line Title must stay one
 * `title`-role element however many visual lines it takes.
 */
describe('CanvasResource Title ladder', () => {
  const ladder = (): readonly { role: string | null; text: string }[] =>
    [...screen.getByRole('heading').querySelectorAll('.canvas-resource__title-line')].map(
      (line) => ({
        role: line.getAttribute('data-role'),
        text: line.textContent,
      }),
    );

  it('draws a Title with no break as one element at the title role', () => {
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false }}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );

    expect(ladder()).toEqual([{ role: 'title', text: 'Strategies' }]);
  });

  /** Line one names the Resource; line two qualifies it; line three and after repeat. */
  it('gives each authored line its role, and every line past the third the last one', () => {
    render(
      <CanvasResource
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
      <CanvasResource
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
   * A Title that changed shape when a Resource opened would teach an author that
   * Opening edits it, so Open and Closed draw the same ladder — and so does
   * every kind, the Resource front being the one surface that draws one at all.
   */
  it('draws the same ladder Open and Closed, on every Resource kind', () => {
    const title = 'Strategies\nNo strategy is privileged\nADR 0014';
    const fronts: readonly CanvasResourceFront[] = [
      { kind: 'preview' },
      { kind: 'markdown', source: '', open: false },
      { kind: 'markdown', source: '', open: true },
      { kind: 'reference', target: { kind: 'markdown', source: '' }, open: false },
      { kind: 'reference', target: { kind: 'markdown', source: '' }, open: true },
      { kind: 'space', open: false },
      { kind: 'space', open: true },
    ];

    for (const front of fronts) {
      const { unmount } = render(
        <CanvasResource front={front} state="rest" title={title} graphColor="#ffc53d" />,
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
   *
   * Its **accessible name** is the Resource's name all the same (ADR 0083): what
   * the control covers and what it is called are different questions, and a
   * screen reader announcing three lines as one control's name is worse than
   * announcing the name and leaving the rest to be read.
   */
  it('puts the whole ladder inside the one Title control', () => {
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false }}
        state="rest"
        title={'Strategies\nNo strategy is privileged\nADR 0014'}
        graphColor="#ffc53d"
        onBeginTitleEdit={() => undefined}
      />,
    );

    const control = screen.getByRole('button', { name: 'Edit Title Strategies' });
    const lines = control.querySelectorAll('.canvas-resource__title-line');
    expect(lines).toHaveLength(3);
    expect(
      screen.getByRole('heading').querySelectorAll('.canvas-resource__title-line'),
    ).toHaveLength(3);
  });

  /**
   * Every **control** on the Resource is named by the Resource's name (ADR 0083), and
   * the heading is named by the Title Lines it draws.
   *
   * Read as one render rather than a case apiece, because the claim is about
   * the set: the Resource, its rail, each command on it and the heading are the
   * whole of what a Title names here, and a label added later that reached for
   * the whole Title would leave every other one saying something different
   * about the same Resource. A screen reader hearing three lines as one control's
   * name is worse than hearing the name and reading the rest.
   */
  it('names the Resource and its every control by the Resource’s name', () => {
    const title = 'Strategies\nNo strategy is privileged\nADR 0014';
    const resource = (open: boolean) => (
      <CanvasResource
        front={{
          kind: 'markdown',
          source: 'Markdown',
          open,
          onOpenChange: () => 'completed' as const,
          onBeginEdit: () => undefined,
        }}
        // Selected, so the Open body offers its edit target to be named.
        state="selected"
        title={title}
        graphColor="#ffc53d"
        onBeginTitleEdit={() => undefined}
        entityActions={[[{ id: 'copy-link', label: 'Copy link', onSelect: () => 'done' as const }]]}
      />
    );

    const { unmount } = render(resource(false));
    for (const name of [
      'Resource Strategies',
      'Edit Resource Strategies',
      'Open Resource Strategies',
      'Actions for Resource Strategies',
      'Edit Title Strategies',
    ]) {
      expect(screen.getAllByLabelText(name), name).not.toHaveLength(0);
    }

    // The heading carries no label of its own, so it is named by the Title
    // Lines it draws and a reader reaches every one of them. The name a browser
    // computes from them is asserted in `ladle-e2e/resource.spec.ts`: jsdom and
    // Chromium join the rungs differently, and only one of them is the truth.
    expect(screen.getByRole('heading')).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('heading').textContent).toBe(
      'StrategiesNo strategy is privilegedADR 0014',
    );
    // And no control took the whole Title on the way to that.
    expect(screen.queryByLabelText(/No strategy is privileged/u)).toBeNull();
    unmount();

    // Opening reveals two more names and changes a third; none of them grows a
    // Title Line either.
    render(resource(true));
    for (const name of ['Close Resource Strategies', 'Edit Markdown source of Strategies']) {
      expect(screen.getAllByLabelText(name), name).not.toHaveLength(0);
    }
  });
});

describe('CanvasResource title editor', () => {
  it('focuses and selects the draft on mount', () => {
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false }}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={() => null}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Resource title' });
    expect(input).toHaveFocus();
    expect(input).toHaveValue('A');
  });

  it('keeps a refused draft field-local and completes a valid one with Enter', () => {
    const onCompleteTitleEdit = vi.fn((title: string) =>
      title.length === 0 ? 'A Resource title is required.' : null,
    );
    const onReturnFocus = vi.fn();
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false }}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={onCompleteTitleEdit}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={onReturnFocus}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Resource title' });

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('A Resource title is required.');
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
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false }}
        state="editing"
        title="A"
        graphColor="#ffc53d"
        onCompleteTitleEdit={() => 'A Resource title is required.'}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Resource title' });

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
        <CanvasResource
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
    const input = screen.getByRole('textbox', { name: 'Resource title' });

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
      <CanvasResource
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
    const input = screen.getByRole('textbox', { name: 'Resource title' });

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
   * The Resource front is the surface that asks for Title Lines (ADR 0083).
   *
   * `InlineTitleEditor.test.tsx` holds the capability itself; what is proved
   * here is that this front opts into it, which is the half a component
   * reading `variant` would not have needed and a Dock's name field must not
   * gain.
   */
  it('writes a Title on more than one line and completes it whole', () => {
    const onCompleteTitleEdit = vi.fn(() => null);
    render(
      <CanvasResource
        front={{ kind: 'markdown', source: '', open: false }}
        state="editing"
        title="Auth"
        graphColor="#ffc53d"
        onCompleteTitleEdit={onCompleteTitleEdit}
        onCancelTitleEdit={() => undefined}
        onReturnFocus={() => undefined}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Resource title' });
    expect(input).toBeInstanceOf(HTMLTextAreaElement);

    // Shift+Enter is the textarea's own line, so the edit is still running.
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onCompleteTitleEdit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Auth\nThe service, not the screen' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCompleteTitleEdit).toHaveBeenCalledWith('Auth\nThe service, not the screen');
  });
});

describe('CanvasResource open Markdown front', () => {
  it('repeats transition durations cyclically when timing the opacity exit', async () => {
    vi.useFakeTimers();
    const computed = document.createElement('div').style;
    computed.transitionProperty = 'color, transform, width, opacity';
    computed.transitionDuration = '10ms, 100ms';
    const style = vi.spyOn(window, 'getComputedStyle').mockReturnValue(computed);
    const { rerender } = render(
      <CanvasResource
        front={{ kind: 'markdown', source: 'Leaving body', open: true }}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );

    rerender(
      <CanvasResource
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
      <CanvasResource
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
      <CanvasResource
        front={{ kind: 'markdown', source: 'the Resource’s own source', open: true }}
        state="rest"
        title="Strategies"
        graphColor="#ffc53d"
      />,
    );

    const resource = screen.getByRole('article', { name: 'Strategies' });
    expect(resource).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByText('the Resource’s own source')).toBeVisible();
  });

  it('draws no body on a closed Reference Resource', () => {
    render(
      <CanvasResource
        front={{ kind: 'reference', target: { kind: 'markdown', source: '' }, open: false }}
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
      <CanvasResource
        front={{ kind: 'markdown', source: 'the Resource’s own source', open: true }}
        state="editing"
        title="Strategies"
        graphColor="#ffc53d"
        onCompleteTitleEdit={() => null}
        onCancelTitleEdit={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    // Expansion is what the Map authored and the caret is a gesture, so the
    // two are independent rather than exclusive (ADR 0064).
    expect(screen.getByRole('textbox', { name: 'Resource title' })).toBeVisible();
    expect(screen.getByText('the Resource’s own source')).toBeVisible();
  });
});

describe('CanvasResource Space front', () => {
  const selection = (
    over: Partial<CanvasSpaceResourceSelection> = {},
  ): CanvasSpaceResourceSelection => ({
    maps: [
      { id: 'l1', title: 'Collection 1' },
      { id: 'l2', title: 'Collection 2' },
    ],
    graphs: [{ id: 'g1', title: 'Long', color: '#1f77b4' }],
    mapId: 'l1',
    graphId: 'g1',
    onMapChange: vi.fn(),
    onGraphChange: vi.fn(),
    ...over,
  });

  const spaceRail = (
    <>
      <button type="button" data-testid="space-resource-map">
        Map 1
      </button>
      <button type="button" data-testid="space-resource-graph">
        Long
      </button>
    </>
  );

  it('inserts a provided spaceRail into the Resource rail', () => {
    render(
      <CanvasResource
        front={{ kind: 'space', open: true, spaceRail }}
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    const rail = screen.getByTestId('canvas-resource-actions');
    expect(screen.getByRole('toolbar')).toContainElement(rail);
    for (const id of ['space-resource-map', 'space-resource-graph']) {
      expect(rail).toContainElement(screen.getByTestId(id));
      expect(screen.getByTestId(id).closest('.canvas-resource__body')).toBeNull();
    }
  });

  it('draws a context notice supplied by decoration', () => {
    render(
      <CanvasResource
        front={{ kind: 'space', open: true, spaceRail }}
        contextNotice="Link copied."
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Link copied.');
  });

  it('keeps focus on the destination when a context rename completes on blur', async () => {
    const onRename = vi.fn(() => null);
    render(
      <>
        <CanvasResource
          front={{
            kind: 'space',
            open: true,
            selection: selection({
              mapCommands: {
                onRename,
                onCreate: () => Promise.resolve(false),
                onDelete: () => Promise.resolve(),
                onCopyLink: () => Promise.resolve(null),
              },
            }),
          }}
          state="selected"
          title="Elsewhere"
          graphColor="#35d6c3"
        />
        <button>Destination</button>
      </>,
    );
    fireEvent.click(screen.getByTestId('space-resource-map'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
      await Promise.resolve();
    });
    const editor = screen.getByRole('textbox', { name: 'Map name' });
    expect(editor).toHaveFocus();
    fireEvent.change(editor, { target: { value: 'New title' } });
    const destination = screen.getByRole('button', { name: 'Destination' });
    act(() => destination.focus());
    expect(onRename).toHaveBeenCalledWith('New title');
    expect(screen.queryByRole('textbox', { name: 'Map name' })).not.toBeInTheDocument();
    expect(destination).toHaveFocus();
  });

  it('releases busy when creating a Map rejects', async () => {
    let rejectCreate: () => void = () => undefined;
    render(
      <CanvasResource
        front={{
          kind: 'space',
          open: true,
          selection: selection({
            mapCommands: {
              onRename: () => null,
              onCreate: () =>
                new Promise<boolean>((_, reject) => {
                  rejectCreate = () => {
                    reject(new Error('persist failed'));
                  };
                }),
              onDelete: () => Promise.resolve(),
              onCopyLink: () => Promise.resolve(null),
            },
          }),
        }}
        state="selected"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );
    fireEvent.click(screen.getByTestId('space-resource-map'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Map' }));
    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await act(async () => {
      rejectCreate();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toBeEnabled();
  });

  it('releases busy when deleting a Map rejects', async () => {
    let rejectDelete: () => void = () => undefined;
    render(
      <CanvasResource
        front={{
          kind: 'space',
          open: true,
          selection: selection({
            mapCommands: {
              onRename: () => null,
              onCreate: () => Promise.resolve(false),
              onDelete: () =>
                new Promise<void>((_, reject) => {
                  rejectDelete = () => {
                    reject(new Error('persist failed'));
                  };
                }),
              onCopyLink: () => Promise.resolve(null),
            },
          }),
        }}
        state="selected"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );
    fireEvent.click(screen.getByTestId('space-resource-map'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Collection 1' }));
    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await act(async () => {
      rejectDelete();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toBeEnabled();
  });

  /**
   * A Closed Space Resource draws neither selector even when the selections are
   * available to it: those are what Opening it is for.
   */
  it('withholds both selectors while closed', () => {
    render(
      <CanvasResource
        front={{ kind: 'space', open: false, selection: selection() }}
        state="rest"
        title="Strategy elsewhere"
        graphColor="#35d6c3"
      />,
    );

    const resource = screen.getByRole('article', { name: 'Strategy elsewhere' });
    expect(resource).toHaveAttribute('data-kind', 'space');
    expect(screen.queryByTestId('space-resource-map')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-resource-graph')).not.toBeInTheDocument();
  });

  /**
   * A Closed Space Resource draws neither selector even when the rail fragment is
   * available to it: those are what Opening it is for, and authoring omits the
   * fragment. CanvasResource still withholds a supplied fragment while closed.
   */
  it('withholds a supplied spaceRail while closed', () => {
    render(
      <CanvasResource
        front={{ kind: 'space', open: false, spaceRail }}
        state="rest"
        title="Strategy elsewhere"
        graphColor="#35d6c3"
      />,
    );

    const resource = screen.getByRole('article', { name: 'Strategy elsewhere' });
    expect(resource).toHaveAttribute('data-kind', 'space');
    expect(screen.queryByTestId('space-resource-map')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-resource-graph')).not.toBeInTheDocument();
  });

  /**
   * Opening is the shared Resource operation, not a Space-Resource-specific one, so it
   * is the same rail control a Reference Resource uses and it names the same two states. A
   * Space Resource has no Markdown of its own, so there is no content Edit, Save or
   * Cancel for the rail to draw unless the portal Read/Edit boundary is composed
   * onto the front — Enter is the kind command that sits beside them.
   */
  it('opens and closes through the shared rail control, and offers no content edit', () => {
    const onOpenChange = vi.fn(() => 'completed' as const);
    const { rerender } = render(
      <CanvasResource
        front={{ kind: 'space', open: false, onOpenChange }}
        state="selected"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    screen.getByRole('button', { name: 'Open Resource Elsewhere' }).click();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(
      screen.queryByRole('button', { name: 'Edit Resource Elsewhere' }),
    ).not.toBeInTheDocument();

    rerender(
      <CanvasResource
        front={{ kind: 'space', open: true, onOpenChange }}
        state="selected"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    screen.getByRole('button', { name: 'Close Resource Elsewhere' }).click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('offers both selectors seeded with the Resource’s own selections when open', () => {
    render(
      <CanvasResource
        front={{ kind: 'space', open: true, selection: selection() }}
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    // Named by the set they choose from as well as by what they hold, not only
    // reachable by test id: the two controls are one word apart and an author
    // has to be able to tell which is which by ear.
    expect(screen.getByRole('button', { name: 'Map: Collection 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Graph: Long' })).toBeEnabled();
    const rail = screen.getByTestId('canvas-resource-actions');
    expect(screen.getByRole('toolbar')).toContainElement(rail);
    for (const id of ['space-resource-map', 'space-resource-graph']) {
      expect(rail).toContainElement(screen.getByTestId(id));
      expect(screen.getByTestId(id).closest('.canvas-resource__body')).toBeNull();
    }
    // And each draws the title it holds, which is what a reader sees.
    expect(screen.getByTestId('space-resource-map')).toHaveTextContent('Collection 1');
    expect(screen.getByTestId('space-resource-graph')).toHaveTextContent('Long');
  });

  /**
   * The Resource publishes the choice and authors nothing itself — the selected
   * Map is the caller's to store and hand back, which is what makes the
   * Graph list beside it the selected Map's rather than a stale one.
   */
  it('publishes a chosen Map without selecting it itself', () => {
    const onMapChange = vi.fn();
    render(
      <CanvasResource
        front={{
          kind: 'space',
          open: true,
          selection: selection({ onMapChange }),
        }}
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    // The shared `ChoiceMenu` the Command Dock's own Map list is: a menu of
    // radio rows, one marked, opened from its trigger. Its keyboard is Base UI's
    // and is not restated here.
    fireEvent.click(screen.getByTestId('space-resource-map'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Collection 2' }));

    expect(onMapChange).toHaveBeenCalledWith('l2');
    expect(screen.getByTestId('space-resource-map')).toHaveTextContent('Collection 1');
  });

  /**
   * The one state that leaves a selector with nothing to say: the Map this
   * Resource names is no longer in the target.
   *
   * A Space Resource selects a Map and a Graph from the moment it exists
   * (ADR 0079), so a `null` here is a dangling reference to something deleted
   * and never a choice that was not made. The Graphs on offer are the selected
   * Map's alone, so a Map resolving to nothing leaves none — while the
   * Map list stays the target's, because choosing another is exactly what
   * answers this.
   */
  it('draws a selection the target no longer holds as unavailable', () => {
    render(
      <CanvasResource
        front={{
          kind: 'space',
          open: true,
          selection: selection({ mapId: null, graphs: [], graphId: null }),
        }}
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    const map = screen.getByTestId('space-resource-map');
    expect(map).toBeEnabled();
    expect(map).toHaveTextContent('No Map');
    const graph = screen.getByTestId('space-resource-graph');
    expect(graph).toHaveAttribute('aria-disabled', 'true');
    expect(graph).toHaveTextContent('No Graph');
  });

  /**
   * An Open Space Resource's kind command is the Read/Edit boundary for the
   * embedded target canvas, not Markdown content edit. Map and Graph stay
   * on the same dock in both modes; Done replaces Edit and Close stays.
   */
  it('offers Edit on the floating dock, and Done once the portal is being edited', () => {
    const onEditingChange = vi.fn();
    const { rerender } = render(
      <CanvasResource
        front={{
          kind: 'space',
          open: true,
          onOpenChange: () => 'completed',
          spaceRail,
          portal: { editing: false, onEditingChange },
        }}
        state="selected"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    expect(screen.getByTestId('space-resource-map')).toBeEnabled();
    expect(screen.getByTestId('space-resource-map')).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('space-resource-graph')).toBeEnabled();
    expect(screen.getByTestId('space-resource-graph')).not.toHaveAttribute('aria-disabled', 'true');
    screen.getByRole('button', { name: 'Edit Resource Elsewhere' }).click();
    expect(onEditingChange).toHaveBeenCalledWith(true);

    rerender(
      <CanvasResource
        front={{
          kind: 'space',
          open: true,
          onOpenChange: () => 'completed',
          spaceRail,
          portal: { editing: true, onEditingChange },
        }}
        state="selected"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Edit Resource Elsewhere' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('space-resource-map')).toBeEnabled();
    expect(screen.getByTestId('space-resource-map')).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Close Resource Elsewhere' })).toBeEnabled();
    screen.getByRole('button', { name: 'Done Resource Elsewhere' }).click();
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });

  it('stands a plain note in for the selectors while the Space is unread', () => {
    render(
      <CanvasResource
        front={{ kind: 'space', open: true }}
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    expect(screen.getByText('Reading the referenced Space…')).toBeVisible();
    expect(screen.queryByTestId('space-resource-map')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-resource-graph')).not.toBeInTheDocument();
    // One note, not a live region: a canvas of Space Resources resolving would
    // otherwise announce each one, for a wait nobody asked for.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('withholds both selectors from a read-only Resource', () => {
    render(
      <CanvasResource
        readOnly
        front={{ kind: 'space', open: true, selection: selection() }}
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    expect(screen.queryByTestId('space-resource-map')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-resource-graph')).not.toBeInTheDocument();
  });

  it('withholds a supplied spaceRail from a read-only Resource', () => {
    render(
      <CanvasResource
        readOnly
        front={{ kind: 'space', open: true, spaceRail }}
        state="rest"
        title="Elsewhere"
        graphColor="#35d6c3"
      />,
    );

    expect(screen.queryByTestId('space-resource-map')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-resource-graph')).not.toBeInTheDocument();
  });

  it('keeps Enter off the rail', () => {
    render(
      <CanvasResource
        front={{ kind: 'space', open: false }}
        state="selected"
        title="Architecture"
        graphColor="#35d6c3"
      />,
    );
    expect(screen.queryByRole('button', { name: /Enter/ })).not.toBeInTheDocument();
  });
});

describe('CanvasResource Open Markdown body', () => {
  /**
   * A click on an unselected Resource selects it, as a click on any React Flow
   * node does; editing its Markdown is the next click, or the Edit command
   * (ADR 0102). So the body offers its edit target only once the Resource is
   * selected, and before that the click reaches the node beneath.
   */
  const openMarkdown = (state: 'rest' | 'selected', onBeginEdit: () => void) => (
    <CanvasResource
      front={{
        kind: 'markdown',
        source: 'Body',
        open: true,
        onOpenChange: () => 'completed' as const,
        onBeginEdit,
      }}
      state={state}
      title="A"
      graphColor="#ffc53d"
    />
  );

  it('offers no edit target on a Resource that is not selected', () => {
    render(openMarkdown('rest', vi.fn()));
    expect(screen.queryByTestId('markdown-resource-body-edit-target')).toBeNull();
  });

  it('begins the edit from the body of a selected Resource', () => {
    const onBeginEdit = vi.fn();
    render(openMarkdown('selected', onBeginEdit));
    fireEvent.click(screen.getByTestId('markdown-resource-body-edit-target'));
    expect(onBeginEdit).toHaveBeenCalledOnce();
  });
});
