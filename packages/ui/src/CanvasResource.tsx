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
  ResourceRailAction,
  ResourceRailActions,
  ResourceRailKindActions,
  ResourceRailSharedActions,
} from './ResourceRailActions';
import { ResourceContentEditProvider, type ResourceContentEdit } from './resource-content-edit';
import {
  SpaceResourceSelectors,
  type CanvasSpaceResourceSelection,
} from './SpaceResourceSelectors';
import { EntityActions, EntityActionsTrigger, type EntityActionGroup } from './EntityActionsMenu';
import { ResourceRail, ResourceRailKind } from './ResourceRail';
import { Card, CardContent, CardTitle } from './components/card';
import {
  AbandonEditIcon,
  CloseResourceIcon,
  CommitEditIcon,
  EditIcon,
  EntityActionsIcon,
  OpenResourceIcon,
} from './icons';
import {
  MarkdownResourceBody,
  type MarkdownResourceBodyEditor,
  type MarkdownResourceBodyProps,
} from './MarkdownResourceBody';
import './canvas-resource.css';
import { usePresence } from './use-presence';
import { InlineTitleEditor } from './InlineTitleEditor';

/**
 * What a Resource front draws beyond its shared Title (ADR 0051): a kind-owned
 * choice, not a kind tag plus an optional field every other kind ignores.
 */
interface CanvasMarkdownResourceFront {
  readonly kind: 'markdown';
  /** The Markdown bytes this Resource owns. */
  readonly source: string;
  /** Request that authored state open or close this Resource. */
  readonly onOpenChange?: (open: boolean) => 'completed' | 'retained';
  /** Put a caret in this Resource's Markdown source. */
  readonly onBeginEdit?: () => void;
}

export type CanvasResourceFront =
  | {
      /** A creation ghost: Markdown treatment without authored content or open state. */
      readonly kind: 'preview';
    }
  | (CanvasMarkdownResourceFront & {
      /** Closed authored state cannot carry a body editor. */
      readonly open: false;
      readonly editor?: never;
      readonly autoFocusEditor?: never;
    })
  | (CanvasMarkdownResourceFront & {
      /** Authored Map state. CanvasResource renders it; it does not own it. */
      readonly open: true;
      /** Present exactly while the Markdown body holds the canvas caret. */
      readonly editor?: CanvasResourceBodyEditor;
      /** Whether a newly supplied body editor takes focus. */
      readonly autoFocusEditor?: boolean;
    })
  | {
      readonly kind: 'reference';
      /** The resolved Target content this Reference Resource displays read-only. */
      readonly target:
        { readonly kind: 'markdown'; readonly source: string } | { readonly kind: 'space' };
      /** Authored Map state; a Reference Resource Opens through the shared Resource operation. */
      readonly open: boolean;
      readonly onOpenChange?: (open: boolean) => 'completed' | 'retained';
    }
  | {
      readonly kind: 'space';
      /** Authored Map state; a Space Resource Opens through the shared Resource operation. */
      readonly open: boolean;
      readonly onOpenChange?: (open: boolean) => 'completed' | 'retained';
      /**
       * What an Open Space Resource offers to author: the target's Maps, the
       * Graphs of the selected one, and this Resource's own selections. Absent while
       * the target Space has not been read yet.
       */
      readonly selection?: CanvasSpaceResourceSelection;
      /**
       * Map and Graph clusters, assembled by the application and inserted
       * at the head of this Resource's rail. Absent while the Resource is closed, the
       * surface is read-only, or the target Space has not been read yet.
       */
      readonly spaceRail?: ReactNode;
      /**
       * The Read/Edit boundary for the embedded target canvas.
       *
       * Absent means this surface does not offer one — a Closed Resource, an unread
       * target, or a composition that has not wired the portal. Present on an Open
       * Space Resource: Read leaves the embedding inert so dragging moves this Resource;
       * Edit activates the target canvas and replaces the control with Done.
       */
      readonly portal?: {
        readonly editing: boolean;
        readonly onEditingChange: (editing: boolean) => void;
      };
    };

/** The two authored operations that end a live Markdown body edit. */
export type CanvasResourceBodyEditor = MarkdownResourceBodyEditor;

