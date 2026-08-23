import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import CodeMirror, {
  type ReactCodeMirrorProps,
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
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
    color: 'var(--markdown-source-gutter-color, var(--muted-foreground))',
    border: '0',
    borderRight: '1px solid var(--markdown-source-gutter-rule-color, var(--border))',
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
  '&.cm-focused .cm-content ::selection, .cm-content ::selection': {
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

/**
 * Keys the *surface* owns, withheld from CodeMirror so a Hyper-installed binding
 * cannot answer them first (ADR 0048, ADR 0063).
 *
 * `Escape` is the pane's dismissal; `defaultKeymap` would spend it on
 * `simplifySelection`. `Mod-Enter` is the pane's commit; `defaultKeymap` would spend
 * it on `insertBlankLine` — and because CodeMirror's keymap calls `preventDefault`
 * without `stopPropagation`, the key would edit the document *and* still reach the
 * form, committing a draft that no longer matches what the editor is showing.
 *
 * `Tab` is deliberately absent: `defaultKeymap` binds no Tab at all — it arrives only
 * through `indentWithTab`, which this component sets `false`. Naming it here would be
 * a guard over nothing, which is how the `Mod-Enter` collision stayed hidden.
 */
const PANE_OWNED_KEYS: ReadonlySet<string> = new Set(['Escape', 'Mod-Enter']);

const paneSafeDefaultKeymap = defaultKeymap.filter(
  (binding) =>
    ![binding.key, binding.mac, binding.win, binding.linux].some(
      (bound) => bound !== undefined && PANE_OWNED_KEYS.has(bound),
    ),
);

const markdownBasicSetup = {
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
} satisfies Exclude<ReactCodeMirrorProps['basicSetup'], boolean | undefined>;

const lineNumberMeasure = {};

const markLineNumbers = (view: EditorView): void => {
  view.requestMeasure({
    key: lineNumberMeasure,
    read() {
      return view.dom.querySelector('.cm-lineNumbers');
    },
    write(lineNumbers) {
      lineNumbers?.setAttribute('data-slot', 'markdown-source-line-numbers');
    },
  });
};

const stableLineNumberLocator = ViewPlugin.define((view) => {
  markLineNumbers(view);
  return {
    update(update) {
      if (update.geometryChanged) markLineNumbers(update.view);
    },
  };
});

/**
 * Hyper's Markdown source field. CodeMirror owns text editing; its surrounding
 * product surface owns drafts, focus order, dismissal and completion (ADR 0063).
 *
 * Existing Hyper component considered: `Textarea`, which has no language,
 * gutter or editor-local history behavior. shadcn has no source-editor primitive,
 * so the canonical specialist library is wrapped here rather than exposed to
 * application callers. `PANE_OWNED_KEYS` below states which keys are withheld from
 * it and why; unit and browser tests prove each arrives at the surface unconsumed.
 *
 * Two custom properties are the gutter's whole styling contract —
 * `--markdown-source-gutter-color` and `--markdown-source-gutter-rule-color`, each
 * falling back to the ambient token. A caller sets them on this component and never
 * names a `.cm-*` class: those are CodeMirror's, they are renamed by CodeMirror, and a
 * rule that stops matching one fails by silently reverting rather than by breaking.
 * `test/unit/codemirror-encapsulation.test.ts` holds every stylesheet to that.
 */
export const MarkdownSourceEditor = forwardRef<
  MarkdownSourceEditorHandle,
  MarkdownSourceEditorProps
>(function MarkdownSourceEditor({ value, onValueChange, ariaLabel, className }, ref) {
  const codeMirror = useRef<ReactCodeMirrorRef>(null);
  const latestOnValueChange = useRef(onValueChange);

  useLayoutEffect(() => {
    latestOnValueChange.current = onValueChange;
  }, [onValueChange]);

  const reportValueChange = useCallback((nextValue: string) => {
    latestOnValueChange.current(nextValue);
  }, []);

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
      indentWithTab={false}
      extensions={extensions}
      onChange={reportValueChange}
      basicSetup={markdownBasicSetup}
    />
  );
});
