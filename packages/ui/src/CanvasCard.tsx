import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from './Button';
import { CardContentEditProvider, type CardContentEdit } from './card-content-edit';
import { CardRail } from './CardRail';
import { Card, CardContent, CardTitle } from './components/card';
import { AbandonEditIcon, CloseCardIcon, CommitEditIcon, EditIcon, OpenCardIcon } from './icons';
import {
  MarkdownCardBody,
  type MarkdownCardBodyEditor,
  type MarkdownCardBodyProps,
} from './MarkdownCardBody';
import './canvas-card.css';

/**
 * What a Card front draws beyond its shared Title (ADR 0051): a kind-owned
 * choice, not a kind tag plus an optional field every other kind ignores. A
 * Space Card variant is deliberately not modelled here — building one ahead
 * of the domain schema would be a Card front nothing can render.
 */
interface CanvasMarkdownCardFront {
  readonly kind: 'markdown';
  /** The Markdown bytes this Card owns. */
  readonly source: string;
  /** Request that authored state open or close this Card. */
  readonly onOpenChange?: (open: boolean) => 'completed' | 'retained';
  /** Put a caret in this Card's Markdown source. */
  readonly onBeginEdit?: () => void;
}

export type CanvasCardFront =
  | {
      /** A creation ghost: Markdown treatment without authored content or open state. */
      readonly kind: 'preview';
    }
  | (CanvasMarkdownCardFront & {
      /** Closed authored state cannot carry a body editor. */
      readonly open: false;
      readonly editor?: never;
      readonly autoFocusEditor?: never;
    })
  | (CanvasMarkdownCardFront & {
      /** Authored Layout state. CanvasCard renders it; it does not own it. */
      readonly open: true;
      /** Present exactly while the Markdown body holds the canvas caret. */
      readonly editor?: CanvasCardBodyEditor;
      /** Whether a newly supplied body editor takes focus. */
      readonly autoFocusEditor?: boolean;
    })
  | {
      readonly kind: 'alias';
      readonly aliasOf: string;
      /** Open this Alias's metadata editor; Alias Cards do not expand. */
      readonly onOpen?: () => void;
    };

/** The two authored operations that end a live Markdown body edit. */
export type CanvasCardBodyEditor = MarkdownCardBodyEditor;

/** External visual facts the adapter knows and CanvasCard cannot derive:
 *  React Flow selection, drag and inline-title-editing. Hover and the
 *  selected+hover combination are the Card's own CSS, driven by real
 *  pointer/focus pseudo-classes rather than a computed React state. */
export type CanvasCardState = 'rest' | 'selected' | 'dragging' | 'editing';

interface CanvasCardCommonProps {
  readonly front: CanvasCardFront;
  readonly title: string;
  readonly graphColor: string;
  /** Present only when activating the displayed Title may begin a rename. */
  readonly onBeginTitleEdit?: () => void;
}

/**
 * The title editor's operations are supplied together with `state: 'editing'`
 * and nowhere else — there is no separate flag pairing them with an
 * independent "editing enabled" boolean, so a caller cannot ask for the
 * editing state without also supplying what completes, cancels and closes it.
 */
export type CanvasCardProps = CanvasCardCommonProps &
  (
    | { readonly state: Exclude<CanvasCardState, 'editing'> }
    | {
        readonly state: 'editing';
        /** Submit the draft; answers a refusal reason, or `null` when accepted. */
        readonly onCompleteTitleEdit: (title: string) => string | null;
        readonly onCancelTitleEdit: () => void;
        /** Hand focus back to the Card the adapter renders this front inside. */
        readonly onReturnFocus: () => void;
      }
  );

/**
 * The one CSS custom property this Card publishes to `canvas-card.css`.
 *
 * `CSSProperties` does not type CSS custom properties (`--*`), so the style
 * object is *declared* as the intersection it is actually built as rather than
 * asserted into `CSSProperties` after the fact — the fact is true by
 * construction and needs no claim the compiler cannot check (ADR 0062).
 */
