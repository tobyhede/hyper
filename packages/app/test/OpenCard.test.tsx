import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { OpenCard } from '../src/components/OpenCard';

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');

const markdown = (over: { description?: string; body?: string } = {}) => ({
  id: CARD_ID,
  title: 'A',
  ...(over.description === undefined ? {} : { description: over.description }),
  kind: 'markdown' as const,
  body: over.body ?? '**A** source',
});

describe('the opened Card', () => {
  it('edits resolved Markdown through an Alias while keeping the delegation visible', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        opened={{ id: ALIAS_ID, title: 'A again', kind: 'alias', target: CARD_ID }}
        content={markdown({ description: 'Shared caption' })}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Opened through A again')).toBeVisible();
    expect(screen.getByText('Editing content on A')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue('Shared caption');
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('**A** source');
    expect(screen.queryByLabelText(/target/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/kind/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'Shared source rewritten' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'A',
      description: 'Shared caption',
      kind: 'markdown',
      body: 'Shared source rewritten',
    });
  });

  /**
   * There was a reading state in front of this, and it drew the same bytes in
   * the same order — a `<pre>` of source against a `<textarea>` of source. The
   * action that crossed between them was the only thing the boundary had.
   */
  it('is editable on arrival, with no action to begin editing', () => {
    render(
      <OpenCard
        opened={markdown({ description: 'Where every route begins' })}
        content={markdown({ description: 'Where every route begins' })}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('A');
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
      'Where every route begins',
    );
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('**A** source');
    expect(screen.queryByRole('button', { name: /^Edit Card/ })).not.toBeInTheDocument();
  });

  it('opens with the title focused, which is what an author names first', () => {
    render(
      <OpenCard opened={markdown()} content={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
  });

  /**
   * The draft is seeded from `content` once and then owned by the editor, so the
   * two must not come apart: handed a different Card, the editor has to be a
   * different editor. Reusing one carried the first Card's text onto the second
   * under the second's id, and completing wrote it there.
   *
   * `App` also declines to open a second Card while one is open, which is the
   * only way this was reachable. Pinned here anyway — the rule is the editor's,
   * and a component that only holds while its caller guards it is one refactor
   * from silently corrupting a Card.
   */
  it('never shows one Card’s draft under another Card’s identity', () => {
    const other = {
      id: uuidSchema.parse('00000000-0000-4000-8000-000000000003'),
      title: 'B',
      kind: 'markdown' as const,
      body: '**B** source',
    };
    const view = render(
      <OpenCard opened={markdown()} content={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'A rewritten' },
    });

    view.rerender(
      <OpenCard opened={other} content={other} onComplete={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('B');
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('**B** source');
  });

  it('completes one whole Card from all three fields', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    render(
      <OpenCard
        opened={markdown()}
        content={markdown()}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Renamed A' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'A caption' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'New body' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'Renamed A',
      description: 'A caption',
      kind: 'markdown',
      body: 'New body',
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  /**
   * `min(1)` counts characters and a space is one, so the schema alone accepts a
   * title that draws as nothing — the same reason the graph's inline editor
   * trims. The body is not trimmed: whitespace there is Markdown.
   */
  it('refuses a blank title and keeps it local', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        opened={markdown()}
        content={markdown()}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );
    const title = screen.getByRole('textbox', { name: 'Title' });

    fireEvent.change(title, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('alert')).toHaveTextContent('A Card title is required.');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('A Card title is required.');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('stores a title and description without the whitespace around them', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        opened={markdown({ body: ' spaced body ' })}
        content={markdown({ body: ' spaced body ' })}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: '  Renamed A  ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: '  A caption  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'Renamed A',
      description: 'A caption',
      kind: 'markdown',
      body: ' spaced body ',
    });
  });

  it('removes a description the author blanked', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        opened={markdown({ description: 'Original' })}
        content={markdown({ description: 'Original' })}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onComplete).toHaveBeenCalledWith({
      id: CARD_ID,
      title: 'A',
      kind: 'markdown',
      body: '**A** source',
    });
  });

  it('links a description error to its field and completes once it is valid', () => {
    const onComplete = vi.fn();
    render(
      <OpenCard
        opened={markdown()}
        content={markdown()}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );
    const description = screen.getByRole('textbox', { name: 'Description' });

    fireEvent.change(description, { target: { value: 'x'.repeat(121) } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(description).toHaveAccessibleDescription(/at most 120/i);
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.change(description, { target: { value: 'Fits' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('cancels without completing', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    render(
      <OpenCard
        opened={markdown()}
        content={markdown()}
        onComplete={onComplete}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), {
      target: { value: 'abandoned' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('cancels on Escape without letting it reach the window', () => {
    const onCancel = vi.fn();
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    render(
      <OpenCard
        opened={markdown()}
        content={markdown()}
        onComplete={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Markdown source' }), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(outside).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outside);
  });
});

/**
 * The pane covers the graph and is the one surface for a Card's content (ADR
 * 0037), so it has to say so. It was a bare `<div>`: no role, no name, and
 * nothing stopping `Tab` walking out of it into the Card nodes still behind it —
 * which announce "Press enter or space to open a Card" and, until `App` declined
 * it, did exactly that to the Card being typed into.
 */
describe('the opened Card as a dialog', () => {
  it('is a modal dialog named for the Card it authors', () => {
    render(<OpenCard content={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('A');
  });

  it('keeps Tab inside itself, wrapping from the last control to the first', () => {
    render(<OpenCard content={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />);
    const title = screen.getByRole('textbox', { name: 'Title' });
    const done = screen.getByRole('button', { name: 'Done' });

    done.focus();
    fireEvent.keyDown(done, { key: 'Tab' });
    expect(title).toHaveFocus();

    fireEvent.keyDown(title, { key: 'Tab', shiftKey: true });
    expect(done).toHaveFocus();
  });

  /**
   * Taking focus is the pane's own job; giving it back is not, and this asserts
   * only the half that belongs here.
   *
   * An earlier version restored focus on unmount to whatever was active when it
   * mounted, and a test like this one passed — with a synthetic opener that
   * stays in the document. The real opener does not: opening a Card withdraws
   * every Card affordance, so the control is detached long before the pane
   * closes. `App` returns focus to the Card instead, proven in `editing.spec`
   * against a browser that actually moves it.
   */
  it('takes focus onto its first field when it opens', () => {
    render(<OpenCard content={markdown()} onComplete={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
  });
});
