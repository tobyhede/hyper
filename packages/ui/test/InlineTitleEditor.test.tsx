import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InlineTitleEditor } from '../src/InlineTitleEditor';

/** The control under the label, narrowed by what it actually is. */
const titleField = (name = 'Title'): HTMLInputElement | HTMLTextAreaElement => {
  const field = screen.getByRole('textbox', { name });
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) return field;
  throw new Error('The title editor drew neither an input nor a textarea');
};

const noop = (): void => undefined;

/**
 * A Title written on more than one line is a Card's and no other surface's
 * (ADR 0083), so the capability is a prop its mounting surface sets.
 *
 * Both halves are the claim: the multiline field is genuinely a `Textarea` and
 * the other two are genuinely single-line `Input`s. A component that read
 * `variant` for this would pass the first half and fail nothing when a Sidebar
 * row silently gained a second line.
 */
describe('InlineTitleEditor multiline capability', () => {
  it('is a Textarea where it is asked for and an Input everywhere else', () => {
    const { unmount } = render(
      <InlineTitleEditor
        title="Auth"
        label="Title"
        variant="card"
        multiline
        onComplete={() => null}
        onCancel={noop}
        onReturnFocus={noop}
      />,
    );
    expect(titleField()).toBeInstanceOf(HTMLTextAreaElement);
    unmount();

    for (const variant of ['card', 'sidebar', 'header'] as const) {
      const single = render(
        <InlineTitleEditor
          title="Auth"
          label="Title"
          variant={variant}
          onComplete={() => null}
          onCancel={noop}
          onReturnFocus={noop}
        />,
      );
      expect(titleField()).toBeInstanceOf(HTMLInputElement);
      single.unmount();
    }
  });

  /**
   * `rows` is the resting height and `field-sizing: content` grows it, so the
   * field is one line tall with a one-line Title and follows the content from
   * there. jsdom lays nothing out, so what is provable here is that the
   * component asked for that arrangement and fixed no height of its own.
   */
  it('rests at one line and leaves its height to its content', () => {
    render(
      <InlineTitleEditor
        title={'Auth\nThe service, not the screen'}
        label="Title"
        variant="card"
        multiline
        onComplete={() => null}
        onCancel={noop}
        onReturnFocus={noop}
      />,
    );

    const field = titleField();
    expect(field).toHaveAttribute('rows', '1');
    expect(field).toHaveClass('field-sizing-content', 'min-h-0', 'resize-none');
    expect(field.style.height).toBe('');
  });

  it('selects the whole Title on entry, later lines included', () => {
    const title = 'Auth\nThe service, not the screen\nOwned by platform';
    render(
      <InlineTitleEditor
        title={title}
        label="Title"
        variant="card"
        multiline
        onComplete={() => null}
        onCancel={noop}
        onReturnFocus={noop}
      />,
    );

    const field = titleField();
    expect(field).toHaveFocus();
    expect(field).toHaveValue(title);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(title.length);
  });

  /**
   * The one key whose meaning the capability changes.
   *
   * `fireEvent` answers whether the default survived, which is the honest
   * assertion for a line the textarea itself inserts: the component's part is
   * to leave the keystroke alone, and jsdom types nothing.
   */
  it('completes on Enter and leaves Shift+Enter to insert a line', () => {
    const onComplete = vi.fn(() => null);
    const onReturnFocus = vi.fn();
    render(
      <InlineTitleEditor
        title="Auth"
        label="Title"
        variant="card"
        multiline
        onComplete={onComplete}
        onCancel={noop}
        onReturnFocus={onReturnFocus}
      />,
    );
    const field = titleField();

    const shifted = fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    expect(shifted).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onReturnFocus).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: 'Auth\nThe service, not the screen' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith('Auth\nThe service, not the screen');
    expect(onReturnFocus).toHaveBeenCalledOnce();
  });

  /** Enter's meaning on the single-line variants is untouched, `Shift` included. */
  it('completes a single-line field on Enter however Shift was held', () => {
    const onComplete = vi.fn(() => null);
    render(
      <InlineTitleEditor
        title="Layout"
        label="Title"
        variant="sidebar"
        onComplete={onComplete}
        onCancel={noop}
        onReturnFocus={noop}
      />,
    );

    const consumed = fireEvent.keyDown(titleField(), { key: 'Enter', shiftKey: true });
    expect(consumed).toBe(false);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith('Layout');
  });

  /** Escape cancels, blur completes, and a refused draft stays open and focused. */
  it('cancels on Escape, completes on blur and keeps a refused multiline draft', () => {
    const onCancel = vi.fn();
    const onComplete = vi.fn((draft: string) =>
      draft.trim() === '' ? 'A Card title is required.' : null,
    );
    render(
      <InlineTitleEditor
        title="Auth"
        label="Title"
        variant="card"
        multiline
        onComplete={onComplete}
        onCancel={onCancel}
        onReturnFocus={noop}
      />,
    );
    const field = titleField();

    fireEvent.change(field, { target: { value: '\n  \n' } });
    fireEvent.blur(field);
    expect(onComplete).toHaveBeenLastCalledWith('\n  \n');
    expect(screen.getByRole('alert')).toHaveTextContent('A Card title is required.');
    expect(field).toHaveValue('\n  \n');
    expect(field).toHaveFocus();

    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
