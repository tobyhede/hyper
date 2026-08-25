import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Button } from './Button';
import { CardContentEditProvider, type CardContentEdit } from './card-content-edit';
import { CardRail } from './CardRail';
import { Card, CardContent, CardTitle } from './components/card';
import { AbandonEditIcon, CloseCardIcon, CommitEditIcon, EditIcon, OpenCardIcon } from './icons';
import './canvas-card.css';

/**
 * What a Card front draws beyond its shared Title (ADR 0051): a kind-owned
 * choice, not a kind tag plus an optional field every other kind ignores. A
 * Space Card variant is deliberately not modelled here — building one ahead
 * of the domain schema would be a Card front nothing can render.
 */
export type CanvasCardFront =
  { readonly kind: 'markdown' } | { readonly kind: 'alias'; readonly aliasOf: string };

/** External visual facts the adapter knows and CanvasCard cannot derive:
 *  React Flow selection, drag and inline-title-editing. Hover and the
 *  selected+hover combination are the Card's own CSS, driven by real
 *  pointer/focus pseudo-classes rather than a computed React state. */
export type CanvasCardState = 'rest' | 'selected' | 'dragging' | 'editing';

interface CanvasCardCommonProps {
  readonly front: CanvasCardFront;
  readonly title: string;
  readonly graphColor: string;
  /**
   * What this Card draws below its Title, present exactly when the Layout has
   * Expanded it (ADR 0064).
   *
   * A slot rather than an `expanded` flag or a second component. The ADR's claim
   * is that an Expanded Card *is* the Card, bigger — one component with a region
   * makes that structural: the same paper, the same rail, the same Title, the
   * same `data-state` matrix, plus this. An `ExpandedCanvasCard` beside it would
   * assert the claim in prose and deny it in the module graph, and would double
   * the interaction-state union `CanvasCardProps` already encodes.
   *
   * The presence of the slot *is* the Expanded state, so the two cannot
   * disagree. What fills it belongs to the Card's kind, which owns everything
   * past the Title (ADR 0051): the Markdown kind's is `MarkdownCardBody`. The
   * Alias kind has no Expanded front yet — ADR 0064 leaves it open — so nothing
   * offers this for one.
   */
  readonly content?: ReactNode;
  /** Present only when activating the displayed Title may begin a rename. */
  readonly onBeginTitleEdit?: () => void;
  /** Toggle this Card between its collapsed and Expanded states. */
  readonly onOpenChange?: (open: boolean) => void;
  /**
   * Put a caret in this Card's kind-owned content.
   *
   * Offered whatever the Card's size (ADR 0066): opening and editing are
   * separate actions, and Edit is something an author does to a Card rather than
   * something available only inside one already open. On a collapsed Card the
   * rail's Edit control runs `onOpenChange(true)` first and this second — the
   * same two calls the Open and Edit controls make in sequence, so there is no
   * second expansion path and no transient approximation of opening.
   */
  readonly onBeginContentEdit?: () => void;
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
 * On an Expanded Card it is simply the caret operation the caller supplied. On a
 * **collapsed** one it is ADR 0066's rule — open the Card, then place the caret
 * — composed from the Card's own two existing operations and nothing else. Opening is not reimplemented or
 * approximated here: `onOpenChange` is the same call the Open control makes, so
 * the growth, the neighbours' displacement and the transition are the ones
 * opening always produces.
 *
 * A collapsed Card that cannot be opened has no Edit control, because the first
 * half of that pair would be missing and the caret would have nowhere to land.
 */
const contentEditAction = (
  content: ReactNode | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
  onBeginContentEdit: (() => void) | undefined,
): (() => void) | undefined => {
  if (onBeginContentEdit === undefined) return undefined;
  if (content !== undefined) return onBeginContentEdit;
  if (onOpenChange === undefined) return undefined;
  return () => {
    onOpenChange(true);
    onBeginContentEdit();
  };
};

export function CanvasCard(props: CanvasCardProps) {
  const {
    front,
    title,
    graphColor,
    content,
    onBeginTitleEdit,
    onOpenChange,
    onBeginContentEdit,
    state,
  } = props;
  /**
   * The edit running inside the content slot, published by whatever fills it.
   *
   * State rather than a prop because the slot is an opaque `ReactNode` and the
   * caret is not in anything this component or its caller holds — `CanvasCard`
   * asks the content, and the content answers (`card-content-edit.ts`).
   */
  const [contentEdit, setContentEdit] = useState<CardContentEdit | null>(null);
  const editControl = useRef<HTMLButtonElement>(null);
  const contentEditingWas = useRef(false);
  const beginContentEdit = contentEditAction(content, onOpenChange, onBeginContentEdit);
  const showActions =
    state !== 'dragging' &&
    state !== 'editing' &&
    (contentEdit !== null || onOpenChange !== undefined || beginContentEdit !== undefined);
  const style: CanvasCardStyle = { '--canvas-card-graph': graphColor };

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
      data-kind={front.kind}
      data-state={state}
      // Read by `canvas-card.css` for the two things Expanding changes about
      // the Card itself: it fills the box the Layout gave it rather than the
      // collapsed constant, and its content fills the space above the Title.
      // Derived from the slot, so there is one fact here and not two that can
      // disagree.
      data-expanded={content !== undefined}
      // The rail is normally revealed with the Card and hidden again at rest.
      // A running edit is not a hover, so the controls that end it are read off
      // this instead — an author writing in the body must be able to see the way
      // out without going looking for it with the pointer.
      data-content-editing={contentEdit !== null}
      style={style}
    >
      <CardRail kind={front.kind} graphColor={graphColor} className="canvas-card__rail">
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
                aria-label={`${content === undefined ? 'Open' : 'Close'} Card ${title}`}
                // Closing mid-edit would drop the Card's box out from under a
                // live caret with a draft in it. The control keeps its slot and
                // goes disabled rather than disappearing: the rail's row does not
                // reshuffle while the author writes, and what is unavailable says
                // so instead of vanishing.
                disabled={contentEdit !== null}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenChange(content === undefined);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {content === undefined ? (
                  <OpenCardIcon data-icon="inline-start" />
                ) : (
                  <CloseCardIcon data-icon="inline-start" />
                )}
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
      {content !== undefined && (
        <div className="canvas-card__content">
          <CardContentEditProvider value={setContentEdit}>{content}</CardContentEditProvider>
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