type CanvasCardStyle = CSSProperties & { readonly '--canvas-card-graph': string };
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * The one visual Card front shared by the production canvas and its stories.
 *
 * The deep production module for Markdown and Alias Card fronts, title
 * editing, refusal display and interaction-state visual treatment. React Flow
 * geometry, connection state, selection/drag translation and containment stay
 * with the adapter that renders this component (`@project/react-flow-adapter`
 * `CardNode`) — nothing here imports React Flow or reaches into its DOM. Its
 * own visual treatment lives in `canvas-card.css`, colocated with this module.
 */
/**
 * What the rail's Edit control runs, or `undefined` when the Card has no such
 * control to draw.
 *
 * On an open Card it is simply the caret operation the caller supplied. On a
 * **closed** one it is ADR 0064's rule — open the Card, then place the caret
 * — composed from the Card's own two existing operations and nothing else. Opening is not reimplemented or
 * approximated here: `onOpenChange` is the same call the Open control makes, so
 * the growth, the neighbours' displacement and the transition are the ones
 * opening always produces.
 *
 * A closed Card that cannot be opened has no Edit control, because the first
 * half of that pair would be missing and the caret would have nowhere to land.
 */
const contentEditAction = (
  open: boolean,
  onOpenChange: ((open: boolean) => 'completed' | 'retained') | undefined,
  onBeginContentEdit: (() => void) | undefined,
): (() => void) | undefined => {
  if (onBeginContentEdit === undefined) return undefined;
  if (open) return onBeginContentEdit;
  if (onOpenChange === undefined) return undefined;
  return () => {
    if (onOpenChange(true) === 'completed') onBeginContentEdit();
  };
};