/** External visual facts the adapter knows and CanvasResource cannot derive:
 *  React Flow selection, drag and inline-title-editing. Hover and the
 *  selected+hover combination are the Resource's own CSS, driven by real
 *  pointer/focus pseudo-classes rather than a computed React state. */
export type CanvasResourceState = 'rest' | 'selected' | 'dragging' | 'editing';

interface CanvasResourceCommonProps {
  readonly front: CanvasResourceFront;
  /**
   * Where the Resource's command toolbar is drawn, and when.
   *
   * A canvas adapter supplies this to float the toolbar outside the Resource and
   * show it while the Resource is selected — React Flow's `NodeToolbar`, in
   * `ResourceNode`. Absent, the toolbar is drawn in the rail, always shown.
   */
  readonly renderToolbar?: (toolbar: ReactNode) => ReactNode;
  /**
   * Hand focus back to the Resource the adapter renders this front inside. Where an
   * edit ends on a Resource whose toolbar is no longer drawn, there is no Edit
   * control to return to, so focus returns to the Resource instead.
   */
  readonly onReturnFocus?: () => void;
  /** Reports the content-sized title footer in unscaled layout pixels. */
  readonly onBodyHeightChange?: (height: number | null) => void;
  /**
   * A refusal or busy notice from this Resource's context commands, supplied by
   * decoration. Absent or null leaves the alert region unmounted.
   */
  readonly contextNotice?: string | null;
  readonly title: string;
  readonly graphColor: string;
  /**
   * Draw this Resource as content only. Authoring callbacks may still be present in
   * an upstream composition, but this boundary does not expose them as title,
   * open or edit controls while the Resource belongs to a read-only surface.
   */
  readonly readOnly?: boolean;
  /** Present only when activating the displayed Title may begin a rename. */
  readonly onBeginTitleEdit?: () => void;
  /**
   * This Resource's own commands — rename it, copy an address it can be reached by,
   * open it elsewhere — drawn as one more control on the rail.
   *
   * Absent by default, and absent means no control rather than an empty menu:
   * a Resource drawn where none of those commands can run (a creation ghost, a
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
export type CanvasResourceProps = CanvasResourceCommonProps &
  (
    | { readonly state: Exclude<CanvasResourceState, 'editing'> }
    | {
        readonly state: 'editing';
        /** Submit the draft; answers a refusal reason, or `null` when accepted. */
        readonly onCompleteTitleEdit: (title: string) => string | null;
        readonly onCancelTitleEdit: () => void;
        /** Hand focus back to the Resource the adapter renders this front inside. */
        readonly onReturnFocus: () => void;
      }
  );

/**
 * How far a Resource leans while it is being moved.
 *
 * The number lives here and nowhere else. CSS reads it as
 * `--canvas-resource-drag-tilt`, published below. The canvas reads the same
 * number for an embedded canvas this element cannot carry — React Flow
 * renders sub-flow children as DOM siblings of their parent's wrapper.
 * `embedded-map.test.ts` holds that motion as a rigid one.
 */
export const CANVAS_RESOURCE_DRAG_TILT_DEGREES = -1;

/**
 * The CSS custom properties this Resource publishes to `canvas-resource.css`.
 *
 * `CSSProperties` does not type CSS custom properties (`--*`), so the style
 * object is *declared* as the intersection it is actually built as rather than
 * asserted into `CSSProperties` after the fact — the fact is true by
 * construction and needs no claim the compiler cannot check (ADR 0062).
 */
type CanvasResourceStyle = CSSProperties & {
  readonly '--canvas-resource-graph': string;
  readonly '--canvas-resource-drag-tilt': string;
};
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * What the rail's Edit control runs, or `undefined` when the Resource has no such
 * control to draw.
 *
 * On an open Resource it is simply the caret operation the caller supplied. On a
 * **closed** one it is ADR 0064's rule — open the Resource, then place the caret —
 * composed from the Resource's own two existing operations and nothing else.
 * Opening is not reimplemented or approximated here: `onOpenChange` is the same
 * call the Open control makes, so the growth, the neighbours' displacement and
 * the transition are the ones opening always produces.
 *
 * A closed Resource that cannot be opened has no Edit control, because the first
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
 * stylesheet stays the one place the Resource's timing is written. `transition`
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
 * The one visual Resource front shared by the production canvas and its stories.
 *
 * The deep production module for Markdown and Reference Resource fronts, title
 * editing, refusal display and interaction-state visual treatment. React Flow
 * geometry, connection state, selection/drag translation and containment stay
 * with the adapter that renders this component (`@project/react-flow-adapter`
 * `ResourceNode`) — nothing here imports React Flow or reaches into its DOM. Its
 * own visual treatment lives in `canvas-resource.css`, colocated with this module.
 */
