import { createRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { MarkdownSourceEditor, type MarkdownSourceEditorHandle } from '../src/MarkdownSourceEditor';

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

describe('MarkdownSourceEditor', () => {
  it('presents the supplied Markdown through a labelled editable surface', () => {
    const ref = createRef<MarkdownSourceEditorHandle>();

    render(
      <MarkdownSourceEditor
        ref={ref}
        value={'# Heading\n\n  source `bytes`'}
        ariaLabel="Markdown source"
        onValueChange={vi.fn()}
      />,
    );

    const editor = screen.getByRole('textbox', { name: 'Markdown source' });
    expect(editor).toHaveTextContent('# Heading');
    expect(editor).toHaveTextContent('source `bytes`');
    expect(ref.current?.getContentElement()).toBe(editor);
  });

  it('accepts a controlled replacement through the latest callback without replacing its content element', () => {
    const ref = createRef<MarkdownSourceEditorHandle>();
    const firstOnValueChange = vi.fn();
    const latestOnValueChange = vi.fn();
    const { rerender } = render(
      <MarkdownSourceEditor
        ref={ref}
        value="first"
        ariaLabel="Markdown source"
        onValueChange={firstOnValueChange}
      />,
    );
    const content = ref.current?.getContentElement();

    rerender(
      <MarkdownSourceEditor
        ref={ref}
        value={'second\n\n  exact'}
        ariaLabel="Markdown source"
        onValueChange={latestOnValueChange}
      />,
    );

    expect(ref.current?.getContentElement()).toBe(content);
    expect(content).toHaveTextContent('second');
    expect(content?.textContent).toContain('  exact');
    if (content === null || content === undefined)
      throw new Error('Editor content was not mounted');
    content.focus();
    fireEvent.keyDown(content, { key: 'a', ctrlKey: true });
    fireEvent.paste(content, {
      clipboardData: { getData: () => 'latest source' },
    });
    expect(firstOnValueChange).not.toHaveBeenCalled();
    expect(latestOnValueChange).toHaveBeenLastCalledWith('latest source');
  });

  it('focuses the content element through its product handle', () => {
    const ref = createRef<MarkdownSourceEditorHandle>();
    render(
      <MarkdownSourceEditor
        ref={ref}
        value="source"
        ariaLabel="Markdown source"
        onValueChange={vi.fn()}
      />,
    );

    ref.current?.focus();

    expect(ref.current?.getContentElement()).toHaveFocus();
  });

  it('reports source pasted through the editable surface', () => {
    const onValueChange = vi.fn();
    render(
      <MarkdownSourceEditor
        value="source"
        ariaLabel="Markdown source"
        onValueChange={onValueChange}
      />,
    );
    const editor = screen.getByRole('textbox', { name: 'Markdown source' });
    editor.focus();
    fireEvent.keyDown(editor, { key: 'a', ctrlKey: true });
    fireEvent.paste(editor, {
      clipboardData: { getData: () => 'edited `source`' },
    });

    expect(onValueChange).toHaveBeenLastCalledWith('edited `source`');
  });

  /**
   * Reaching the containing surface is not the contract — CodeMirror's keymap calls
   * `preventDefault` without `stopPropagation`, so a consumed key still bubbles and a
   * call count alone passes against the whole unfiltered `defaultKeymap`. What the pane
   * owns is whether the key arrives *unconsumed*, which is `defaultPrevented === false`.
   *
   * `Mod-Enter` is here because `defaultKeymap` binds it to `insertBlankLine`, and it is
   * the key `CardEditorShell` commits on: consuming it edits the document underneath the
   * commit it triggers. Pressed with Control, because CodeMirror reads `Mod` off the
   * user agent and jsdom is not a Mac — the Command half is the browser suites' to prove,
   * where the platform is real and `PRIMARY_MODIFIER` names it.
   */
  it.each([
    { key: 'Escape', press: { key: 'Escape' } },
    { key: 'Tab', press: { key: 'Tab' } },
    { key: 'Mod-Enter', press: { key: 'Enter', ctrlKey: true } },
  ])('leaves $key unconsumed for its containing surface', ({ press }) => {
    const received: ReactKeyboardEvent[] = [];
    const onValueChange = vi.fn();
    render(
      <div onKeyDown={(event) => received.push(event)}>
        <MarkdownSourceEditor
          value={'source'}
          ariaLabel="Markdown source"
          onValueChange={onValueChange}
        />
      </div>,
    );
    const editor = screen.getByRole('textbox', { name: 'Markdown source' });
    editor.focus();

    fireEvent.keyDown(editor, press);

    expect(received).toHaveLength(1);
    expect(received[0]?.defaultPrevented).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(editor).toHaveTextContent('source');
  });
});

describe('MarkdownSourceEditor at rest', () => {
  it('draws the same source with no caret when the surface withholds editing', () => {
    render(
      <MarkdownSourceEditor
        value={'# Heading\n\nbytes'}
        ariaLabel="Markdown source"
        editable={false}
        onValueChange={vi.fn()}
      />,
    );

    const editor = screen.getByRole('textbox', { name: 'Markdown source' });
    expect(editor).toHaveTextContent('# Heading');
    expect(editor).toHaveAttribute('contenteditable', 'false');
  });

  it('takes a caret when editing is restored, without replacing the content element', () => {
    const { rerender } = render(
      <MarkdownSourceEditor
        value="bytes"
        ariaLabel="Markdown source"
        editable={false}
        onValueChange={vi.fn()}
      />,
    );
    const before = screen.getByRole('textbox', { name: 'Markdown source' });

    rerender(
      <MarkdownSourceEditor value="bytes" ariaLabel="Markdown source" onValueChange={vi.fn()} />,
    );

    const after = screen.getByRole('textbox', { name: 'Markdown source' });
    // The same element throughout, which is what lets entering the editor add a
    // caret without moving a word.
    expect(after).toBe(before);
    expect(after).toHaveAttribute('contenteditable', 'true');
  });
});
