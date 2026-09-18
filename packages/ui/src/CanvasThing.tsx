import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { titleLines, titleName } from '@project/core';
import { Button } from './Button';
import {
  ThingRailAction,
  ThingRailActions,
  ThingRailKindActions,
  ThingRailSharedActions,
} from './ThingRailActions';
import { ThingContentEditProvider, type ThingContentEdit } from './thing-content-edit';
import { SpaceThingSelectors, type CanvasSpaceThingSelection } from './SpaceThingSelectors';
import { EntityActions, EntityActionsTrigger, type EntityActionGroup } from './EntityActionsMenu';
import { ThingRail } from './ThingRail';
import { Card, CardContent, CardTitle } from './components/card';
import {
  AbandonEditIcon,
  CloseThingIcon,
  CommitEditIcon,
  EditIcon,
  EntityActionsIcon,
  OpenThingIcon,
} from './icons';
import {
  MarkdownThingBody,
  type MarkdownThingBodyEditor,
  type MarkdownThingBodyProps,
} from './MarkdownThingBody';
import './canvas-thing.css';
import { usePresence } from './use-presence';
import { InlineTitleEditor } from './InlineTitleEditor';

/**
 * What a Thing front draws beyond its shared Title (ADR 0051): a kind-owned
 * choice, not a kind tag plus an optional field every other kind ignores.
 */
interface CanvasMarkdownThingFront {
  readonly kind: 'markdown';
  /** The Markdown bytes this Thing owns. */
  readonly source: string;
  /** Request that authored state open or close this Thing. */
  readonly onOpenChange?: (open: boolean) => 'completed' | 'retained';
  /** Put a caret in this Thing's Markdown source. */
  readonly onBeginEdit?: () => void;
}

export type CanvasThingFront =
  | {
      /** A creation ghost: Markdown treatment without authored content or open state. */
      readonly kind: 'preview';
    }
  | (CanvasMarkdownThingFront & {
      /** Closed authored state cannot carry a body editor. */
      readonly open: false;
      readonly editor?: never;
      readonly autoFocusEditor?: never;
    })
  | (CanvasMarkdownThingFront & {
      /** Authored Diagram state. CanvasThing renders it; it does not own it. */
      readonly open: true;
      /** Present exactly while the Markdown body holds the canvas caret. */
      readonly editor?: CanvasThingBodyEditor;
      /** Whether a newly supplied body editor takes focus. */
      readonly autoFocusEditor?: boolean;
    })
  | {
      readonly kind: 'reference';
      /** The resolved Target content this Reference Thing displays read-only. */
      readonly target:
        { readonly kind: 'markdown'; readonly source: string } | { readonly kind: 'space' };
      /** Authored Diagram state; a Reference Thing Opens through the shared Thing operation. */
      readonly open: boolean;
      readonly onOpenChange?: (open: boolean) => 'completed' | 'retained';
    }
  | {
      readonly kind: 'space';
      /** Authored Diagram state; a Space Thing Opens through the shared Thing operation. */
      readonly open: boolean;
      readonly onOpenChange?: (open: boolean) => 'completed' | 'retained';
      /**
       * What an Open Space Thing offers to author: the target's Diagrams, the
       * Graphs of the selected one, and this Thing's own selections. Absent while
       * the target Space has not been read yet.
       */
      readonly selection?: CanvasSpaceThingSelection;
      /**
       * Diagram and Graph clusters, assembled by the application and inserted
       * at the head of this Thing's rail. Absent while the Thing is closed, the
       * surface is read-only, or the target Space has not been read yet.
       */
      readonly spaceRail?: ReactNode;
      /**
       * The Read/Edit boundary for the embedded target canvas.
       *
       * Absent means this surface does not offer one — a Closed Thing, an unread
       * target, or a composition that has not wired the portal. Present on an Open
       * Space Thing: Read leaves the embedding inert so dragging moves this Thing;
       * Edit activates the target canvas and replaces the control with Done.
       */
      readonly portal?: {
        readonly editing: boolean;
        readonly onEditingChange: (editing: boolean) => void;
      };
    };

/** The two authored operations that end a live Markdown body edit. */
export type CanvasThingBodyEditor = MarkdownThingBodyEditor;