export function CanvasResource(props: CanvasResourceProps) {
  const { front, title, graphColor, entityActions, state, readOnly = false } = props;
  /**
   * What this Resource is called wherever it is *named* rather than drawn.
   *
   * The Title's first line (ADR 0083). The visible heading below still draws
   * the whole ladder — that is what the Resource front is for — but every
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
   * creation ghost, which is not a Resource yet and so has no Map to author it
   * on. It is a wider set than `contentFront` because a Space Resource Opens
   * without having any Markdown of its own to reveal: what it shows when it
   * opens is its embedded Map, with selection commands on the rail.
   */
  const openableFront = front.kind === 'preview' ? undefined : front;
  const open = openableFront?.open === true;
  const bodyControl = useRef<HTMLDivElement>(null);
  const contentControl = useRef<HTMLDivElement>(null);
  const contentExitDuration = useCallback(
    () => (contentControl.current === null ? 0 : opacityTransitionMs(contentControl.current)),
    [],
  );
  // Follows the *content* front's openness rather than the Resource's, so a Space
  // Resource opening and closing does not run a presence machine over a document
  // that is never mounted.
  const contentPresence = usePresence(contentFront?.open === true, contentExitDuration);
  const onOpenChange = readOnly ? undefined : openableFront?.onOpenChange;
  const onBeginContentEdit = !readOnly && front.kind === 'markdown' ? front.onBeginEdit : undefined;
  /**
   * The edit running inside the Markdown front this Resource owns.
   *
   * State rather than a second prop because the draft and caret live inside
   * the body. `front.editor` supplies domain completion; the body publishes
   * the Save and Cancel closures for its current draft (`resource-content-edit.ts`).
   */
  const [contentEdit, setContentEdit] = useState<ResourceContentEdit | null>(null);
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
  const style: CanvasResourceStyle = {
    '--canvas-resource-graph': graphColor,
    '--canvas-resource-drag-tilt': `${CANVAS_RESOURCE_DRAG_TILT_DEGREES}deg`,
  };
  const markdownBodyProps: Mutable<
    Pick<MarkdownResourceBodyProps, 'onBeginEdit' | 'editor' | 'autoFocus'>
  > = {};
  // A click on an unselected Resource selects it, as a click on any React Flow node
  // does; editing its Markdown is the next click, or the Edit command (ADR 0102).
  // So the body's edit target is offered only once the Resource is selected.
  if (onBeginContentEdit !== undefined && state === 'selected') {
    markdownBodyProps.onBeginEdit = onBeginContentEdit;
  }
  if (!readOnly && front.kind === 'markdown' && front.editor !== undefined) {
    markdownBodyProps.editor = front.editor;
  }
  if (!readOnly && front.kind === 'markdown' && front.autoFocusEditor !== undefined) {
    markdownBodyProps.autoFocus = front.autoFocusEditor;
  }

  const returnFocus = props.onReturnFocus;
  useLayoutEffect(() => {
    if (contentEditingWas.current && contentEdit === null) {
      if (editControl.current !== null) editControl.current.focus();
      else returnFocus?.();
    }
    contentEditingWas.current = contentEdit !== null;
  }, [contentEdit, returnFocus]);

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

  // An Open Resource's front already says what it is, so its kind is not drawn.
  const kindMark = open ? null : <ResourceRailKind kind={visualKind} />;
  const toolbar = showActions ? (
    // ADR 0073. One tab stop for the whole rail, arrows between its
    // controls: a canvas carries many Resources and a Resource's rail carries
    // several commands, so a control apiece would put the Resources
    // themselves out of reach behind their own actions. The keyboard
    // contract, the shared control treatment and the canvas suppression
    // every one of these needs are `ResourceRailActions`' and
    // `ResourceRailAction`'s; what is left here is which commands this Resource
    // has, and what each one runs.
    //
    // The two groups are the answer to "whose command is this?". Editing
    // this Resource's Markdown is the Markdown front's business and means
    // nothing on another kind; opening and closing is every Resource's.
    //
    // The entity actions lead, then a Space Resource's choices, the content-edit
    // commands, and Open/Close last.
    <ResourceRailActions
      aria-label={`Resource ${name}`}
      className="canvas-resource__actions"
      data-testid="canvas-resource-actions"
    >
      {actionableEntityActions && (
        <EntityActionsTrigger
          groups={entityActions}
          label={`Actions for Resource ${name}`}
          icon={<EntityActionsIcon />}
          render={<ResourceRailAction />}
        />
      )}
      {spaceSelection !== undefined && (
        <SpaceResourceSelectors {...spaceSelection} onReport={setContextNotice} />
      )}
      {spaceRail}
      <ResourceRailKindActions kind={visualKind}>
        {visibleContentEdit !== null ? (
          <ContentEditActions name={name} edit={visibleContentEdit} />
        ) : beginContentEdit !== undefined ? (
          <ResourceRailAction
            ref={editControl}
            aria-label={`Edit Resource ${name}`}
            onClick={beginContentEdit}
          >
            <EditIcon data-icon="inline-start" />
          </ResourceRailAction>
        ) : portal !== undefined ? (
          portalEditing ? (
            <ResourceRailAction
              ref={editControl}
              aria-label={`Done Resource ${name}`}
              onClick={() => portal.onEditingChange(false)}
            >
              <CommitEditIcon data-icon="inline-start" />
            </ResourceRailAction>
          ) : (
            <ResourceRailAction
              ref={editControl}
              aria-label={`Edit Resource ${name}`}
              onClick={() => portal.onEditingChange(true)}
            >
              <EditIcon data-icon="inline-start" />
            </ResourceRailAction>
          )
        ) : null}
      </ResourceRailKindActions>
      <ResourceRailSharedActions>
        {onOpenChange !== undefined && (
          <ResourceRailAction
            aria-label={`${open ? 'Close' : 'Open'} Resource ${name}`}
            // Closing mid-edit would drop the Resource's box out from under a
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
              <CloseResourceIcon data-icon="inline-start" />
            ) : (
              <OpenResourceIcon data-icon="inline-start" />
            )}
          </ResourceRailAction>
        )}
      </ResourceRailSharedActions>
    </ResourceRailActions>
  ) : null;
  const rail = (
    <ResourceRail className="canvas-resource__rail">
      {props.renderToolbar === undefined ? toolbar : null}
      {kindMark}
    </ResourceRail>
  );

  const resource = (
    <Card
      role="article"
      aria-label={name}
      className="canvas-resource"
      data-testid="resource"
      data-kind={visualKind}
      data-content-kind={front.kind === 'reference' ? front.target.kind : visualKind}
      data-state={state}
      // Exposes authored state for the Resource's public treatment and evidence.
      // The React Flow wrapper owns the moving rect, while the Markdown Title's
      // layout remains invariant; no wall-clock presentation state is allowed
      // to become a second expansion fact and move the Title mid-close.
      data-expanded={open}
      // The rail is normally revealed with the Resource and hidden again at rest.
      // A running edit is not a hover, so the controls that end it are read off
      // this instead — an author writing in the body must be able to see the way
      // out without going looking for it with the pointer.
      data-content-editing={visibleContentEdit !== null || portalEditing}
      style={style}
    >
      {/* Neutral: the band carries no colour and the commands on it sit on the
          shared command surface (`.scratch/command-dock/issues/12`). The Graph's
          colour is still on this Resource — `--canvas-resource-graph` below draws the
          Title's own hover and caret treatment — and still on the handles and
          Edges the adapter draws around it. */}
      {rail}
      {props.renderToolbar?.(toolbar)}
      <CardContent ref={bodyControl} className="canvas-resource__body">
        {state === 'editing' && !readOnly ? (
          <InlineTitleEditor
            title={title}
            label="Resource title"
            variant="resource"
            // A Resource's Title is Title Lines (ADR 0083), and the Resource front is
            // the one surface that draws them, so the Resource front is where the
            // capability is asked for.
            multiline
            onComplete={props.onCompleteTitleEdit}
            onCancel={props.onCancelTitleEdit}
            onReturnFocus={props.onReturnFocus}
          />
        ) : (
          <CardTitle
            className="canvas-resource__title"
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
                className="canvas-resource__title-control nodrag nopan"
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
        {/* Withheld while the Resource is read-only for the same reason every other
            authoring affordance is — a read-only surface draws what the Resource
            shows, not what could be changed about it. */}
        {front.kind === 'space' &&
          front.open &&
          !readOnly &&
          spaceSelection === undefined &&
          spaceRail === undefined && (
            <p className="canvas-resource__space-note">Reading the referenced Space…</p>
          )}
        {contextNotice !== null && (
          <p role="status" className="canvas-resource__space-note">
            {contextNotice}
          </p>
        )}
      </CardContent>
      {/* A sibling of the Title's body rather than a child of it. The body is
          inset so a Title sits off the Resource's border; a writing surface brings
          its own gutter and padding and has to reach the paper's edges, and
          nesting it would draw one inset inside another. */}
      {contentFront !== undefined && contentPresence.mounted && (
        <div
          ref={contentControl}
          className="canvas-resource__content"
          data-presence={contentPresence.state}
        >
          <ResourceContentEditProvider value={setContentEdit}>
            <MarkdownResourceBody
              source={contentFront.source}
              ariaLabel={`Markdown source of ${name}`}
              {...markdownBodyProps}
            />
          </ResourceContentEditProvider>
        </div>
      )}
    </Card>
  );
  return actionableEntityActions ? (
    <EntityActions groups={entityActions} render={resource} />
  ) : (
    resource
  );
}

interface TitleLadderProps {
  readonly title: string;
}

/**
 * A Resource's Title drawn as its Title Lines (ADR 0083).
 *
 * The Resource front is the only surface that draws the ladder — everywhere else
 * shows the name, which is the first line — and it draws it identically whether
 * the Resource is Open or Closed and whatever kind the Resource is. A Title that
 * changed shape on Opening would teach an author that Opening edits it.
 *
 * Each line is **its own block element carrying its role**, and that is the
 * whole of the structure: the roles come from `titleLines`, which is where the
 * domain settles what an author's second line means, and the type ladder,
 * clamping and colour come from `canvas-resource.css`. Nothing here reads a
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
        <span key={index} className="canvas-resource__title-line" data-role={line.role}>
          {line.text}
        </span>
      ))}
    </>
  );
}

/**
 * The Resource's Title Lines, as the one heading the Resource front draws.
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
    <span className="canvas-resource__title-heading" role="heading" aria-level={2}>
      <TitleLadder title={title} />
    </span>
  );
}

interface ContentEditActionsProps {
  /** The Resource's name, which is what an accessible name says (ADR 0083). */
  readonly name: string;
  readonly edit: ResourceContentEdit;
}

