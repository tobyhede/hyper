import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
 * A Title written on more than one line is a Resource's and no other surface's
 * (ADR 0083), so the capability is a prop its mounting surface sets.
 *
 * Both halves are the claim: the multiline field is genuinely a `Textarea` and
 * the `header` one is genuinely a single-line `Input`. A component that read
 * `variant` for this would pass the first half and fail nothing when the Dock's
 * name field silently gained a second line.
 */
describe('InlineTitleEditor multiline capability', () => {
  it('is a Textarea where it is asked for and an Input everywhere else', () => {
    const { unmount } = render(
      <InlineTitleEditor
        title="Auth"
        label="Title"
        variant="resource"
        multiline
        onComplete={() => null}
        onCancel={noop}
        onReturnFocus={noop}
      />,
    );
    expect(titleField()).toBeInstanceOf(HTMLTextAreaElement);
    unmount();

    for (const variant of ['resource', 'header', 'edge'] as const) {
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
        variant="resource"
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
        variant="resource"
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
        variant="resource"
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

  /** Enter's meaning on the single-line variant is untouched, `Shift` included. */
  it('completes a single-line field on Enter however Shift was held', () => {
    const onComplete = vi.fn(() => null);
    render(
      <InlineTitleEditor
        title="Map"
        label="Title"
        variant="header"
        onComplete={onComplete}
        onCancel={noop}
        onReturnFocus={noop}
      />,
    );

    const consumed = fireEvent.keyDown(titleField(), { key: 'Enter', shiftKey: true });
    expect(consumed).toBe(false);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith('Map');
  });

  /** Escape cancels, blur completes, and a refused draft stays open and focused. */
  it('cancels on Escape, completes on blur and keeps a refused multiline draft', () => {
    const onCancel = vi.fn();
    const onComplete = vi.fn((draft: string) =>
      draft.trim() === '' ? 'A Resource title is required.' : null,
    );
    render(
      <InlineTitleEditor
        title="Auth"
        label="Title"
        variant="resource"
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
    expect(screen.getByRole('alert')).toHaveTextContent('A Resource title is required.');
    expect(field).toHaveValue('\n  \n');
    expect(field).toHaveFocus();

    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

/** The declarations of the one rule whose selector is exactly `selector`. */
const ruleIn = (stylesheet: string, selector: string): string => {
  // A path, not a URL: jsdom's `URL` is not one `node:fs` recognises.
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../src', stylesheet),
    'utf8',
  );
  const escaped = selector.replaceAll(/[.[\]^$*+?()|{}\\]/gu, '\\$&');
  const found = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'mu').exec(source);
  if (found?.[1] === undefined) throw new Error(`${stylesheet} has no rule for ${selector}`);
  return found[1];
};

/** The value the one declaration of `property` in `declarations` gives it. */
const declared = (declarations: string, property: string): string | undefined =>
  new RegExp(`(?:^|[\\s;])${property}:\\s*([^;]+);`, 'u').exec(declarations)?.[1]?.trim();

describe('InlineTitleEditor edge variant', () => {
  const renderEdge = (onComplete: (title: string) => string | null = () => null) => {
    const onCancel = vi.fn();
    const onReturnFocus = vi.fn();
    render(
      <InlineTitleEditor
        title="depends on"
        label="Edge Title"
        variant="edge"
        onComplete={onComplete}
        onCancel={onCancel}
        onReturnFocus={onReturnFocus}
      />,
    );
    return { field: titleField('Edge Title'), onCancel, onReturnFocus };
  };

  it('is a single-line field drawn by the edge treatment, not the Resource one', () => {
    const { field } = renderEdge();

    expect(field).toBeInstanceOf(HTMLInputElement);
    expect(field).toHaveClass('inline-title-editor__edge-field');
    expect(field).not.toHaveClass('resource__title-input');
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe('depends on'.length);
  });

  it('completes on Enter and cancels on Escape, returning focus each time', () => {
    const onComplete = vi.fn(() => null);
    const { field, onCancel, onReturnFocus } = renderEdge(onComplete);

    fireEvent.change(field, { target: { value: 'blocks' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onComplete).toHaveBeenCalledWith('blocks');
    expect(onReturnFocus).toHaveBeenCalledOnce();

    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onReturnFocus).toHaveBeenCalledTimes(2);
  });

  it('keeps a refused draft open with its reason', () => {
    const { field, onReturnFocus } = renderEdge(() => 'An Edge Title is one line.');

    fireEvent.keyDown(field, { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent('An Edge Title is one line.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(onReturnFocus).not.toHaveBeenCalled();
  });

  it('leaves the reason to a region the surface names, and is described by it', () => {
    const onReturnFocus = vi.fn();
    render(
      <>
        <InlineTitleEditor
          title="depends on"
          label="Edge Title"
          variant="edge"
          errorShownBy="edge-refusal"
          onComplete={() => 'An Edge title must be one line.'}
          onCancel={() => undefined}
          onReturnFocus={onReturnFocus}
        />
        <p id="edge-refusal" role="alert">
          An Edge title must be one line.
        </p>
      </>,
    );
    const field = titleField('Edge Title');

    fireEvent.keyDown(field, { key: 'Enter' });

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', 'edge-refusal');
    expect(field).toHaveAccessibleDescription('An Edge title must be one line.');
    expect(onReturnFocus).not.toHaveBeenCalled();
  });

  /**
   * jsdom lays nothing out, so this reads the stylesheet. The weight is held to
   * the Resource Title's token so the two cannot drift apart.
   */
  it('is drawn with no box, centred, content-sized and in the Resource Title type', () => {
    const field = ruleIn('inline-title-editor.css', '.inline-title-editor__edge-field');
    const token = (name: string): string | undefined => declared(field, `--${name}`);

    expect(declared(field, 'border')).toBe('0');
    expect(declared(field, 'background')).toBe('transparent');
    expect(declared(field, 'box-shadow')).toBe('none');
    expect(declared(field, 'padding')).toBe('0');
    expect(declared(field, 'text-align')).toBe('center');
    expect(declared(field, 'field-sizing')).toBe('content');
    expect(declared(field, 'min-width')).toBe('var(--inline-title-editor-edge-floor)');
    expect(declared(field, 'max-width')).toBe('var(--inline-title-editor-edge-ceiling)');
    expect(token('inline-title-editor-edge-ceiling')).toBe('14rem');
    expect(declared(field, 'font-size')).toBe('var(--inline-title-editor-edge-size)');
    expect(token('inline-title-editor-edge-size')).toBe('12px');
    expect(declared(field, 'color')).toBe('var(--canvas-resource-title-color)');

    const resource = ruleIn('canvas-resource.css', '.canvas-resource');
    expect(declared(field, 'font-weight')).toBe('var(--inline-title-editor-edge-weight)');
    expect(token('inline-title-editor-edge-weight')).toBe(
      declared(resource, '--canvas-resource-title-weight'),
    );
    expect(declared(resource, '--canvas-resource-title')).toBe(
      'var(--canvas-resource-title-color)',
    );
  });
});
