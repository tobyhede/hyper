import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from './Button';
import {
  CardRailAction,
  CardRailActions,
  CardRailKindActions,
  CardRailSharedActions,
} from './CardRailActions';
import { CardContentEditProvider, type CardContentEdit } from './card-content-edit';
import { EntityActions, EntityActionsTrigger, type EntityActionGroup } from './EntityActionsMenu';
import { CardRail } from './CardRail';
import { Card, CardContent, CardTitle } from './components/card';
import { AbandonEditIcon, CloseCardIcon, CommitEditIcon, EditIcon, OpenCardIcon } from './icons';
import {
  MarkdownCardBody,
  type MarkdownCardBodyEditor,
  type MarkdownCardBodyProps,
} from './MarkdownCardBody';
import './canvas-card.css';
import { usePresence } from './use-presence';
import { InlineTitleEditor } from './InlineTitleEditor';

/**
 * What a Card front draws beyond its shared Title (ADR 0051): a kind-owned
 * choice, not a kind tag plus an optional field every other kind ignores.
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
    }
  | {
      /** Interim closed treatment; embedding the selected Space View belongs to issue 01. */
      readonly kind: 'space';
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
  /**
   * This Card's own commands — rename it, copy an address it can be reached by,
   * open it elsewhere — drawn as one more control on the rail.
   *
   * Absent by default, and absent means no control rather than an empty menu:
   * a Card drawn where none of those commands can run (a creation ghost, a
   * story with nothing behind it) offers nothing instead of offering a menu
   * that refuses.
   */
  readonly entityActions?: readonly EntityActionGroup[];
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
 * What the rail's Edit control runs, or `undefined` when the Card has no such
 * control to draw.
 *
 * On an open Card it is simply the caret operation the caller supplied. On a
 * **closed** one it is ADR 0064's rule — open the Card, then place the caret —
 * composed from the Card's own two existing operations and nothing else.
 * Opening is not reimplemented or approximated here: `onOpenChange` is the same
 * call the Open control makes, so the growth, the neighbours' displacement and
 * the transition are the ones opening always produces.
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

/**
 * How long the content's own opacity transition runs, in milliseconds.
 *
 * Read from the computed style rather than restated in TypeScript, so the
 * stylesheet stays the one place the Card's timing is written. `transition`
 * shorthand expands to a list, and the durations are positional — so the
 * opacity duration is the one at opacity's index in `transition-property`,
 * falling back to the first when the property is not named individually.
 */