/** External visual facts the adapter knows and CanvasThing cannot derive:
 *  React Flow selection, drag and inline-title-editing. Hover and the
 *  selected+hover combination are the Thing's own CSS, driven by real
 *  pointer/focus pseudo-classes rather than a computed React state. */
export type CanvasThingState = 'rest' | 'selected' | 'dragging' | 'editing';

interface CanvasThingCommonProps {
  readonly front: CanvasThingFront;
  /** A canvas adapter may lift the rail above embedded content in its viewport. */
  readonly renderRail?: (rail: ReactNode) => ReactNode;
  /** Pointer is over a portalled rail lifted outside this Card subtree. */
  readonly railHovered?: boolean;
  /** Reports the content-sized title footer in unscaled layout pixels. */
  readonly onBodyHeightChange?: (height: number | null) => void;
  /**
   * A refusal or busy notice from this Thing's context commands, supplied by
   * decoration. Absent or null leaves the alert region unmounted.
   */
  readonly contextNotice?: string | null;
  readonly title: string;
  readonly graphColor: string;
  /**
   * Draw this Thing as content only. Authoring callbacks may still be present in
   * an upstream composition, but this boundary does not expose them as title,
   * open or edit controls while the Thing belongs to a read-only surface.
   */
  readonly readOnly?: boolean;
  /** Present only when activating the displayed Title may begin a rename. */
  readonly onBeginTitleEdit?: () => void;
  /**
   * This Thing's own commands — rename it, copy an address it can be reached by,
   * open it elsewhere — drawn as one more control on the rail.
   *
   * Absent by default, and absent means no control rather than an empty menu:
   * a Thing drawn where none of those commands can run (a creation ghost, a
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
export type CanvasThingProps = CanvasThingCommonProps &
  (
    | { readonly state: Exclude<CanvasThingState, 'editing'> }
    | {
        readonly state: 'editing';
        /** Submit the draft; answers a refusal reason, or `null` when accepted. */
        readonly onCompleteTitleEdit: (title: string) => string | null;
        readonly onCancelTitleEdit: () => void;
        /** Hand focus back to the Thing the adapter renders this front inside. */
        readonly onReturnFocus: () => void;
      }
  );

/**
 * How far a Thing leans while it is being moved.
 *
 * The number lives here and nowhere else. CSS reads it as
 * `--canvas-thing-drag-tilt`, published below. The canvas reads the same
 * number for an embedded canvas this element cannot carry — React Flow
 * renders sub-flow children as DOM siblings of their parent's wrapper.
 * `embedded-diagram.test.ts` holds that motion as a rigid one.
 */
export const CANVAS_THING_DRAG_TILT_DEGREES = -1;

/**
 * The CSS custom properties this Thing publishes to `canvas-thing.css`.
 *
 * `CSSProperties` does not type CSS custom properties (`--*`), so the style
 * object is *declared* as the intersection it is actually built as rather than
 * asserted into `CSSProperties` after the fact — the fact is true by
 * construction and needs no claim the compiler cannot check (ADR 0062).
 */
type CanvasThingStyle = CSSProperties & {
  readonly '--canvas-thing-graph': string;
  readonly '--canvas-thing-drag-tilt': string;
};
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * What the rail's Edit control runs, or `undefined` when the Thing has no such
 * control to draw.
 *
 * On an open Thing it is simply the caret operation the caller supplied. On a
 * **closed** one it is ADR 0064's rule — open the Thing, then place the caret —
 * composed from the Thing's own two existing operations and nothing else.
 * Opening is not reimplemented or approximated here: `onOpenChange` is the same
 * call the Open control makes, so the growth, the neighbours' displacement and
 * the transition are the ones opening always produces.
 *
 * A closed Thing that cannot be opened has no Edit control, because the first
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
 * stylesheet stays the one place the Thing's timing is written. `transition`
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
 * The one visual Thing front shared by the production canvas and its stories.
 *
 * The deep production module for Markdown and Reference Thing fronts, title
 * editing, refusal display and interaction-state visual treatment. React Flow
 * geometry, connection state, selection/drag translation and containment stay
 * with the adapter that renders this component (`@project/react-flow-adapter`
 * `ThingNode`) — nothing here imports React Flow or reaches into its DOM. Its
 * own visual treatment lives in `canvas-thing.css`, colocated with this module.
 */
