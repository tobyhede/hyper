import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Button } from './Button';
import { CardKindIcon } from './CardKindIcon';
import { Card, CardContent, CardHeader, CardTitle } from './components/card';
import { ConnectIcon, EditIcon } from './icons';
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
  /** Present only when double-clicking the title may begin a rename. */
  readonly onBeginTitleEdit?: () => void;
  /** Present only when this Card may be connected from. */
  readonly onConnect?: () => void;
  /** Present only when this Card owns content or metadata to edit. */
  readonly onEdit?: () => void;
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
 * The one visual Card front shared by the production canvas and its stories.
 *
 * The deep production module for Markdown and Alias Card fronts, title
 * editing, refusal display and interaction-state visual treatment. React Flow
 * geometry, connection state, selection/drag translation and containment stay
 * with the adapter that renders this component (`@project/react-flow-adapter`
 * `CardNode`) — nothing here imports React Flow or reaches into its DOM. Its
 * own visual treatment lives in `canvas-card.css`, colocated with this module.
 */
export function CanvasCard(props: CanvasCardProps) {
  const { front, title, graphColor, onBeginTitleEdit, onConnect, onEdit, state } = props;
  const showActions =
    state !== 'dragging' &&
    state !== 'editing' &&
    (onConnect !== undefined || onEdit !== undefined);

  return (
    <Card
      role="article"
      aria-label={title}
      className="canvas-card"
      data-testid="card"
      data-kind={front.kind}
      data-state={state}
      // SAFETY: CSSProperties doesn't type CSS custom properties (`--*`);
      // this value is read only by canvas-card.css.
      style={{ '--canvas-card-graph': graphColor } as CSSProperties}
    >
      <CardHeader className="canvas-card__rail">
        <span className="canvas-card__kind">
          <CardKindIcon kind={front.kind} />
        </span>
        {showActions && (
          <div className="canvas-card__actions" data-testid="canvas-card-actions">
            {onConnect !== undefined && (
              <Button
                variant="ghost"
                size="icon"
                className="card__connect nodrag nopan"
                data-testid="connect-from-card"
                aria-label={`Connect from ${title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onConnect();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <ConnectIcon />
              </Button>
            )}
            {onEdit !== undefined && (
              <Button
                variant="ghost"
                size="icon"
                className="card__edit nodrag nopan"
                aria-label={`Edit Card ${title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <EditIcon />
              </Button>
            )}
          </div>
        )}
      </CardHeader>
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
            data-editable={onBeginTitleEdit !== undefined}
            role="heading"
            aria-level={2}
            onDoubleClick={
              onBeginTitleEdit === undefined
                ? undefined
                : (event) => {
                    // ADR 0036: renaming is the title's own double click, and
                    // the Card's is opening it to read. This one must not also
                    // be that one — the content would be drawn over the field
                    // the author is about to type into.
                    event.stopPropagation();
                    onBeginTitleEdit();
                  }
            }
          >
            {title}
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
    </Card>
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
