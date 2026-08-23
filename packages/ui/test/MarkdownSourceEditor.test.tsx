import { createRef } from 'react';
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

  it('accepts a controlled replacement without replacing its content element', () => {
    const ref = createRef<MarkdownSourceEditorHandle>();
    const { rerender } = render(
      <MarkdownSourceEditor
        ref={ref}
        value="first"
        ariaLabel="Markdown source"
        onValueChange={vi.fn()}
      />,
    );
    const content = ref.current?.getContentElement();

    rerender(
      <MarkdownSourceEditor
        ref={ref}
        value={'second\n\n  exact'}
        ariaLabel="Markdown source"
        onValueChange={vi.fn()}
      />,
    );

    expect(ref.current?.getContentElement()).toBe(content);
    expect(content).toHaveTextContent('second');
    expect(content?.textContent).toContain('  exact');
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

  it('keeps read-only source focusable and refuses edits', () => {
    const onValueChange = vi.fn();
    render(
      <MarkdownSourceEditor
        value="source"
        ariaLabel="Markdown source"
        readOnly
        onValueChange={onValueChange}
      />,
    );

    const editor = screen.getByRole('textbox', { name: 'Markdown source' });
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(editor).toHaveAttribute('aria-readonly', 'true');
    editor.focus();
    fireEvent.keyDown(editor, { key: 'a', ctrlKey: true });
    fireEvent.paste(editor, { clipboardData: { getData: () => 'replacement' } });

    expect(onValueChange).not.toHaveBeenCalled();
    expect(editor).toHaveTextContent('source');
  });

  it.each(['Tab', 'Escape'])('leaves %s available to its containing surface', (key) => {
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <MarkdownSourceEditor value="source" ariaLabel="Markdown source" onValueChange={vi.fn()} />
      </div>,
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Markdown source' }), { key });

    expect(onKeyDown).toHaveBeenCalledOnce();
  });
});