export function CanvasThing(props: CanvasThingProps) {
  const [hovered, setHovered] = useState(false);
  const { front, title, graphColor, entityActions, state, readOnly = false } = props;
  /**
   * What this Thing is called wherever it is *named* rather than drawn.
   *
   * The Title's first line (ADR 0083). The visible heading below still draws
   * the whole ladder — that is what the Thing front is for — but every
   * accessible name here is one line, because a screen reader announcing three
   * lines as one control's name reads as a control with a paragraph for a name.
   * A reader who wants the rest reads the heading.
   */
  const name = titleName(title);
  const onBeginTitleEdit = readOnly ? undefined : props.onBeginTitleEdit;
  const visualKind = front.kind === 'preview' ? 'markdown' : front.kind;
  /** The kinds that draw a Markdown document below their Title. */
  const contentFront =
    front.kind === 'markdown'
      ? front
      : front.kind === 'reference' && front.target.kind === 'markdown'
        ? { ...front, source: front.target.source }
        : undefined;
  /**
   * The kinds that carry authored Open/Closed state — every kind but the
   * creation ghost, which is not a Thing yet and so has no Diagram to author it
   * on. It is a wider set than `contentFront` because a Space Thing Opens
   * without having any Markdown of its own to reveal: what it shows when it
   * opens is its embedded Diagram, with selection commands on the rail.
   */
  const openableFront = front.kind === 'preview' ? undefined : front;
  const open = openableFront?.open === true;
  const bodyControl = useRef<HTMLDivElement>(null);
  const contentControl = useRef<HTMLDivElement>(null);
  const contentExitDuration = useCallback(
    () => (contentControl.current === null ? 0 : opacityTransitionMs(contentControl.current)),
    [],
  );
  // Follows the *content* front's openness rather than the Thing's, so a Space
  // Thing opening and closing does not run a presence machine over a document
  // that is never mounted.
  const contentPresence = usePresence(contentFront?.open === true, contentExitDuration);
  const onOpenChange = readOnly ? undefined : openableFront?.onOpenChange;
  const onBeginContentEdit = !readOnly && front.kind === 'markdown' ? front.onBeginEdit : undefined;
  /**
   * The edit running inside the Markdown front this Thing owns.
   *
   * State rather than a second prop because the draft and caret live inside
   * the body. `front.editor` supplies domain completion; the body publishes
   * the Save and Cancel closures for its current draft (`thing-content-edit.ts`).
   */
  const [contentEdit, setContentEdit] = useState<ThingContentEdit | null>(null);
  const visibleContentEdit = readOnly ? null : contentEdit;
  const editControl = useRef<HTMLButtonElement>(null);
  const contentEditingWas = useRef(false);
  const beginContentEdit = contentEditAction(open, onOpenChange, onBeginContentEdit);
  const actionableEntityActions = entityActions?.some((group) => group.length > 0) === true;
  const [selectorNotice, setContextNotice] = useState<string | null>(null);
  const contextNotice = props.contextNotice ?? selectorNotice;
  const spaceSelection =
    !readOnly && front.kind === 'space' && front.open ? front.selection : undefined;
  const spaceRail = !readOnly && front.kind === 'space' && front.open ? front.spaceRail : undefined;
  const portal = !readOnly && front.kind === 'space' && front.open ? front.portal : undefined;
  const portalEditing = portal?.editing === true;
  const showActions =
    state !== 'dragging' &&
    state !== 'editing' &&
    (spaceSelection !== undefined ||
      spaceRail !== undefined ||
      portal !== undefined ||
      visibleContentEdit !== null ||
      onOpenChange !== undefined ||
      actionableEntityActions ||
      beginContentEdit !== undefined);
  const style: CanvasThingStyle = {
    '--canvas-thing-graph': graphColor,
    '--canvas-thing-drag-tilt': `${CANVAS_THING_DRAG_TILT_DEGREES}deg`,
  };
  const markdownBodyProps: Mutable<
    Pick<MarkdownThingBodyProps, 'onBeginEdit' | 'editor' | 'autoFocus'>
  > = {};
  if (onBeginContentEdit !== undefined) markdownBodyProps.onBeginEdit = onBeginContentEdit;
  if (!readOnly && front.kind === 'markdown' && front.editor !== undefined) {
    markdownBodyProps.editor = front.editor;
  }
  if (!readOnly && front.kind === 'markdown' && front.autoFocusEditor !== undefined) {
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

  const onBodyHeightChange = props.onBodyHeightChange;
  useLayoutEffect(() => {
    const body = bodyControl.current;
    if (body === null || onBodyHeightChange === undefined) return;
    const report = () => onBodyHeightChange(body.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(body);
    return () => {
      observer.disconnect();
      onBodyHeightChange(null);
    };
  }, [onBodyHeightChange]);

  const railHovered = props.railHovered === true;
  const rail = (
    <ThingRail
      kind={visualKind}
      hideKind={open}
      revealed={
        hovered ||
        railHovered ||
        state === 'selected' ||
        state === 'editing' ||
        visibleContentEdit !== null ||
        portalEditing
      }
      className="canvas-thing__rail"
    >
      {showActions && (
        // ADR 0073. One tab stop for the whole rail, arrows between its
        // controls: a canvas carries many Things and a Thing's rail carries
        // several commands, so a control apiece would put the Things
        // themselves out of reach behind their own actions. The keyboard
        // contract, the shared control treatment and the canvas suppression
        // every one of these needs are `ThingRailActions`' and
        // `ThingRailAction`'s; what is left here is which commands this Thing
        // has, and what each one runs.
        //
        // The two groups are the answer to "whose command is this?". Editing
        // this Thing's Markdown is the Markdown front's business and means
        // nothing on another kind; opening and closing is every Thing's.
        // Space choices lead the rail, followed by entity actions, Open/Close
        // with Enter in the entity menu. Content-edit commands stay beside it.
        <ThingRailActions
          aria-label={`Thing ${name}`}
          className="canvas-thing__actions"
          data-testid="canvas-thing-actions"
        >
          {spaceSelection !== undefined && (
            <SpaceThingSelectors {...spaceSelection} onReport={setContextNotice} />
          )}
          {spaceRail}
          {actionableEntityActions && (
            <EntityActionsTrigger
              groups={entityActions}
              label={`Actions for Thing ${name}`}
              icon={<EntityActionsIcon />}
              render={<ThingRailAction />}
            />
          )}
          <ThingRailKindActions kind={visualKind}>
            {visibleContentEdit !== null ? (
              <ContentEditActions name={name} edit={visibleContentEdit} />
            ) : beginContentEdit !== undefined ? (
              <ThingRailAction
                ref={editControl}
                aria-label={`Edit Thing ${name}`}
                onClick={beginContentEdit}
              >
                <EditIcon data-icon="inline-start" />
              </ThingRailAction>
            ) : portal !== undefined ? (
              portalEditing ? (
                <ThingRailAction
                  ref={editControl}
                  aria-label={`Done Thing ${name}`}
                  onClick={() => portal.onEditingChange(false)}
                >
                  <CommitEditIcon data-icon="inline-start" />
                </ThingRailAction>
              ) : (
                <ThingRailAction
                  ref={editControl}
                  aria-label={`Edit Thing ${name}`}
                  onClick={() => portal.onEditingChange(true)}
                >
                  <EditIcon data-icon="inline-start" />
                </ThingRailAction>
              )
            ) : null}
          </ThingRailKindActions>
          <ThingRailSharedActions>
            {onOpenChange !== undefined && (
              <ThingRailAction
                aria-label={`${open ? 'Close' : 'Open'} Thing ${name}`}
                // Closing mid-edit would drop the Thing's box out from under a
                // live caret with a draft in it. The control keeps its slot and
                // goes unavailable rather than disappearing: the rail's row does
                // not reshuffle while the author writes, and what is unavailable
                // says so instead of vanishing.
                //
                // A toolbar item stays focusable while disabled (ADR 0073), so
                // that promise now holds for the keyboard too — the control keeps
                // its place in the arrow order and announces itself unavailable,
                // instead of being drawn and unreachable.
                disabled={visibleContentEdit !== null}
                onClick={() => {
                  onOpenChange(!open);
                }}
              >
                {open ? (
                  <CloseThingIcon data-icon="inline-start" />
                ) : (
                  <OpenThingIcon data-icon="inline-start" />
                )}
              </ThingRailAction>
            )}
          </ThingRailSharedActions>
        </ThingRailActions>
      )}
    </ThingRail>
  );

  const thing = (
    <Card
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      role="article"
      aria-label={name}
      className="canvas-thing"
      data-testid="thing"
      data-kind={visualKind}
      data-content-kind={front.kind === 'reference' ? front.target.kind : visualKind}
      data-state={state}
      // Exposes authored state for the Thing's public treatment and evidence.
      // The React Flow wrapper owns the moving rect, while the Markdown Title's
      // layout remains invariant; no wall-clock presentation state is allowed
      // to become a second expansion fact and move the Title mid-close.
      data-expanded={open}
      // The rail is normally revealed with the Thing and hidden again at rest.
      // A running edit is not a hover, so the controls that end it are read off
      // this instead — an author writing in the body must be able to see the way
      // out without going looking for it with the pointer.
      data-content-editing={visibleContentEdit !== null || portalEditing}
      style={style}
    >
      {/* Neutral: the band carries no colour and the commands on it sit on the
          shared command surface (`.scratch/command-dock/issues/12`). The Graph's
          colour is still on this Thing — `--canvas-thing-graph` below draws the
          Title's own hover and caret treatment — and still on the handles and
          Edges the adapter draws around it. */}
      {props.renderRail === undefined ? rail : props.renderRail(rail)}
      <CardContent ref={bodyControl} className="canvas-thing__body">
        {state === 'editing' && !readOnly ? (
          <InlineTitleEditor
            title={title}
            label="Thing title"
            variant="thing"
            // A Thing's Title is Title Lines (ADR 0083), and the Thing front is
            // the one surface that draws them, so the Thing front is where the
            // capability is asked for.
            multiline
            onComplete={props.onCompleteTitleEdit}
            onCancel={props.onCancelTitleEdit}
            onReturnFocus={props.onReturnFocus}
          />
        ) : (
          <CardTitle
            className="canvas-thing__title"
            data-editable={onBeginTitleEdit !== undefined && visibleContentEdit === null}
          >
            {onBeginTitleEdit === undefined || visibleContentEdit !== null ? (
              <TitleHeading title={title} />
            ) : (
              // ADR 0065's one-activation control, wrapping the heading rather
              // than sitting inside it (ADR 0083).
              //
              // The nesting is the whole point and it is the opposite of the
              // obvious arrangement. An accessible name comes from an element's
              // own label first and its content second, so a heading that
              // *contains* a labelled control is named by that control: with
              // the control inside, the heading read `Edit Title <name>` and
              // the Title Lines were reachable through nothing. With the
              // control outside, the control keeps the short action name ADR
              // 0065 asks for and the heading is named by the Title Lines it
              // draws, which is how a reader reaches the lines below the name.
              //
              // Verified in Chromium, not inferred: `heading` survives inside
              // `button` un-ignored, with both names as intended. jsdom
              // disagrees with a browser here, so `ladle-e2e` owns the proof.
              <Button
                variant="ghost"
                className="canvas-thing__title-control nodrag nopan"
                aria-label={`Edit Title ${name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onBeginTitleEdit();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <TitleHeading title={title} />
              </Button>
            )}
          </CardTitle>
        )}
        {/* Withheld while the Thing is read-only for the same reason every other
            authoring affordance is — a read-only surface draws what the Thing
            shows, not what could be changed about it. */}
        {front.kind === 'space' &&
          front.open &&
          !readOnly &&
          spaceSelection === undefined &&
          spaceRail === undefined && (
            <p className="canvas-thing__space-note">Reading the referenced Space…</p>
          )}
        {contextNotice !== null && (
          <p role="status" className="canvas-thing__space-note">
            {contextNotice}
          </p>
        )}
      </CardContent>
      {/* A sibling of the Title's body rather than a child of it. The body is
          inset so a Title sits off the Thing's border; a writing surface brings
          its own gutter and padding and has to reach the paper's edges, and
          nesting it would draw one inset inside another. */}
      {contentFront !== undefined && contentPresence.mounted && (
        <div
          ref={contentControl}
          className="canvas-thing__content"
          data-presence={contentPresence.state}
        >
          <ThingContentEditProvider value={setContentEdit}>
            <MarkdownThingBody
              source={contentFront.source}
              ariaLabel={`Markdown source of ${name}`}
              {...markdownBodyProps}
            />
          </ThingContentEditProvider>
        </div>
      )}
    </Card>
  );
  return actionableEntityActions ? <EntityActions groups={entityActions} render={thing} /> : thing;
}

interface TitleLadderProps {
  readonly title: string;
}

/**
 * A Thing's Title drawn as its Title Lines (ADR 0083).
 *
 * The Thing front is the only surface that draws the ladder — everywhere else
 * shows the name, which is the first line — and it draws it identically whether
 * the Thing is Open or Closed and whatever kind the Thing is. A Title that
 * changed shape on Opening would teach an author that Opening edits it.
 *
 * Each line is **its own block element carrying its role**, and that is the
 * whole of the structure: the roles come from `titleLines`, which is where the
 * domain settles what an author's second line means, and the type ladder,
 * clamping and colour come from `canvas-thing.css`. Nothing here reads a
 * newline, because a `split('\n')` at a call site is exactly what ADR 0083
 * bought the named operation to prevent.
 *
 * The distinction the block-per-line is here for: a break the **author typed**
 * starts a rung and a break the **box chose** does not. Each element wraps
 * freely within its own role, so a subtitle that runs to two visual lines is
 * one subtitle rather than a subtitle and a caption, and a long single-line
 * Title still draws entirely at the `title` role, as it always has.
 *
 * Keyed by position because position *is* the identity here — it is what gives
 * a line its role — and two lines of a Title may legitimately read the same.
 */
function TitleLadder({ title }: TitleLadderProps) {
  return (
    <>
      {titleLines(title).map((line, index) => (
        <span key={index} className="canvas-thing__title-line" data-role={line.role}>
          {line.text}
        </span>
      ))}
    </>
  );
}

/**
 * The Thing's Title Lines, as the one heading the Thing front draws.
 *
 * A `span` and not a `div` or an `h2`: a `button`'s content model is phrasing
 * content, and this element sits inside ADR 0065's activation control whenever
 * the Title is editable. `role="heading"` with `aria-level` is the ARIA
 * spelling of what a native `h2` would say, taken because the native element
 * cannot legally go where this one has to.
 *
 * It carries no `aria-label`. Its name is the Title Lines it draws, which is
 * the whole reason the control wraps it rather than the other way round.
 */
function TitleHeading({ title }: TitleLadderProps) {
  return (
    <span className="canvas-thing__title-heading" role="heading" aria-level={2}>
      <TitleLadder title={title} />
    </span>
  );
}

interface ContentEditActionsProps {
  /** The Thing's name, which is what an accessible name says (ADR 0083). */
  readonly name: string;
  readonly edit: ThingContentEdit;
}

/**
 * The two ends of an edit running inside the Thing's content, in the rail slot
 * the Edit control had. Close keeps its own slot beside them — it belongs to the
 * Thing rather than to the edit, and a Thing stays closable while one runs.
 *
 * The same `ThingRailAction` as everything else on the rail: same box, same
 * border, same paper and ink, same hover inversion. The key each one spends is
 * stated with `aria-keyshortcuts` and drawn by the body's own shortcut hint,
 * which is where a canvas Thing names a key.
 *
 * `holdFocus` is the one thing these two ask for that the other rail controls
 * do not, and it is asked for because the caret is in the content while the
 * control is on the band: without it the press that activates one is also a
 * focus leaving the writing surface, mid-edit and for a control that may well
 * be Cancel.
 */
function ContentEditActions({ name, edit }: ContentEditActionsProps) {
  return (
    <>
      <ThingRailAction
        holdFocus
        aria-label={`Save Thing ${name}`}
        aria-keyshortcuts="Meta+Enter Control+Enter"
        onClick={edit.onSave}
      >
        <CommitEditIcon data-icon="inline-start" />
      </ThingRailAction>
      <ThingRailAction
        holdFocus
        aria-label={`Cancel editing Thing ${name}`}
        aria-keyshortcuts="Escape"
        onClick={edit.onCancel}
      >
        <AbandonEditIcon data-icon="inline-start" />
      </ThingRailAction>
    </>
  );
}
