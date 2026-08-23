import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin } from '@codemirror/view';
import { tags } from '@lezer/highlight';

import { cn } from './lib/utils';
import './markdown-source-editor.css';

export interface MarkdownSourceEditorProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly ariaLabel: string;
  readonly className?: string;
  readonly readOnly?: boolean;
}

export interface MarkdownSourceEditorHandle {
  focus(): void;
  getContentElement(): HTMLElement | null;
}

const markdownSourceTheme = EditorView.theme({
  '&': {
    height: '100%',
    minHeight: '0',
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit',
    lineHeight: '1.65',
  },
  '.cm-content': {
    padding: '1rem 1rem 1.5rem 0.75rem',
    caretColor: 'currentColor',
  },
  '.cm-line': {
    padding: '0',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    border: '0',
    borderRight: '1px solid var(--border)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '3rem',
    padding: '0 0.75rem 0 0.5rem',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--accent)',
  },
});

const markdownSourceHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: [
        tags.heading1,
        tags.heading2,
        tags.heading3,
        tags.heading4,
        tags.heading5,
        tags.heading6,
      ],
      fontWeight: '700',
    },
    { tag: tags.strong, fontWeight: '700' },
    { tag: tags.emphasis, fontStyle: 'italic' },
  ]),
);

const paneSafeDefaultKeymap = defaultKeymap.filter(
  (binding) => binding.key !== 'Escape' && binding.key !== 'Tab' && binding.key !== 'Shift-Tab',
);

const stableLineNumberLocator = ViewPlugin.define((view) => {
  view.requestMeasure({
    read() {
      return undefined;
    },
    write() {
      view.dom
        .querySelector('.cm-lineNumbers')
        ?.setAttribute('data-slot', 'markdown-source-line-numbers');
    },
  });
  return {};
});

/**
 * Hyper's Markdown source field. CodeMirror owns text editing; its surrounding
 * product surface owns drafts, focus order, dismissal and completion (ADR 0063).
 *
 * Existing Hyper component considered: `Textarea`, which has no language,
 * gutter or editor-local history behavior. shadcn has no source-editor primitive,
 * so the canonical specialist library is wrapped here rather than exposed to
 * application callers. Escape and Tab are deliberately omitted from its keymap;
 * browser tests prove those keys remain owned by `CardPane` and its focus trap.
 */
export const MarkdownSourceEditor = forwardRef<
  MarkdownSourceEditorHandle,
  MarkdownSourceEditorProps
>(function MarkdownSourceEditor(
  { value, onValueChange, ariaLabel, className, readOnly = false },
  ref,
) {
  const codeMirror = useRef<ReactCodeMirrorRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        codeMirror.current?.view?.focus();
      },
      getContentElement() {
        return codeMirror.current?.view?.contentDOM ?? null;
      },
    }),
    [],
  );

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      EditorState.tabSize.of(2),
      EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
      keymap.of([...paneSafeDefaultKeymap, ...historyKeymap]),
      markdownSourceTheme,
      markdownSourceHighlighting,
      stableLineNumberLocator,
    ],
    [ariaLabel],
  );

  return (
    <CodeMirror
      ref={codeMirror}
      data-slot="markdown-source-editor"
      className={cn('markdown-source-editor', className)}
      value={value}
      height="100%"
      theme="none"
      readOnly={readOnly}
      indentWithTab={false}
      extensions={extensions}
      onChange={(nextValue) => onValueChange(nextValue)}
      basicSetup={{
        lineNumbers: true,
        syntaxHighlighting: false,
        indentOnInput: false,
        drawSelection: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        foldGutter: false,
        autocompletion: false,
        bracketMatching: false,
        closeBrackets: false,
        highlightSelectionMatches: false,
        defaultKeymap: false,
        historyKeymap: false,
        searchKeymap: false,
        foldKeymap: false,
        completionKeymap: false,
        lintKeymap: false,
      }}
    />
  );
});
