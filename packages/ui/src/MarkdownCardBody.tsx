import { Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from './Button';
import { Kbd, KbdGroup } from './components/kbd';
import { RenderedMarkdown } from './CardContent';
import { MarkdownSourceEditor } from './markdown-source-editor-lazy';
import type { MarkdownSourceEditorHandle } from './MarkdownSourceEditor';
import { cn } from './lib/utils';
import './markdown-card-body.css';

/**
 * What ends a body edit. Its presence on {@link MarkdownCardBodyProps} *is* the
 * caret, so a caller cannot ask for one without saying what commits it and what
 * takes the caret back — the pairing `CanvasCard` already makes for its own
 * title editor and `CardNodeData` for the adapter's.
 */
export interface MarkdownCardBodyEditor {
  /** Commit the draft. Unlike a title's, a body has nothing to refuse. */
  onComplete: (body: string) => void;
  /**
   * Withdraw the caret. Fires on **every** exit — after `onComplete` on the two
   * committing paths as well as on `Escape` — because what it means is "this
   * edit is over", and the caret has to go back either way.
   *
   * Deliberately not `onCancel`, which is what `CardTitleEditor` calls the
   * Escape-only half of its own pair. A caller reading that name here would
   * give this the abandon meaning — revert the body, drop the draft — and then
   * undo every successful commit, because this fires after those too.
   */
  onEnd: () => void;
}

export interface MarkdownCardBodyProps {
  /** The Markdown this Card owns, as bytes. */
  readonly source: string;
  /** Names the writing surface for a screen reader, e.g. the Card's title. */
  readonly ariaLabel: string;
  /** Present only when activating the rendered Markdown may put a caret in its source. */
  readonly onBeginEdit?: () => void;
  /** The live edit, absent when the source is at rest. */
  readonly editor?: MarkdownCardBodyEditor;
  /** Whether a newly supplied editor takes the caret. Defaults to the product path. */
  readonly autoFocus?: boolean;
  readonly className?: string;
}

interface MarkdownEditControlProps {
  readonly ariaLabel: string;
  readonly onBeginEdit: () => void;
}

/** The rendered Markdown's full-surface edit target. */
function MarkdownEditControl({ ariaLabel, onBeginEdit }: MarkdownEditControlProps) {
  return (
    <Button
      variant="ghost"
      className="markdown-card-body__edit-control"
      aria-label={`Edit ${ariaLabel}`}
      onClick={(event) => {
        event.stopPropagation();
        onBeginEdit();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    />
  );
}

/**
 * The Markdown kind's Expanded front: rendered Markdown, on the Card (ADR 0064).
 *
 * **The same rendering as presentation mode.** At rest this reuses
 * `RenderedMarkdown`, the parser and sanitiser beneath `CardContent`; an
 * Expanded Card therefore cannot interpret the same Markdown differently from
 * the Card reached during traversal. It omits only presentation mode's title
 * and frame, which the surrounding `CanvasCard` already owns.
 *
 * At rest this surface is semantic rendered content beneath a transparent
 * click-to-edit target; the surrounding Card rail supplies the only visible
 * Edit icon. Both begin the same edit. While editing, the display is replaced
 * by `MarkdownSourceEditor`.
 *
 * **The keys this surface spends are the two the editor withholds from
 * CodeMirror** (ADR 0063, `PANE_OWNED_KEYS`): `Escape` abandons the draft and
 * `Mod-Enter` commits it. A focus that leaves commits too, which is the rule the
 * Card's title editor already follows — a Card on a canvas has no `Done` button
 * to be the only way out.
 *
 * Three React Flow escape-hatch classes are applied while the caret is in, and
 * each answers a different collision: `nodrag` stops a text selection dragging
 * the Card out from under the caret, `nopan` stops a click-drag panning the
 * canvas, `nokey` stops the arrow keys moving the Card instead of the caret. The
 * fourth, `nowheel`, is deliberately absent — the wheel belongs to the canvas
 * everywhere (ADR 0064). They are class-name strings and not an import; nothing
 * here knows React Flow exists, exactly as `canvas-card.css` does not.
 */
export function MarkdownCardBody({
  source,
  ariaLabel,
  onBeginEdit,
  editor,
  autoFocus = true,
  className,
}: MarkdownCardBodyProps) {
  const editing = editor !== undefined;
  const [draft, setDraft] = useState(source);
  const handle = useRef<MarkdownSourceEditorHandle | null>(null);
  const closing = useRef(false);
  /**
   * Bumped when a draft is abandoned, to rebuild the editor from the source.
   *
   * Abandoning has to discard the *document*, and handing the `value` prop back
   * is not enough to do it: the CodeMirror wrapper defers an external value
   * change behind a typing latch so a value arriving mid-keystroke cannot yank
   * the caret, and an abandoned draft therefore sits on screen until that latch
   * expires — a revert on a timer, which is no revert at all. Remounting is
   * exact and costs nothing visible, because what it draws is the text that was
   * already there before the edit.
   */
  const [generation, setGeneration] = useState(0);

  // Each edit starts from what the Card currently holds. Adjusted during render
  // rather than in an effect — React's documented way to reset state on a
  // changed input, and it means the first frame of an edit already shows the
  // draft rather than showing the old source and correcting it.
  const [editingWas, setEditingWas] = useState(editing);
  if (editingWas !== editing) {
    setEditingWas(editing);
    if (editing) setDraft(source);
  }

  /**
   * Whether an edit has begun and the caret has not been placed yet.
   *
   * The editor may still be arriving behind `lazy` on the first Expansion of a
   * Space, so the request outlives the render that made it: the effect below
   * takes it when the handle is already there, and {@link receiveEditor} takes
   * it when the handle arrives afterwards. Waiting for the editor to become
   * *editable* is `MarkdownSourceEditor.focus`'s own business.
   */
  const wantsCaret = useRef(false);

  const receiveEditor = useCallback((next: MarkdownSourceEditorHandle | null) => {
    handle.current = next;
    if (next !== null && wantsCaret.current) {
      wantsCaret.current = false;
      next.focus();
    }
  }, []);

  useEffect(() => {
    // A fresh edit is not on its way out, and that is true of *every* fresh
    // edit — not only one that takes the caret. Cleared above the `autoFocus`
    // guard because the flag says what this exit is doing, so an edit that
    // inherits the previous one's flag finds its own blur already spoken for
    // and commits nothing. Cleared here rather than in the render that begins
    // an edit: a ref is not render state, and no blur can arrive before this
    // runs, since the author has not been given the caret yet.
    if (editing) closing.current = false;
    if (!editing || !autoFocus) {
      wantsCaret.current = false;
      return;
    }
    if (handle.current === null) {
      wantsCaret.current = true;
      return;
    }
    handle.current.focus();
  }, [autoFocus, editing]);

  const leave = (commit: boolean): void => {
    if (editor === undefined) return;
    closing.current = true;
    if (commit) editor.onComplete(draft);
    // A committed draft *is* the source the caller is about to hand back, so the
    // document already agrees with it and there is nothing to rebuild.
    //
    // Abandoning rebuilds, and the rebuilt editor is handed `draft` — so the
    // draft has to go back to the source in the same breath. Bumping the key
    // alone remounts the editor onto the very text just abandoned, which is the
    // thing this is here to prevent. Both are needed because a caller may keep
    // the editor mounted across its own `onEnd`; a caller that withdraws it
    // synchronously never sees either.
    else {
      setDraft(source);
      setGeneration((current) => current + 1);
    }
    editor.onEnd();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!editing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      leave(false);
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      leave(true);
    }
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    // `focusout` bubbles, so this fires for moves *inside* the editor too — only
    // a focus that has left the surface is the author leaving it. A key exit has
    // already committed or abandoned by the time its own focus move arrives.
    if (!editing || closing.current) return;
    if (event.currentTarget.contains(event.relatedTarget)) return;
    leave(true);
  };

  return (
    <div
      className={cn(
        'markdown-card-body',
        editing && 'markdown-card-body--editing nodrag nopan nokey',
        className,
      )}
      data-editable={onBeginEdit !== undefined}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {editing ? (
        <>
          <Suspense fallback={<div className="markdown-card-body__pending" aria-hidden="true" />}>
            <MarkdownSourceEditor
              key={generation}
              ref={receiveEditor}
              className="markdown-card-body__source"
              value={draft}
              ariaLabel={ariaLabel}
              editable
              onValueChange={setDraft}
            />
          </Suspense>
          <div className="markdown-card-body__shortcut-hint" aria-hidden="true">
            <KbdGroup className="markdown-card-body__shortcut-keys">
              <Kbd keyName="modifier" variant="compact" />
              <Kbd variant="compact">↵</Kbd>
            </KbdGroup>{' '}
            Save · <Kbd variant="compact">Esc</Kbd> Cancel
          </div>
        </>
      ) : (
        <>
          <RenderedMarkdown markdown={source} className="markdown-card-body__rendered card__body" />
          {onBeginEdit !== undefined && (
            <MarkdownEditControl ariaLabel={ariaLabel} onBeginEdit={onBeginEdit} />
          )}
        </>
      )}
    </div>
  );
}
