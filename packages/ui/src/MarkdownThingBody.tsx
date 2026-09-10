import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Button } from './Button';
import { usePublishThingContentEdit, type ThingContentEdit } from './thing-content-edit';
import { Kbd, KbdGroup } from './components/kbd';
import { RenderedMarkdown } from './ThingContent';
import { MarkdownSourceEditor } from './markdown-source-editor-lazy';
import type { MarkdownSourceEditorHandle } from './MarkdownSourceEditor';
import { cn } from './lib/utils';
import './markdown-thing-body.css';

/**
 * What ends a body edit. Its presence on {@link MarkdownThingBodyProps} *is* the
 * caret, so a caller cannot ask for one without saying what commits it and what
 * takes the caret back — the pairing `CanvasThing` already makes for its own
 * title editor and `ThingNodeData` for the adapter's.
 */
export interface MarkdownThingBodyEditor {
  /**
   * Commit the draft, or retain it when application authoring cannot accept the
   * operation yet. Retaining leaves the editor and caret exactly where they are.
   */
  onComplete: (body: string) => 'completed' | 'retained';
  /**
   * Withdraw the caret. Fires on every completed exit — after `onComplete` when
   * the draft was accepted as well as on an abandon — because what it means is
   * "this edit is over", and the caret has to go back either way. A retained
   * completion is not an exit and therefore does not call this.
   *
   * Deliberately not `onCancel`, which is what `ThingTitleEditor` calls the
   * Escape-only half of its own pair. A caller reading that name here would
   * give this the abandon meaning — revert the body, drop the draft — and then
   * undo every successful commit, because this fires after those too.
   */
  onEnd: () => void;
}

export interface MarkdownThingBodyProps {
  /** The Markdown this Thing owns, as bytes. */
  readonly source: string;
  /** Names the writing surface for a screen reader, e.g. the Thing's title. */
  readonly ariaLabel: string;
  /** Activates source editing from a pointer press on the rendered body. */
  readonly onBeginEdit?: () => void;
  /** The live edit, absent when the source is at rest. */
  readonly editor?: MarkdownThingBodyEditor;
  /** Whether a newly supplied editor takes the caret. Defaults to the product path. */
  readonly autoFocus?: boolean;
  readonly className?: string;
}

/**
 * The Markdown kind's Expanded front: rendered Markdown, on the Thing (ADR 0064).
 *
 * **The same rendering as presentation mode.** At rest this reuses
 * `RenderedMarkdown`, the parser and sanitiser beneath `ThingContent`; an
 * Expanded Thing therefore cannot interpret the same Markdown differently from
 * the Thing reached during traversal. It omits only presentation mode's title
 * and frame, which the surrounding `CanvasThing` already owns.
 *
 * At rest the rendered body remains pointer-activatable through a fully
 * transparent sibling Button. It draws no icon, hover treatment or visible
 * command; the surrounding Thing rail owns the only visible Edit action. While
 * editing, the display is replaced by `MarkdownSourceEditor`.
 *
 * **The keys this surface spends are the two the editor withholds from
 * CodeMirror** (ADR 0063, `PANE_OWNED_KEYS`): `Escape` abandons the draft and
 * `Mod-Enter` commits it.
 *
 * **A focus that leaves does not end the edit** (ADR 0064). Those two keys and
 * the two controls that pair with them are the whole of how an edit ends —
 * nothing a pointer does elsewhere on the canvas decides for the author what
 * happens to their draft. It is the one place this surface departs from the
 * Thing's title editor, which does complete on blur: a title is one refusable
 * line and a body is a document, and losing a document to a stray click is not
 * a cost worth paying for the convenience of not saying so.
 *
 * Those same two exits are published to the surrounding Thing through
 * `ThingContentEdit`, which draws them on its rail in place of the control that
 * began this edit. They are published rather than drawn here because the rail is
 * the Thing's — this surface reaches the paper's edges and has no corner of its
 * own that is not the author's text. The hint below names the keys; the rail
 * names the same two exits as controls, and each is drawn where it belongs.
 *
 * Two React Flow escape-hatch classes are applied while the caret is in, and
 * each answers a different pointer collision: `nodrag` stops a text selection
 * dragging the Thing out from under the caret, and `nopan` stops a click-drag
 * panning the canvas. The CodeMirror target is itself contenteditable, which is
 * the node-keyboard subscription's native exclusion; it needs no `.nokey`
 * marker. `nowheel` is deliberately absent — the wheel belongs to the canvas
 * everywhere (ADR 0064). These are class-name strings and not an import;
 * nothing here knows React Flow exists, exactly as `canvas-thing.css` does not.
 */