/**
 * The two ends of an edit running inside the Resource's content, in the rail slot
 * the Edit control had. Close keeps its own slot beside them — it belongs to the
 * Resource rather than to the edit, and a Resource stays closable while one runs.
 *
 * The same `ResourceRailAction` as everything else on the rail: same box, same
 * border, same paper and ink, same hover inversion. The key each one spends is
 * stated with `aria-keyshortcuts` and drawn by the body's own shortcut hint,
 * which is where a canvas Resource names a key.
 *
 * `holdFocus` is the one behaviour these two ask for that the other rail controls
 * do not, and it is asked for because the caret is in the content while the
 * control is on the band: without it the press that activates one is also a
 * focus leaving the writing surface, mid-edit and for a control that may well
 * be Cancel.
 */
function ContentEditActions({ name, edit }: ContentEditActionsProps) {
  return (
    <>
      <ResourceRailAction
        holdFocus
        aria-label={`Save Resource ${name}`}
        aria-keyshortcuts="Meta+Enter Control+Enter"
        onClick={edit.onSave}
      >
        <CommitEditIcon data-icon="inline-start" />
      </ResourceRailAction>
      <ResourceRailAction
        holdFocus
        aria-label={`Cancel editing Resource ${name}`}
        aria-keyshortcuts="Escape"
        onClick={edit.onCancel}
      >
        <AbandonEditIcon data-icon="inline-start" />
      </ResourceRailAction>
    </>
  );
}