export function CanvasCard(props: CanvasCardProps) {
  const { front, title, graphColor, onBeginTitleEdit, state } = props;
  const visualKind = front.kind === 'preview' ? 'markdown' : front.kind;
  const open = front.kind === 'markdown' && front.open;
  const onOpenChange = front.kind === 'markdown' ? front.onOpenChange : undefined;
  const onOpenAlias = front.kind === 'alias' ? front.onOpen : undefined;
  const onBeginContentEdit = front.kind === 'markdown' ? front.onBeginEdit : undefined;
  /**
   * The edit running inside the Markdown front this Card owns.
   *
   * State rather than a second prop because the draft and caret live inside
   * the body. `front.editor` supplies domain completion; the body publishes
   * the Save and Cancel closures for its current draft (`card-content-edit.ts`).
   */
  const [contentEdit, setContentEdit] = useState<CardContentEdit | null>(null);
  const editControl = useRef<HTMLButtonElement>(null);
  const contentEditingWas = useRef(false);
  const beginContentEdit = contentEditAction(open, onOpenChange, onBeginContentEdit);
  const showActions =
    state !== 'dragging' &&
    state !== 'editing' &&
    (contentEdit !== null ||
      onOpenChange !== undefined ||
      onOpenAlias !== undefined ||
      beginContentEdit !== undefined);
  const style: CanvasCardStyle = { '--canvas-card-graph': graphColor };
  const markdownBodyProps: Mutable<Pick<MarkdownCardBodyProps, 'editor' | 'autoFocus'>> = {};
  if (front.kind === 'markdown' && front.editor !== undefined) {
    markdownBodyProps.editor = front.editor;
  }
  if (front.kind === 'markdown' && front.autoFocusEditor !== undefined) {
    markdownBodyProps.autoFocus = front.autoFocusEditor;
  }

  useLayoutEffect(() => {
    if (contentEditingWas.current && contentEdit === null) editControl.current?.focus();
    contentEditingWas.current = contentEdit !== null;
  }, [contentEdit]);

  return (
    <Card
      role="article"
      aria-label={title}
      className="canvas-card"
      data-testid="card"
      data-kind={visualKind}
      data-state={state}
      // Read by `canvas-card.css` for the two things Expanding changes about
      // the Card itself: it fills the box the Layout gave it rather than the
      // closed constant, and its content fills the space above the Title.
      // Derived from the Markdown front's authored state.
      data-expanded={open}
      // The rail is normally revealed with the Card and hidden again at rest.
      // A running edit is not a hover, so the controls that end it are read off
      // this instead — an author writing in the body must be able to see the way
      // out without going looking for it with the pointer.
      data-content-editing={contentEdit !== null}
      style={style}
    >
      <CardRail kind={visualKind} graphColor={graphColor} className="canvas-card__rail">
        {showActions && (
          <div className="canvas-card__actions" data-testid="canvas-card-actions">
            {contentEdit === null ? (
              beginContentEdit !== undefined && (
                <Button
                  ref={editControl}
                  variant="ghost"
                  size="icon"
                  className="card__rail-action nodrag nopan"
                  aria-label={`Edit Card ${title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    beginContentEdit();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <EditIcon data-icon="inline-start" />
                </Button>
              )
            ) : (
              <ContentEditActions title={title} edit={contentEdit} />
            )}
            {onOpenChange !== undefined && (
              <Button
                variant="ghost"
                size="icon"
                className="card__rail-action nodrag nopan"
                aria-label={`${open ? 'Close' : 'Open'} Card ${title}`}
                // Closing mid-edit would drop the Card's box out from under a
                // live caret with a draft in it. The control keeps its slot and
                // goes disabled rather than disappearing: the rail's row does not
                // reshuffle while the author writes, and what is unavailable says
                // so instead of vanishing.
                disabled={contentEdit !== null}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenChange(!open);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {open ? (
                  <CloseCardIcon data-icon="inline-start" />
                ) : (
                  <OpenCardIcon data-icon="inline-start" />
                )}
              </Button>
            )}
            {onOpenAlias !== undefined && (
              <Button
                variant="ghost"
                size="icon"
                className="card__rail-action nodrag nopan"
                aria-label={`Open Card ${title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenAlias();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <OpenCardIcon data-icon="inline-start" />
              </Button>
            )}
          </div>
        )}
      </CardRail>
      <CardContent className="canvas-card__body">
        {state === 'editing' ? (
          <TitleEditor
            title={title}
            onComplete={props.onCompleteTitleEdit}
            onCancel={props.onCancelTitleEdit}
            onReturnFocus={props.onReturnFocus}
          />
        ) : (
          <CardTitle
            className="canvas-card__title"
            data-editable={onBeginTitleEdit !== undefined && contentEdit === null}
            role="heading"
            aria-level={2}
            aria-label={title}
          >
            {onBeginTitleEdit === undefined || contentEdit !== null ? (
              title
            ) : (
              // ADR 0065 composes the shared shadcn/Base Button inside the
              // heading: the primitive owns Enter/Space activation and button
              // semantics, while the wrapper preserves the Title's document
              // relationship and this variant keeps its heading treatment.
              <Button
                variant="ghost"
                className="canvas-card__title-control nodrag nopan"
                aria-label={`Edit Title ${title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onBeginTitleEdit();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {title}
              </Button>
            )}
          </CardTitle>
        )}
        {/* The marker *is* the Target's name, so there is nothing to draw
            without one. An empty line still takes its own top margin and still
            answers a query for the marker, which reads as an Alias naming a
            Card called "". */}
        {front.kind === 'alias' && front.aliasOf !== '' && (
          <p className="canvas-card__alias-of" data-testid="alias-marker">
            {front.aliasOf}
          </p>
        )}
      </CardContent>
      {/* A sibling of the Title's body rather than a child of it. The body is
          inset so a Title sits off the Card's border; a writing surface brings
          its own gutter and padding and has to reach the paper's edges, and
          nesting it would draw one inset inside another. */}
      {front.kind === 'markdown' && front.open && (
        <div className="canvas-card__content">
          <CardContentEditProvider value={setContentEdit}>
            <MarkdownCardBody
              source={front.source}
              ariaLabel={`Markdown source of ${title}`}
              {...markdownBodyProps}
            />
          </CardContentEditProvider>
        </div>
      )}
    </Card>
  );
}

interface ContentEditActionsProps {
  readonly title: string;
  readonly edit: CardContentEdit;
}

/**
 * The two ends of an edit running inside the Card's content, in the rail slot
 * the Edit control had. Close keeps its own slot beside them — it belongs to the
 * Card rather than to the edit, and a Card stays closable while one runs.
 *
 * The same `card__rail-action` icon buttons as everything else on the rail: same
 * box, same border, same paper and ink, same hover inversion. The key each one
 * spends is stated with `aria-keyshortcuts` and drawn by the body's own shortcut
 * hint, which is where a canvas Card names a key.
 *
 * **A press here must not take the caret with it.** These controls sit on the
 * Card's rail and the caret sits in its content, so the pointer press that
 * activates one is also a focus leaving the writing surface — taking the
 * author's selection and the editor's own focus treatment with it, mid-edit and
 * for a control that may well be Cancel. Suppressing the default on `mousedown`
 * keeps the focus where it is, so the edit stays intact right up to the exit the
 * author actually chose.
 */
function ContentEditActions({ title, edit }: ContentEditActionsProps) {
  const hold = (event: { preventDefault: () => void }): void => event.preventDefault();
  const run = (operation: () => void) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    operation();
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="card__rail-action nodrag nopan"
        aria-label={`Save Card ${title}`}
        aria-keyshortcuts="Meta+Enter Control+Enter"
        onClick={run(edit.onSave)}
        onMouseDown={hold}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <CommitEditIcon data-icon="inline-start" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="card__rail-action nodrag nopan"
        aria-label={`Cancel editing Card ${title}`}
        aria-keyshortcuts="Escape"
        onClick={run(edit.onCancel)}
        onMouseDown={hold}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <AbandonEditIcon data-icon="inline-start" />
      </Button>
    </>
  );
}

interface TitleEditorProps {
  readonly title: string;
  readonly onComplete: (title: string) => string | null;
  readonly onCancel: () => void;
  readonly onReturnFocus: () => void;
}

/**
 * The Card's own in-place title editor: initial focus and selection, draft
 * state, refusal display, blur completion, Enter completion and Escape
 * cancellation. Focus return is requested through `onReturnFocus` rather than
 * taken directly — this module has no React Flow selector or DOM ancestry of
 * its own to reach the Card with.
 */
function TitleEditor({ title, onComplete, onCancel, onReturnFocus }: TitleEditorProps) {
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const closingByKey = useRef(false);
  const errorId = useId();

  // Focus on mount whichever control opened this editor, pointer or keyboard.
  // A created Card enters here with its neutral title *selected*, and an
  // unfocused input has no selection an author can type over.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  /**
   * Submit the draft and show whatever came back, answering the refusal so a
   * caller can tell an accepted completion from a refused one — which is the
   * only thing the two exits disagree about.
   */
  const complete = (): string | null => {
    const refusal = onComplete(draft);
    setError(refusal);
    return refusal;
  };

  /**
   * Enter and Escape both leave the editor, and neither may leave focus on
   * `<body>`. Taken *before* the caller unmounts the input: focus moves to a
   * node that is already in the tree, and the unmount that follows has
   * nothing left to displace. That move blurs the input, which is why
   * `closingByKey` is raised first — the blur handler completes the draft,
   * and it must not complete a second time on the way out of a completion,
   * nor at all on the way out of a cancellation.
   *
   * Only the keyboard paths restore. A blur is the author clicking somewhere
   * else, and taking focus back from wherever they clicked would be a steal.
   */
  const returnFocus = (): void => {
    closingByKey.current = true;
    onReturnFocus();
  };

  return (
    <div className="card__title-editor nodrag nopan nowheel">
      <input
        ref={input}
        className="card__title-input"
        aria-label="Card title"
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
        value={draft}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setError(null);
          // Typing says the key exit did not take: the editor is still open and
          // still being edited, so the blur ahead is a real completion rather
          // than the one a focus move would have produced. Cleared here because
          // a caller whose `onReturnFocus` moves no focus fires no blur to
          // clear it, and a raised flag would swallow that completion.
          closingByKey.current = false;
        }}
        onBlur={() => {
          if (closingByKey.current) {
            closingByKey.current = false;
            return;
          }
          complete();
        }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            // A refused draft keeps the editor open, so focus stays in the
            // field with the message beside it rather than leaving for a Card
            // whose name the author has not settled.
            if (complete() === null) returnFocus();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            returnFocus();
            onCancel();
          }
        }}
      />
      {error !== null && (
        <span id={errorId} role="alert" className="card__field-error">
          {error}
        </span>
      )}
    </div>
  );
}