const opacityTransitionMs = (element: HTMLElement): number => {
  const style = getComputedStyle(element);
  const opacityIndex = style.transitionProperty
    .split(',')
    .map((property) => property.trim())
    .indexOf('opacity');
  const durations = style.transitionDuration.split(',').map((duration) => duration.trim());
  const duration = opacityIndex < 0 ? durations[0] : durations[opacityIndex % durations.length];
  if (duration === undefined) return 0;
  const milliseconds = duration.endsWith('ms')
    ? Number.parseFloat(duration)
    : Number.parseFloat(duration) * 1000;
  return Number.isFinite(milliseconds) ? milliseconds : 0;
};

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
  const { front, title, graphColor, onBeginTitleEdit, entityActions, state } = props;
  const visualKind = front.kind === 'preview' ? 'markdown' : front.kind;
  const open = front.kind === 'markdown' && front.open;
  const contentControl = useRef<HTMLDivElement>(null);
  const contentExitDuration = useCallback(
    () => (contentControl.current === null ? 0 : opacityTransitionMs(contentControl.current)),
    [],
  );
  const contentPresence = usePresence(open, contentExitDuration);
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
  const actionableEntityActions = entityActions?.some((group) => group.length > 0) === true;
  const showActions =
    state !== 'dragging' &&
    state !== 'editing' &&
    (contentEdit !== null ||
      onOpenChange !== undefined ||
      onOpenAlias !== undefined ||
      actionableEntityActions ||
      beginContentEdit !== undefined);
  const style: CanvasCardStyle = { '--canvas-card-graph': graphColor };
  const markdownBodyProps: Mutable<
    Pick<MarkdownCardBodyProps, 'onBeginEdit' | 'editor' | 'autoFocus'>
  > = {};
  if (onBeginContentEdit !== undefined) markdownBodyProps.onBeginEdit = onBeginContentEdit;
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

  useLayoutEffect(() => {
    if (contentControl.current !== null) {
      contentControl.current.inert = contentPresence.state === 'leaving';
    }
  }, [contentPresence.state]);

  const card = (
    <Card
      role="article"
      aria-label={title}
      className="canvas-card"
      data-testid="card"
      data-kind={visualKind}
      data-state={state}
      // Exposes authored state for the Card's public treatment and evidence.
      // The React Flow wrapper owns the moving rect, while the Markdown Title's
      // layout remains invariant; no wall-clock presentation state is allowed
      // to become a second expansion fact and move the Title mid-close.
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
          // ADR 0073. One tab stop for the whole rail, arrows between its
          // controls: a canvas carries many Cards and a Card's rail carries
          // several commands, so a control apiece would put the Cards
          // themselves out of reach behind their own actions. The keyboard
          // contract, the shared control treatment and the canvas suppression
          // every one of these needs are `CardRailActions`' and
          // `CardRailAction`'s; what is left here is which commands this Card
          // has, and what each one runs.
          //
          // The two groups are the answer to "whose command is this?". Editing
          // this Card's Markdown is the Markdown front's business and means
          // nothing on another kind; opening and closing is every Card's, and
          // stays in the same place whatever kind it is drawn on.
          <CardRailActions
            aria-label={`Card ${title}`}
            className="canvas-card__actions"
            data-testid="canvas-card-actions"
          >
            <CardRailKindActions kind={visualKind}>
              {contentEdit === null ? (
                beginContentEdit !== undefined && (
                  <CardRailAction
                    ref={editControl}
                    aria-label={`Edit Card ${title}`}
                    onClick={beginContentEdit}
                  >
                    <EditIcon data-icon="inline-start" />
                  </CardRailAction>
                )
              ) : (
                <ContentEditActions title={title} edit={contentEdit} />
              )}
              {/* An Alias does not expand, so its Open is its own kind's
                  command — it opens the Alias's metadata editor rather than
                  the Card. It is not the shared Open below. */}
              {onOpenAlias !== undefined && (
                <CardRailAction aria-label={`Open Card ${title}`} onClick={onOpenAlias}>
                  <OpenCardIcon data-icon="inline-start" />
                </CardRailAction>
              )}
            </CardRailKindActions>
            <CardRailSharedActions>
              {/* Ahead of Open/Close, so the control that changes what the
                  author is looking at stays the last thing on the rail and
                  keeps the position it has always had. Adding the new command
                  after it would move Close under a pointer already trained on
                  it. */}
              {actionableEntityActions && (
                <EntityActionsTrigger
                  groups={entityActions}
                  label={`Actions for Card ${title}`}
                  render={<CardRailAction />}
                />
              )}
              {onOpenChange !== undefined && (
                <CardRailAction
                  aria-label={`${open ? 'Close' : 'Open'} Card ${title}`}
                  // Closing mid-edit would drop the Card's box out from under a
                  // live caret with a draft in it. The control keeps its slot and
                  // goes unavailable rather than disappearing: the rail's row does
                  // not reshuffle while the author writes, and what is unavailable
                  // says so instead of vanishing.
                  //
                  // A toolbar item stays focusable while disabled (ADR 0073), so
                  // that promise now holds for the keyboard too — the control keeps
                  // its place in the arrow order and announces itself unavailable,
                  // instead of being drawn and unreachable.
                  disabled={contentEdit !== null}
                  onClick={() => {
                    onOpenChange(!open);
                  }}
                >
                  {open ? (
                    <CloseCardIcon data-icon="inline-start" />
                  ) : (
                    <OpenCardIcon data-icon="inline-start" />
                  )}
                </CardRailAction>
              )}
            </CardRailSharedActions>
          </CardRailActions>
        )}
      </CardRail>
      <CardContent className="canvas-card__body">
        {state === 'editing' ? (
          <InlineTitleEditor
            title={title}
            label="Card title"
            variant="card"
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
      {front.kind === 'markdown' && contentPresence.mounted && (
        <div
          ref={contentControl}
          className="canvas-card__content"
          data-presence={contentPresence.state}
        >
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
  return actionableEntityActions ? (
    <EntityActions groups={entityActions}>{card}</EntityActions>
  ) : (
    card
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
 * The same `CardRailAction` as everything else on the rail: same box, same
 * border, same paper and ink, same hover inversion. The key each one spends is
 * stated with `aria-keyshortcuts` and drawn by the body's own shortcut hint,
 * which is where a canvas Card names a key.
 *
 * `holdFocus` is the one thing these two ask for that the other rail controls
 * do not, and it is asked for because the caret is in the content while the
 * control is on the band: without it the press that activates one is also a
 * focus leaving the writing surface, mid-edit and for a control that may well
 * be Cancel.
 */
function ContentEditActions({ title, edit }: ContentEditActionsProps) {
  return (
    <>
      <CardRailAction
        holdFocus
        aria-label={`Save Card ${title}`}
        aria-keyshortcuts="Meta+Enter Control+Enter"
        onClick={edit.onSave}
      >
        <CommitEditIcon data-icon="inline-start" />
      </CardRailAction>
      <CardRailAction
        holdFocus
        aria-label={`Cancel editing Card ${title}`}
        aria-keyshortcuts="Escape"
        onClick={edit.onCancel}
      >
        <AbandonEditIcon data-icon="inline-start" />
      </CardRailAction>
    </>
  );
}