export function MarkdownThingBody({
  source,
  ariaLabel,
  onBeginEdit,
  editor,
  autoFocus = true,
  className,
}: MarkdownThingBodyProps) {
  const editing = editor !== undefined;
  const [draft, setDraft] = useState(source);
  const handle = useRef<MarkdownSourceEditorHandle | null>(null);
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

  // Each edit starts from what the Thing currently holds. Adjusted during render
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

  /**
   * The two exits, as operations the surrounding Thing can draw.
   *
   * Built once and never rebuilt, so the Thing is not re-rendered on every
   * keystroke: each reads the current {@link leave} through a ref rather than
   * closing over the draft. The ref is refreshed in an effect rather than during
   * render, which is what keeps this safe to build once.
   */
  const leaveLatest = useRef<(commit: boolean) => void>(() => undefined);
  const publish = usePublishThingContentEdit();
  const exits = useMemo<ThingContentEdit>(
    () => ({
      onSave: () => leaveLatest.current(true),
      onCancel: () => leaveLatest.current(false),
    }),
    [],
  );

  const receiveEditor = useCallback((next: MarkdownSourceEditorHandle | null) => {
    handle.current = next;
    if (next !== null && wantsCaret.current) {
      wantsCaret.current = false;
      next.focus();
    }
  }, []);

  useEffect(() => {
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
    // A committed draft *is* the source the caller is about to hand back, so the
    // document already agrees with it and there is nothing to rebuild.
    //
    // Abandoning rebuilds, and the rebuilt editor is handed `draft` — so the
    // draft has to go back to the source in the same breath. Bumping the key
    // alone remounts the editor onto the very text just abandoned, which is the
    // thing this is here to prevent. Both are needed because a caller may keep
    // the editor mounted across its own `onEnd`; a caller that withdraws it
    // synchronously never sees either.
    //
    // The two arms are separate rather than one condition and an `else`: a
    // refused commit leaves without ending, and an accepted one must not fall
    // into the rebuild the sentence above says it has no use for.
    if (commit) {
      if (editor.onComplete(draft) === 'retained') return;
    } else {
      setDraft(source);
      setGeneration((current) => current + 1);
    }
    editor.onEnd();
  };

  useLayoutEffect(() => {
    leaveLatest.current = leave;
  });

  // Published only while a caret is in, and withdrawn on the way out — the
  // Thing's rail reads the presence of an edit from the same fact this surface
  // reads it from, so the two cannot disagree about whether one is running.
  useLayoutEffect(() => {
    if (publish === null || !editing) return undefined;
    publish(exits);
    return () => publish(null);
  }, [editing, exits, publish]);

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

  return (
    <div
      className={cn(
        'markdown-thing-body',
        editing && 'markdown-thing-body--editing nodrag nopan',
        className,
      )}
      onKeyDown={onKeyDown}
    >
      {editing ? (
        <>
          <Suspense fallback={<div className="markdown-thing-body__pending" aria-hidden="true" />}>
            <MarkdownSourceEditor
              key={generation}
              ref={receiveEditor}
              className="markdown-thing-body__source"
              value={draft}
              ariaLabel={ariaLabel}
              onValueChange={setDraft}
            />
          </Suspense>
          {/* `Kbd`'s **default** variant, which draws a key as a key: a filled,
              bordered cap. That is the treatment every application that names a
              shortcut inline uses, and it is what makes this legible — a cap is
              read as an object at a glance, where set-back inline glyphs are
              read as more prose and have to be parsed. The `compact` variant
              this used before exists for running text and was the wrong one
              here. Each cap sits with the word it belongs to; the two pairs are
              set apart at a wider gap; the chord is written with the `+` that
              names it, and `Kbd` supplies the platform's own modifier. */}
          <div className="markdown-thing-body__shortcut-hint" aria-hidden="true">
            <span className="markdown-thing-body__shortcut">
              <KbdGroup className="markdown-thing-body__shortcut-keys">
                <Kbd keyName="modifier" />+<Kbd>&#8629;</Kbd>
              </KbdGroup>
              Save
            </span>
            <span className="markdown-thing-body__shortcut">
              <KbdGroup className="markdown-thing-body__shortcut-keys">
                <Kbd>Esc</Kbd>
              </KbdGroup>
              Cancel
            </span>
          </div>
        </>
      ) : (
        <>
          <RenderedMarkdown
            markdown={source}
            className="markdown-thing-body__rendered thing__body"
          />
          {onBeginEdit !== undefined && (
            <Button
              variant="ghost"
              className="markdown-thing-body__edit-target"
              data-testid="markdown-thing-body-edit-target"
              aria-label={`Edit ${ariaLabel}`}
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                onBeginEdit();
              }}
              onKeyDown={(event) => event.stopPropagation()}
            />
          )}
        </>
      )}
    </div>
  );
}
