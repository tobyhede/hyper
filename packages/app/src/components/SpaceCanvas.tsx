import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Background,
  ReactFlow,
  type Edge,
  type IsValidConnection,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  type ReactFlowProps,
  type OnEdgesChange,
  type OnNodesChange,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import {
  titleName,
  uuidSchema,
  type Thing,
  type ThingId,
  type Graph,
  type GraphId,
} from '@project/core';
import type { SpaceSession } from '@project/persistence';
import { CANVAS_THING_DRAG_TILT_DEGREES, type EntityActionGroup } from '@project/ui';
import {
  nodeTypes,
  GraphConnectionLine,
  GraphHud,
  ZoomSlider,
  type ThingFlowNode,
} from '@project/react-flow-adapter';
import { activeGraphColor } from '../colors';
import { describeAuthoringRefusal } from '../authoring-refusal';
import type { AuthoringAvailability } from '../authoring-availability';
import { useCanvasThingAuthoring } from '../canvas-thing-authoring';
import type { SpaceThingTargets } from '../space-thing-targets';
import { useEdgeAuthoring } from '../edge-authoring-react';
import type { EdgeAuthoring } from '../edge-authoring';
import type { CanvasSelection, ThingResize, EdgeSubject } from '../render-adapter';
import type { SpaceAuthoring } from '../space-authoring';
import { MAX_ZOOM, OVERVIEW_FIT } from '../camera';
import { THING_SIZE } from '../thing';
import { THING_DRAG_TYPE } from './ThingsPopover';
import { OverviewCamera, PresentingCamera, OpeningFramingCamera } from './cameras';
import {
  canvasNodeConnection,
  clipEmbeddedNode,
  embeddedClipId,
  parseEmbeddedNodeId,
} from '../embedded-diagram';
import {
  embeddedAuthoringEnabled,
  editingPortalAncestor,
  embeddingIsPortalEditing,
} from '../embedded-open-space-thing';
import { useEmbeddedOpenSpaceThings } from '../use-embedded-open-space-things';
import { useOpenSpaces } from '../open-spaces-context';
import { EmbeddedDiagramAuthoring } from './EmbeddedDiagramAuthoring';
import type { Continuation } from '../continuation';
import {
  framingFromFit,
  panFraming,
  zoomFraming,
  type SpaceThingFraming,
} from '../space-thing-framing';

/**
 * What the graph tells assistive technology it can do.
 *
 * React Flow's defaults describe its own local deletion. Hyper instead routes
 * both Things and Edges through the completed Space Edit lifecycle, so these
 * labels describe the application-owned commands rather than a local array
 * mutation.
 *
 * Both node keys are set because React Flow picks between them on
 * `disableKeyboardA11y`, and the one it names `keyboardDisabled` is the one an
 * ordinary keyboard-enabled graph gets.
 */
const ARIA_LABEL_CONFIG = {
  'node.a11yDescription.default':
    'Press enter or space to open a Thing, backspace or delete to remove it from this Diagram, the arrow keys to move it, and escape to cancel.',
  'node.a11yDescription.keyboardDisabled':
    'Press enter or space to open a Thing, backspace or delete to remove it from this Diagram, the arrow keys to move it, and escape to cancel.',
  'edge.a11yDescription.default':
    'Press backspace or delete to remove this Edge from its Graph, or escape to deselect it.',
} as const;

/** A pending placement keeps Things readable without advertising authored gestures. */
const PENDING_ARIA_LABEL_CONFIG = {
  ...ARIA_LABEL_CONFIG,
  'node.a11yDescription.default': 'This Thing is unavailable while placement is pending.',
  'node.a11yDescription.keyboardDisabled': 'This Thing is unavailable while placement is pending.',
} as const;

/**
 * The one unmodified authoring shortcut, named where it is bound.
 *
 * Exported so the control that announces it to a screen reader takes the key
 * from the handler that answers it rather than from a literal beside it: the
 * announcement and the binding are one fact, and two copies of it can drift
 * without anything failing.
 */
export const ADD_THING_KEY = 'C';

const subscribeToNothing = (): (() => void) => () => undefined;

/**
 * Where an unmodified letter is somebody else's, not the canvas's command.
 *
 * One selector for both shortcuts, because the two answers have to agree: `C`
 * and `F2` are pressed on the same tree, and a control missing from one list and
 * present in the other makes the same element a command target for one key and
 * not for the other. They disagreed — `C` named only text entry — and the canvas
 * zoom controls render *inside* the wrapper both are bound to, so a `c` with
 * Zoom in focused added a Thing.
 *
 * `button` and `select` are here for a different reason from `input`,
 * `textarea` and `contenteditable`: those are places an author is typing the
 * letter, while a button is a control with a keyboard model of its own that the
 * canvas must not shadow. Both are cases where the key was not aimed here.
 *
 * **`.nokey` is the first entry and the load-bearing one.** Every portalled and
 * chrome surface in the tree already marks itself with it for React Flow's own
 * `useKeyPress` subscriptions, whose `isInputDOMNode` walks `closest('.nokey')`.
 * Reading the same marker is what stops this list drifting into a second,
 * hand-maintained copy of an exclusion the components already declare: a
 * surface has to opt out once, not once per listener. The roles below stay for
 * the surfaces that carry no marker of their own — `ThingSearchCombobox`'s popup
 * is `role="presentation"`, not `dialog`, because its input sits outside the
 * popup, so the marker rather than a role is what covers it.
 *
 * `[data-sidebar]` used to close the list: the registry `Sidebar` was the app's
 * chrome and set that attribute on every part of itself. It went with ADR 0082,
 * and the Command Dock that replaced it marks itself `.nokey` like every other
 * chrome surface — so the entry was covering nothing and has gone rather than
 * standing as a guard against a component the tree no longer contains.
 */
const NOT_A_CANVAS_COMMAND =
  '.nokey, input, textarea, select, button, [contenteditable="true"], [role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"]';

/**
 * The Thing a key came from, or `null` if it came from anywhere else.
 *
 * Answered from the projection rather than from the DOM id alone, which is what
 * keeps a second canvas's node — a story, a catalogue page — from naming a Thing
 * this Diagram is not drawing.
 */
const focusedThing = (target: Element, nodes: readonly ThingFlowNode[]): ThingId | null => {
  const element = target.closest<HTMLElement>('.react-flow__node[data-id]');
  if (element === null) return null;
  const id = element.dataset['id'];
  return nodes.find((node) => node.id === id)?.data.thingId ?? null;
};

export interface SpaceCanvasProps {
  readonly continuation: Continuation;
  nodes: ThingFlowNode[];
  edges: Edge[];
  /** The next projection, merged in by a completed connection so its Edge draws. */
  projectedNodes: readonly ThingFlowNode[] | null;
  /** The Thing the traversal has reached, or `null` in overview. */
  activeThingId: string | null;
  /**
   * That a traversal is running — the Navigation mode, not an availability
   * answer. Two things read it, and neither is an authoring operation: the
   * camera that returns to the overview when the traversal ends (ADR 0027), and
   * the click that resumes an embedded read of a Space that has been Exited,
   * which nothing edits. What presenting *withdraws* from authoring is
   * `availability`'s to say.
   */
  presenting: boolean;
  /**
   * That the selected Diagram's placement has resolved and the store has taken
   * it — the fact, not an operation, and read by one thing: the aria
   * description React Flow gives every node.
   *
   * It is here rather than folded into `availability` because that description
   * is a *statement about the placement* and its withheld form says so in
   * words: "This Thing is unavailable while placement is pending." Any
   * availability answer would make it false somewhere — `connectOnCanvas`
   * announces "pending" over a placement that resolved long ago the moment an
   * author begins an inline Diagram rename on the Dock, which is a lie told
   * to exactly the readers who depend on it, and told while the canvas behind
   * that rename is fully reachable (nothing about a chrome rename covers the
   * graph or traps focus).
   *
   * So it is named for the fact rather than for a control, and it is not a
   * reinstatement of any withdrawal term: nothing that decides what may be
   * *authored* reads it.
   */
  placementReady: boolean;
  /**
   * What may be authored right now, answered once for the whole application.
   *
   * Every withdrawal on this canvas is one of these answers rather than a
   * recombination of the facts behind them, so the canvas and the Space's
   * command surface cannot disagree about an operation they both offer
   * (`CONTEXT.md`, Availability).
   */
  availability: AuthoringAvailability;
  onNodesChange: OnNodesChange<ThingFlowNode>;
  onEdgesChange: OnEdgesChange;
  /** The whole Edge interaction lifecycle, which this canvas composes rather than interprets. */
  edgeAuthoring: EdgeAuthoring;
  selection: CanvasSelection;
  onSelectThing: (thingId: ThingId) => void;
  onSelectEdge: (subject: EdgeSubject) => void;
  /** The Things this Diagram places — what an Edge picker may offer. */
  placedThings: readonly Thing[];
  /** Exact neutral title shown by the transient empty-drop preview. */
  newThingTitle: string;
  /**
   * Create a detached Thing at the visible centre — the graph-focused `C`, whose
   * toolbar twin lives outside this component.
   */
  onAddThing: () => void;
  /** Complete an external Things View drop at an authored top-left anchor. */
  onAddExistingThing: (
    thingId: ThingId,
    anchor: { readonly x: number; readonly y: number },
  ) => void;
  /**
   * The Thing a completed creation asks to be named, or `null`.
   *
   * The identity, not a flag: each creation mints a fresh one, so a *change* is
   * what says a Thing has just been created — which is how the naming
   * continuation survives being a prop rather than a command. A remount takes
   * nothing with it, because the initial state is whatever arrives with it.
   */
  nameOnCreation: string | null;
  authoring: SpaceAuthoring;
  spaceSession: SpaceSession;
  /**
   * Whether a content edit is running, for the one control outside this canvas
   * that has to know: Present.
   *
   * Presenting replaces the Thing with its content rather than drawing content on
   * it, so an editor cannot survive it and the draft would go with no exit
   * spent. The caret stays this component's (`spec.md` §6) — what leaves is the
   * one bit a sibling surface needs to stay out of the way.
   */
  onBodyEditingChange?: (editing: boolean) => void;
  /** Reports the Thing title draft so sibling naming surfaces stay withdrawn. */
  onTitleEditingChange?: (editing: boolean) => void;
  thingResize: ThingResize;
  /**
   * Report whether some embedded Diagram on this canvas is running a Thing edit.
   *
   * The one availability fact that is produced *inside* this subtree: an
   * embedded Diagram publishes its live edits from within React Flow, so nothing
   * above can see one without being told. It goes into the render adapter
   * rather than up a chain of `useState` because that store re-renders the
   * Space's command surface and this canvas together, and the answer derived
   * from it comes back down as `availability.authorOnCanvas` — one answer, not
   * a term recombined here (`authoring-availability.ts`).
   */
  reportEmbeddedDiagramEditing: (editing: boolean) => void;
  graphs: readonly Graph[];
  colorByGraphId: Readonly<Record<string, string>>;
  activeGraphId: GraphId | null;
  activeGraphThingIds: ReadonlySet<string>;
  /** What each Space Thing's target offers it, for the Things of kind `space` on this canvas. */
  spaceThingTargets?: SpaceThingTargets;
  /**
   * What commands each Thing on this canvas offers — copy an address, delete it
   * — drawn on the Thing's own rail (ADR 0073).
   *
   * Passed straight through to `useCanvasThingAuthoring`, which is where every
   * other per-Thing operation is attached. Absent on a canvas whose Things have
   * no such commands to run, which is how an embedded Diagram draws none.
   *
   * A command list is built afresh on every render of the composition that owns
   * it — an address and an Edit both read state that has just changed — so this
   * widens the measured exception below from "the node wrappers rebuild
   * whenever `nodes` changes identity" to "whenever this canvas renders".
   * Correctness is unaffected, and closing it is the same per-node cache that
   * note already names.
   */
  thingEntityActions?: (thingId: ThingId) => readonly EntityActionGroup[];
}

export function SpaceCanvas({
  continuation,
  nodes,
  edges,
  projectedNodes,
  activeThingId,
  presenting,
  placementReady,
  availability,
  onNodesChange,
  onEdgesChange,
  edgeAuthoring,
  selection,
  onSelectThing,
  onSelectEdge,
  placedThings,
  newThingTitle,
  onAddThing,
  onAddExistingThing,
  nameOnCreation,
  authoring,
  spaceSession,
  onBodyEditingChange,
  onTitleEditingChange,
  thingResize,
  reportEmbeddedDiagramEditing,
  graphs,
  colorByGraphId,
  activeGraphId,
  activeGraphThingIds,
  spaceThingTargets,
  thingEntityActions,
}: SpaceCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  const spaces = useOpenSpaces();
  const thisSpaceId = spaceSession.getState().working.id;
  const activeSpaceId = useSyncExternalStore(spaces?.subscribe ?? subscribeToNothing, () =>
    spaces === null ? null : spaces.getState().activeSpaceId,
  );
  const readThisCanvasOpeningFraming = (): SpaceThingFraming | undefined => {
    if (spaces === null) return undefined;
    const entry = spaces.entry(thisSpaceId);
    return entry === undefined ? undefined : spaces.openingFraming(entry);
  };
  const [openingFraming, setOpeningFraming] = useState(() =>
    spaces?.getState().activeSpaceId !== thisSpaceId ? undefined : readThisCanvasOpeningFraming(),
  );
  const [seededOpeningFraming, setSeededOpeningFraming] = useState(
    () => spaces?.getState().activeSpaceId === thisSpaceId || spaces === null,
  );
  if (!seededOpeningFraming && activeSpaceId === thisSpaceId) {
    setSeededOpeningFraming(true);
    setOpeningFraming(readThisCanvasOpeningFraming());
  }
  /**
   * The Things a gesture is moving, read from React Flow's own store.
   *
   * Two other sources look right and are not. A node's `dragging` flag in this
   * canvas's projection is wiped whenever the adapter republishes — `reconcile`
   * rebuilds each node from `canvasProjection` and splices back only the live
   * position — so it is absent for most frames of a drag. The adapter's
   * `dragOrigins` *is* durable, but it is populated from the first `position`
   * change React Flow reports, which arrives a frame after React Flow has
   * already moved the Thing: the frame would lean one frame before the canvas
   * inside it. This is the same store the moving Thing is drawn from, so the
   * two cannot disagree.
   */
  const draggingKey = useStore((flow) =>
    [...flow.nodeLookup.values()]
      .filter((node) => node.dragging === true)
      .map((node) => node.id)
      .sort()
      .join(' '),
  );
  const draggingIds = useMemo(
    () => new Set(draggingKey === '' ? [] : draggingKey.split(' ')),
    [draggingKey],
  );
  const {
    embeddedRequests,
    embeddedPublications,
    embeddedFailures,
    resumeEmbedded,
    publishEmbedded,
    reportBodyHeight,
    editingPortals,
    onPortalEditingChange,
    portalDraft,
    setPortalDraft,
  } = useEmbeddedOpenSpaceThings(nodes, spaces, draggingIds);

  const editingEmbeddingIds = new Set(
    embeddedRequests.flatMap((request) => {
      const value = embeddedPublications.get(request.parent.id);
      return value !== undefined &&
        request.entry === value.entry &&
        value.diagramId === request.diagramId &&
        (value.bodyEditing || value.titleEditing)
        ? [request.parent.id]
        : [];
    }),
  );
  /**
   * The one availability fact this subtree produces, on its way to the module
   * that answers with it.
   *
   * *Whether* an embedding is editing is the fact; *which* one stays here, in
   * the Set above, because it is a question about a Thing of this canvas rather
   * than about what is in progress. A layout effect rather than an ordinary
   * one: the answer comes back through the store in the same commit, so no
   * frame is painted with authoring still offered over a live embedded edit.
   *
   * Every reason the answers carry lives in `authoring-availability.ts`, beside
   * the answer it governs — including why the Edge lifecycle reads
   * `authorOnCanvas` rather than the shorter rule it once had, and why a
   * connection is reachable on the presented Thing that `authorOnCanvas`
   * withdraws.
   */
  const embeddedEditing = editingEmbeddingIds.size > 0;
  useLayoutEffect(() => {
    reportEmbeddedDiagramEditing(embeddedEditing);
    return () => reportEmbeddedDiagramEditing(false);
  }, [embeddedEditing, reportEmbeddedDiagramEditing]);
  const thingAuthoring = useCanvasThingAuthoring({
    continuation,
    nodes,
    availability,
    nameOnCreation,
    authoring,
    spaceSession,
    thingResize,
    onSelectThing,
    spaceThingTargets,
    thingEntityActions,
    portalEditing: editingPortals,
    onPortalEditingChange,
  });
  const {
    bodyEditing,
    openThing: onOpenThing,
    beginTitleEditing,
    completeSpaceThingFraming,
  } = thingAuthoring;

  const embeddedBodyEditing = embeddedRequests.some(
    (request) =>
      editingEmbeddingIds.has(request.parent.id) &&
      embeddedPublications.get(request.parent.id)?.bodyEditing === true,
  );
  const embeddedTitleEditing = embeddedRequests.some(
    (request) =>
      editingEmbeddingIds.has(request.parent.id) &&
      embeddedPublications.get(request.parent.id)?.titleEditing === true,
  );
  useEffect(() => {
    onBodyEditingChange?.(bodyEditing || embeddedBodyEditing);
  }, [bodyEditing, embeddedBodyEditing, onBodyEditingChange]);
  useEffect(() => {
    onTitleEditingChange?.(thingAuthoring.titleEditing || embeddedTitleEditing);
    return () => onTitleEditingChange?.(false);
  }, [thingAuthoring.titleEditing, embeddedTitleEditing, onTitleEditingChange]);
  const liveEmbeddings = useMemo(
    () =>
      embeddedRequests.flatMap((request) => {
        const value = embeddedPublications.get(request.parent.id);
        if (value?.diagramId !== request.diagramId) return [];
        if (request.entry === value.entry) return [value];
        return [
          {
            ...value,
            changeNodes: () => undefined,
            // The three Thing commands aimed at a retained read answer it the
            // same way: reopen the target's session so the next press acts.
            // The canvas still announces that delete removes the focused Thing
            // from its Diagram, and this drawing is still focusable, so an
            // answer of `null` alone consumed the key and did nothing at all.
            // There is no refusal to report either — the target is not open,
            // which is a state this press ends rather than a refused Edit.
            removeThing: () => {
              void resumeEmbedded(request.spaceId);
              return null;
            },
            nodes: value.nodes.map((node): ThingFlowNode => ({
              ...clipEmbeddedNode(node, request.bounds),
              draggable: false,
              data: {
                ...node.data,
                readOnly: true,
                onEditThing: () => {
                  void resumeEmbedded(request.spaceId);
                  return 'retained';
                },
                onBeginTitleEditing: () => {
                  void resumeEmbedded(request.spaceId);
                },
              },
            })),
          },
        ];
      }),
    [embeddedRequests, embeddedPublications, resumeEmbedded],
  );

  const embedConnectFrom = useRef<{ parentId: string; from: ThingId } | null>(null);
  const mayOfferEmbedded = useCallback(
    (thingId: ThingId) => {
      const session = embedConnectFrom.current;
      if (session === null) return false;
      return (
        embeddedPublications.get(session.parentId)?.mayConnectThings(session.from, thingId) === true
      );
    },
    [embeddedPublications],
  );
  const edgeSurface = useEdgeAuthoring({
    authoring: edgeAuthoring,
    edges,
    projectedNodes,
    selection,
    activeGraphId,
    graphs,
    placedThings,
    newThingTitle,
    enabled: availability.authorOnCanvas,
    onSelectEdge,
    mayOfferAlso: mayOfferEmbedded,
  });

  // Every handler and object below is memoized because React Flow's own docs
  // carry a warning about it: props recreated each render can drive it into a
  // re-render loop.
  //
  // `editableNodes` is the known exception, and memoized does not mean cheap
  // there: it rebuilds every node's wrapper whenever `nodes` changes identity,
  // which a drag does per frame, so React Flow's per-node
  // `userNode === internals.userNode` fast path misses and all of them re-render
  // rather than the one being dragged. Correctness is unaffected. Closing it
  // needs a per-node cache or the callbacks moved into context — more machinery
  // than a ten-Thing fixture asks for, so read it as a measured exception rather
  // than an oversight.

  // No pointer gesture on a Thing's body opens it (ADR 0036). A click is left to
  // React Flow, which selects; the Title is its own one-activation control
  // (ADR 0065), whose events stop before this canvas handler. Opening is the
  // affordance and the Thing-level keyboard command.

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!availability.authorOnCanvas || !(event.target instanceof Element)) return;
      if (event.key === 'Enter' || event.key === ' ') {
        if (bodyEditing) return;
        // The same exclusion the `C` branch below makes, and now load-bearing
        // rather than defensive: an Expanded Thing draws its editor *inside* the
        // node, so a Space typed into it would otherwise be cancelled here
        // before the document ever received the character.
        if (event.target.closest(NOT_A_CANVAS_COMMAND) !== null) return;
        const thing = event.target.closest<HTMLElement>('.react-flow__node[data-id]');
        if (thing === null || !event.currentTarget.contains(thing)) return;
        const thingId = thing.dataset['id'];
        if (thingId === undefined) return;
        event.preventDefault();
        const embedded = liveEmbeddings
          .flatMap((value) => value.nodes)
          .find((node) => node.id === thingId);
        if (embedded === undefined) onOpenThing(thingId);
        else embedded.data.onEditThing?.(true);
        return;
      }
      // `C` adds a Thing, and it is the only unmodified authoring shortcut there
      // is. Answered here rather than on the window, so "graph focused" is a
      // fact about where the event came from rather than a guess: this handler
      // sits on React Flow's own wrapper, so a key pressed in the toolbar, in a
      // pane over the graph or in the Things View never reaches it.
      //
      // Three exclusions, and each names a different way the key is not a
      // command. A modifier makes it a browser or OS shortcut. A repeat is one
      // press held down, and a command runs once per press. And a text control
      // is somewhere the author is *typing* a c — the inline title editor stops
      // its own key events before they get here, so this covers whatever text
      // entry the canvas gains next rather than a case that exists today.
      if (event.key.toUpperCase() !== ADD_THING_KEY) return;
      // `shiftKey` belongs here for a reason the others do not share: matching
      // case-insensitively is what lets Caps Lock work, and it lets Shift
      // through in the same breath, since both arrive as `C`. Only the flag
      // tells them apart — Caps Lock changes the character and never sets it.
      // Without this the toolbar announces `aria-keyshortcuts="C"`, which ARIA
      // defines as the unmodified key, while the canvas answers Shift+C too.
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.target.closest(NOT_A_CANVAS_COMMAND) !== null) return;
      // The default is prevented only where the command can actually run
      // (`docs/agents/rendering.md`'s keyboard contract), so a `c` typed while authoring is
      // withdrawn is left to whatever else would have had it. The guard at the
      // top of this handler is the other half of that: it is `authorOnCanvas`
      // rather than the mode alone, so every branch below is already behind it.
      if (bodyEditing) return;
      event.preventDefault();
      onAddThing();
    },
    [onOpenThing, availability.authorOnCanvas, bodyEditing, onAddThing, liveEmbeddings],
  );

  // `F2` renames the selected Thing, and this is the *only* handler that answers
  // it. A React Flow `onKeyDown` branch used to answer it first and ask nothing
  // about the target, so the key typed into a control renamed whichever Thing
  // happened to be selected — a different one, once focus had moved. Two
  // handlers for one key means one of them is the unguarded one; don't add a
  // second back.
  useLayoutEffect(() => {
    if (!availability.authorOnCanvas || bodyEditing) return;
    const beginSelectedTitleEdit = (event: KeyboardEvent): void => {
      if (event.key !== 'F2') return;
      if (event.target instanceof Element && event.target.closest(NOT_A_CANVAS_COMMAND) !== null) {
        return;
      }
      const embedded = liveEmbeddings.flatMap((value) => value.nodes).find((node) => node.selected);
      if (embedded !== undefined) {
        event.preventDefault();
        embedded.data.onBeginTitleEditing?.();
        return;
      }
      const selected = nodes.find((node) => node.selected);
      if (selected === undefined) return;
      event.preventDefault();
      beginTitleEditing(selected.id);
    };
    window.addEventListener('keydown', beginSelectedTitleEdit);
    return () => window.removeEventListener('keydown', beginSelectedTitleEdit);
  }, [availability.authorOnCanvas, bodyEditing, nodes, beginTitleEditing, liveEmbeddings]);

  // The operations, not the surface holding them: `useEdgeAuthoring` answers a
  // fresh object literal per render while each of these is stable, and a hook
  // that depended on the object would be rebuilt every time.
  const deleteEdges = edgeSurface.deleteEdges;
  const editableNodes = thingAuthoring.nodes;
  /**
   * The canvas React Flow draws: this Space's Things, then the Diagrams its
   * Open Space Things embed (ADR 0068).
   *
   * Concatenated here and nowhere earlier. React Flow requires a parent to be
   * declared before its children, which appending satisfies for free; and every
   * rule above — deletion, the title-editing selection, focus, Edge authoring —
   * is written over this Space's own Things, so an embedded node mixed into
   * `editableNodes` would put another Space's Thing inside each of them.
   */
  const canvasNodes = useMemo(
    () =>
      [...editableNodes, ...liveEmbeddings.flatMap((value) => value.nodes)].map((node) => {
        const withHeight =
          node.data.spaceContent === undefined
            ? node
            : {
                ...node,
                data: { ...node.data, onBodyHeightChange: reportBodyHeight },
              };
        if (!editingPortals.has(withHeight.data.thingId) || withHeight.data.kind !== 'space') {
          return withHeight;
        }
        // `nopan` only: an Open Thing does not take `nowheel` (ADR 0064).
        // Portal wheel is the capture listener below;
        // `space-thing-embedded-diagram.test.tsx` ('does not put nowheel on an
        // Open Space Thing in portal Edit, and wheel still authors its framing')
        // holds both that class and that the wheel still frames.
        const classes = [withHeight.className, 'nopan'].filter(
          (value): value is string => value !== undefined && value !== '',
        );
        return {
          ...withHeight,
          draggable: false,
          className: classes.join(' '),
        };
      }),
    [editableNodes, liveEmbeddings, reportBodyHeight, editingPortals],
  );
  const portalNodesById = useMemo(() => {
    const map = new Map<string, ThingFlowNode>();
    for (const node of nodes) map.set(node.id, node);
    for (const value of liveEmbeddings) {
      for (const child of value.nodes) map.set(child.id, child);
    }
    return map;
  }, [nodes, liveEmbeddings]);
  const canvasEdges = useMemo(
    () => [...edgeSurface.edges, ...liveEmbeddings.flatMap((value) => value.edges)],
    [edgeSurface.edges, liveEmbeddings],
  );
  const changeCanvasNodes: OnNodesChange<ThingFlowNode> = useCallback(
    (changes) => {
      onNodesChange(changes);
      for (const value of liveEmbeddings) value.changeNodes(changes);
    },
    [onNodesChange, liveEmbeddings],
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const portalGestureSnapshot = useRef({
    editingPortals,
    portalNodesById,
    portalDraft,
    embeddedPublications,
    embeddedRequests,
    completeSpaceThingFraming,
    screenToFlowPosition,
    authorOnCanvas: availability.authorOnCanvas,
  });
  // Native pointer and wheel events can arrive after commit but before
  // passive effects. Refresh in the synchronous commit phase so the stable
  // listener cannot pan or zoom from the previous gesture-session snapshot.
  useLayoutEffect(() => {
    portalGestureSnapshot.current = {
      editingPortals,
      portalNodesById,
      portalDraft,
      embeddedPublications,
      embeddedRequests,
      completeSpaceThingFraming,
      screenToFlowPosition,
      authorOnCanvas: availability.authorOnCanvas,
    };
  }, [
    editingPortals,
    portalNodesById,
    portalDraft,
    embeddedPublications,
    embeddedRequests,
    completeSpaceThingFraming,
    screenToFlowPosition,
    availability.authorOnCanvas,
  ]);

  useEffect(() => {
    const root = canvasRef.current;
    if (root === null) return;

    let pan: {
      pointerId: number;
      thingId: ThingId;
      lastX: number;
      lastY: number;
      framing: SpaceThingFraming;
    } | null = null;
    const zoomPending = new Map<ThingId, SpaceThingFraming>();
    const zoomTimers = new Map<ThingId, ReturnType<typeof setTimeout>>();

    const persist = (thingId: ThingId, framing: SpaceThingFraming, dropDraft = true) => {
      if (dropDraft) {
        setPortalDraft((previous) => {
          const next = new Map(previous);
          next.delete(thingId);
          return next;
        });
      }
      portalGestureSnapshot.current.completeSpaceThingFraming(thingId, framing);
    };

    const flushPendingZoom = (thingId: ThingId, dropDraft = true) => {
      const pending = zoomPending.get(thingId);
      const timer = zoomTimers.get(thingId);
      if (timer !== undefined) clearTimeout(timer);
      zoomPending.delete(thingId);
      zoomTimers.delete(thingId);
      if (pending !== undefined) persist(thingId, pending, dropDraft);
    };

    const framingOf = (thingId: ThingId, parentId: string): SpaceThingFraming | undefined => {
      const session = portalGestureSnapshot.current;
      const drafted = session.portalDraft.get(thingId);
      if (drafted !== undefined) return drafted;
      const parent = session.portalNodesById.get(parentId);
      const stored = parent?.data.spaceContent?.framing;
      if (stored !== undefined) return stored;
      const published = session.embeddedPublications.get(parentId);
      const request = session.embeddedRequests.find(
        (candidate) => candidate.parent.id === parentId,
      );
      if (published === undefined || request === undefined) return undefined;
      return framingFromFit(published.origin, request.bounds);
    };

    const portalParent = (target: EventTarget | null): ThingFlowNode | undefined => {
      if (!(target instanceof Element)) return undefined;
      if (
        target.closest('.nokey, button, [role="toolbar"], .react-flow__resize-control') !== null
      ) {
        return undefined;
      }
      const nodeEl = target.closest<HTMLElement>('.react-flow__node[data-id]');
      if (nodeEl === null) return undefined;
      const id = nodeEl.dataset['id'];
      if (id === undefined) return undefined;
      const node = portalGestureSnapshot.current.portalNodesById.get(id);
      if (node === undefined || node.parentId !== undefined) return undefined;
      if (node.data.kind !== 'space') return undefined;
      if (!portalGestureSnapshot.current.editingPortals.has(node.data.thingId)) return undefined;
      return node;
    };

    const portalUnder = (target: EventTarget | null): ThingFlowNode | undefined => {
      if (!(target instanceof Element)) return undefined;
      const nodeEl = target.closest<HTMLElement>('.react-flow__node[data-id]');
      if (nodeEl === null) return undefined;
      const id = nodeEl.dataset['id'];
      if (id === undefined) return undefined;
      const session = portalGestureSnapshot.current;
      return editingPortalAncestor(
        session.portalNodesById.get(id),
        session.portalNodesById,
        session.editingPortals,
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!portalGestureSnapshot.current.authorOnCanvas) return;
      const parent = portalParent(event.target);
      if (parent === undefined) return;
      const thingId = parent.data.thingId;
      const existingTimer = zoomTimers.get(thingId);
      if (existingTimer !== undefined) clearTimeout(existingTimer);
      zoomTimers.delete(thingId);
      const pendingZoom = zoomPending.get(thingId);
      if (pendingZoom !== undefined) zoomPending.delete(thingId);
      const framing = pendingZoom ?? framingOf(thingId, parent.id);
      if (framing === undefined) return;
      event.preventDefault();
      pan = {
        pointerId: event.pointerId,
        thingId,
        lastX: event.clientX,
        lastY: event.clientY,
        framing,
      };
      root.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pan?.pointerId !== event.pointerId) return;
      const from = portalGestureSnapshot.current.screenToFlowPosition({
        x: pan.lastX,
        y: pan.lastY,
      });
      const to = portalGestureSnapshot.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const next = panFraming(pan.framing, { x: to.x - from.x, y: to.y - from.y });
      const thingId = pan.thingId;
      pan = { ...pan, lastX: event.clientX, lastY: event.clientY, framing: next };
      setPortalDraft((previous) => {
        if (previous.get(thingId) === next) return previous;
        const drafted = new Map(previous);
        drafted.set(thingId, next);
        return drafted;
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      if (pan?.pointerId !== event.pointerId) return;
      persist(pan.thingId, pan.framing);
      pan = null;
    };

    const onWheel = (event: WheelEvent) => {
      if (!portalGestureSnapshot.current.authorOnCanvas) return;
      const parent = portalUnder(event.target);
      if (parent === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      const thingId = parent.data.thingId;
      const current = zoomPending.get(thingId) ?? framingOf(thingId, parent.id);
      if (current === undefined) return;
      const next = zoomFraming(current, event.deltaY < 0 ? 1.1 : 1 / 1.1);
      zoomPending.set(thingId, next);
      setPortalDraft((previous) => {
        const drafted = new Map(previous);
        drafted.set(thingId, next);
        return drafted;
      });
      const existing = zoomTimers.get(thingId);
      if (existing !== undefined) clearTimeout(existing);
      zoomTimers.set(
        thingId,
        setTimeout(() => {
          flushPendingZoom(thingId);
        }, 160),
      );
    };

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
    root.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerUp);
      root.removeEventListener('wheel', onWheel, { capture: true });
      for (const thingId of [...zoomPending.keys()]) flushPendingZoom(thingId, false);
    };
  }, [setPortalDraft]);

  /**
   * What a refused canvas command left the author with, or `null`.
   *
   * The Edge half of this key has surfaces of its own to land a refusal on —
   * the selected Edge's controls and its endpoint editor. The Thing half has
   * none: the press is over and the Thing it named may not even be on screen, so
   * this sentence is the whole of what the author is told. It is the same case
   * `edge-authoring-react.tsx` calls a `gesture` refusal, and it shares that
   * announcement's placement.
   */
  const [commandRefusal, setCommandRefusal] = useState<string | null>(null);
  // A refusal names the selection it was made against, so a selection that moves
  // takes it with it — the same rule Edge Authoring applies to a retained
  // `deletion` refusal. Adjusted during render rather than in an effect, the way
  // `canvas-thing-authoring.ts` drops a caret when authoring is withdrawn: the
  // stale sentence never reaches the DOM, and no cascading render is scheduled.
  const [refusalSelection, setRefusalSelection] = useState(selection);
  if (refusalSelection !== selection) {
    setRefusalSelection(selection);
    setCommandRefusal(null);
  }

  const latestDeletion = useRef({
    embedded: liveEmbeddings,
    authoring,
    bodyEditing,
    authorOnCanvas: availability.authorOnCanvas,
    deleteEdges,
    edges: edgeSurface.edges,
    nodes,
    selection,
  });
  // A native event can arrive after commit but before passive effects. Refresh
  // the snapshot in the synchronous commit phase so the stable listener cannot
  // act on the previous selection or refusal state.
  useLayoutEffect(() => {
    latestDeletion.current = {
      embedded: liveEmbeddings,
      authoring,
      bodyEditing,
      authorOnCanvas: availability.authorOnCanvas,
      deleteEdges,
      edges: edgeSurface.edges,
      nodes,
      selection,
    };
  }, [
    authoring,
    bodyEditing,
    availability.authorOnCanvas,
    deleteEdges,
    edgeSurface.edges,
    nodes,
    selection,
    liveEmbeddings,
  ]);

  useEffect(() => {
    const deleteSelection = (event: KeyboardEvent): void => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      // The two exclusions the `C` binding above spells out, for the reasons it
      // gives: a command runs once per press, and a modifier makes the key a
      // browser or OS shortcut rather than this canvas's. `shiftKey` is in the
      // list for a plainer reason than it is up there — the key is already the
      // same key, so Shift only makes a chord this canvas never advertised, and
      // one that belongs to somebody else in several places a browser runs.
      // Nothing here holds Shift either: `selectionKeyCode` and
      // `multiSelectionKeyCode` are both `null`.
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(NOT_A_CANVAS_COMMAND) !== null) return;
      if (canvasRef.current?.contains(event.target) !== true) return;
      const current = latestDeletion.current;
      if (!current.authorOnCanvas || current.bodyEditing) return;
      const focusedNodeId = event.target.closest<HTMLElement>('.react-flow__node[data-id]')
        ?.dataset['id'];
      const embedded = current.embedded.find((value) =>
        value.nodes.some(
          (node) => node.id === focusedNodeId || (focusedNodeId === undefined && node.selected),
        ),
      );
      const embeddedId = focusedNodeId ?? embedded?.nodes.find((node) => node.selected)?.id;
      if (embedded !== undefined && embeddedId !== undefined) {
        event.preventDefault();
        setCommandRefusal(embedded.removeThing(embeddedId));
        return;
      }
      // The Thing the key was *aimed at* wins over the one selected before it.
      // React Flow never selects a node on focus — its `onFocus` only auto-pans
      // — and only the Edge half of this canvas bridges the two, so a Tab to
      // another Thing leaves the selection behind while that Thing's assistive
      // description promises Delete removes *it*. The open branch above already
      // resolves its Thing this way; the selection is the fallback for a press
      // that came from the pane rather than from a node.
      const focusedThingId = focusedThing(event.target, current.nodes);
      const { selection } = current;
      const thingId = focusedThingId ?? (selection.kind === 'thing' ? selection.thingId : null);
      if (thingId !== null) {
        event.preventDefault();
        const result = current.authoring.complete({
          kind: 'removed-thing-from-diagram',
          thingId,
        });
        setCommandRefusal(
          result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null,
        );
        return;
      }
      if (selection.kind === 'edge') {
        const selectedEdges = current.edges.filter((edge) => edge.selected);
        if (selectedEdges.length === 0) return;
        event.preventDefault();
        current.deleteEdges(selectedEdges);
      }
    };
    window.addEventListener('keydown', deleteSelection);
    return () => window.removeEventListener('keydown', deleteSelection);
  }, []);

  const connectionLineStyle = useMemo(
    () => ({
      stroke: activeGraphColor(colorByGraphId, activeGraphId),
      strokeWidth: 3,
    }),
    [activeGraphId, colorByGraphId],
  );

  const {
    onConnect,
    onConnectStart,
    onConnectEnd,
    isValidConnection,
    onReconnectStart,
    onReconnect,
    onReconnectEnd,
    onMouseMove,
    edgesReconnectable,
    edgesFocusable,
    deleteKeyCode,
    multiSelectionKeyCode,
    selectionKeyCode,
    selectionOnDrag,
  } = edgeSurface.reactFlowProps;

  const onEmbeddedConnectStart = useCallback<OnConnectStart>(
    (event, params) => {
      const parsed = parseEmbeddedNodeId(params.nodeId ?? '');
      if (parsed !== undefined) {
        embedConnectFrom.current = { parentId: parsed.parentId, from: parsed.thingId };
        return;
      }
      embedConnectFrom.current = null;
      onConnectStart(event, params);
    },
    [onConnectStart],
  );
  const onEmbeddedConnect = useCallback<OnConnect>(
    (connection) => {
      const routed = canvasNodeConnection(connection.source, connection.target);
      if (routed.kind === 'embedded') {
        embeddedPublications.get(routed.parentId)?.connectThings(routed.from, routed.to);
        return;
      }
      if (routed.kind === 'host') onConnect(connection);
    },
    [embeddedPublications, onConnect],
  );
  const onEmbeddedConnectEnd = useCallback<OnConnectEnd>(
    (event, connection) => {
      embedConnectFrom.current = null;
      onConnectEnd(event, connection);
    },
    [onConnectEnd],
  );
  const isEmbeddedConnectionValid = useCallback<IsValidConnection>(
    (connection) => {
      const routed = canvasNodeConnection(connection.source, connection.target);
      if (routed.kind === 'invalid') return false;
      if (routed.kind === 'embedded') {
        return (
          embeddedPublications.get(routed.parentId)?.mayConnectThings(routed.from, routed.to) ===
          true
        );
      }
      return isValidConnection(connection);
    },
    [embeddedPublications, isValidConnection],
  );

  const onExternalDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!availability.authorOnCanvas || !event.dataTransfer.types.includes(THING_DRAG_TYPE))
        return;
      if (!(event.target instanceof Element) || event.target.closest('.react-flow__pane') === null)
        return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    [availability.authorOnCanvas],
  );

  const onExternalDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!availability.authorOnCanvas || !(event.target instanceof Element)) return;
      if (event.target.closest('.react-flow__pane') === null) return;
      const thingId = uuidSchema.safeParse(event.dataTransfer.getData(THING_DRAG_TYPE));
      if (!thingId.success) return;
      event.preventDefault();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onAddExistingThing(thingId.data, {
        x: point.x - THING_SIZE.width / 2,
        y: point.y - THING_SIZE.height / 2,
      });
    },
    [availability.authorOnCanvas, onAddExistingThing, screenToFlowPosition],
  );

  const embeddedEvents = useMemo(() => {
    const props: Pick<ReactFlowProps<ThingFlowNode>, 'onNodeClick'> = {};
    if (!presenting) {
      props.onNodeClick = (_event, node) => {
        const request = embeddedRequests.find((candidate) => candidate.parent.id === node.parentId);
        if (request !== undefined && request.entry === undefined)
          void resumeEmbedded(request.spaceId);
      };
    }
    return props;
  }, [presenting, embeddedRequests, resumeEmbedded]);

  return edgeSurface.provide(
    <ReactFlow
      ref={canvasRef}
      nodes={canvasNodes}
      edges={canvasEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeSurface.edgeTypes}
      onNodesChange={changeCanvasNodes}
      {...embeddedEvents}
      onEdgesChange={onEdgesChange}
      // Edge Authoring's own properties, named one by one rather than spread, so
      // no property order below can silently replace one of its handlers.
      onConnect={onEmbeddedConnect}
      onConnectStart={onEmbeddedConnectStart}
      onConnectEnd={onEmbeddedConnectEnd}
      isValidConnection={isEmbeddedConnectionValid}
      onReconnectStart={onReconnectStart}
      onReconnect={onReconnect}
      onReconnectEnd={onReconnectEnd}
      onMouseMove={onMouseMove}
      onDragOver={onExternalDragOver}
      onDrop={onExternalDrop}
      edgesReconnectable={edgesReconnectable}
      edgesFocusable={edgesFocusable}
      // Passed through rather than copied: `useKeyPress` has this value in the
      // dependency array of its listener effect, so a fresh array per render
      // re-attaches React Flow's `keydown`/`keyup` on `document`.
      deleteKeyCode={deleteKeyCode}
      multiSelectionKeyCode={multiSelectionKeyCode}
      selectionKeyCode={selectionKeyCode}
      selectionOnDrag={selectionOnDrag}
      onKeyDown={handleKeyDown}
      // Programmatically focusable, and deliberately not a tab stop. React Flow's
      // native Edge Escape calls `blur()`, which leaves focus on `body` — not an
      // authoring context — and its pane carries no `tabindex`, so there is
      // nothing for the repair to focus without this. Negative, so the canvas
      // never becomes a stop a keyboard author has to pass through.
      tabIndex={-1}
      fitView={openingFraming === undefined}
      fitViewOptions={OVERVIEW_FIT}
      // Nothing on a Thing answers a double click. ADR 0065 made the Title a
      // one-activation control, so the second click of a pair lands in the field
      // the first one opened — and that field, like the control, carries
      // `.nopan`, the one thing React Flow's zoom filter exempts. The Thing body
      // carries no such class, so a double click there would zoom the canvas
      // while meaning nothing to the Thing. Off for the whole canvas rather than
      // per node, so the gesture does not change meaning two pixels away from a
      // Thing.
      zoomOnDoubleClick={false}
      // While presenting the arrow keys control traversal, so React Flow must not
      // also read them as moving or selecting a node.
      nodesDraggable={availability.dragNodes}
      nodesFocusable={availability.selectNodes}
      elementsSelectable={availability.selectNodes}
      // Half of a pair, and useless without the other half. React Flow resolves
      // this into `NodeProps.isConnectable` and hands it to the node, enforcing
      // nothing itself on a handle it did not render — so `ThingNode` forwards it
      // to the four authoring handles, and only then does this line mean
      // anything beyond whether the connection line draws.
      //
      // **Not `authorOnCanvas`**: presenting deliberately keeps this one
      // gesture, and `authoring-availability.ts` records why.
      nodesConnectable={availability.connectOnCanvas}
      // **The placement fact, deliberately not an availability answer.** The
      // withheld form of this description is a sentence about placement, so the
      // only condition that may gate it is whether placement resolved. Every
      // other withdrawal — presenting, a creation pane, a live chrome rename —
      // leaves the description saying "pending" about a placement that is not.
      ariaLabelConfig={placementReady ? ARIA_LABEL_CONFIG : PENDING_ARIA_LABEL_CONFIG}
      // No `connectionMode`: the default is Strict, and every legal drop here is
      // already source-to-target. Loose only adds source-to-source, which the
      // authoring handles refuse via `isConnectableEnd` and the graph ports via
      // `pointer-events: none` — so it advertised a capability the design forbids.
      connectionLineStyle={connectionLineStyle}
      connectionLineComponent={GraphConnectionLine}
      minZoom={0.2}
      // Presenting draws one thing full-screen, which is far closer than React
      // Flow's default ceiling of 2. See `MAX_ZOOM` — without it the camera sits
      // outside its own extent and the first wheel tick yanks it back.
      maxZoom={MAX_ZOOM}
    >
      <Background gap={24} />
      <svg aria-hidden="true" width={0} height={0}>
        <defs>
          {embeddedRequests.map(({ parent, absolute, bounds, tiltCenter }) => (
            <clipPath key={parent.id} id={embeddedClipId(parent.id)} clipPathUnits="userSpaceOnUse">
              <rect
                x={absolute.x + bounds.left}
                y={absolute.y + bounds.top}
                width={Math.max(0, bounds.right - bounds.left)}
                height={Math.max(0, bounds.bottom - bounds.top)}
                // The window leans with the Thing it is cut out of. Written as
                // SVG's own `rotate(angle cx cy)`, which carries its centre and
                // so needs none of the `transform-box` reasoning the Edge layer
                // does — this `<clipPath>` lives in a 0x0 `<svg>` of its own,
                // where a view box would mean nothing.
                transform={
                  tiltCenter === undefined
                    ? undefined
                    : `rotate(${CANVAS_THING_DRAG_TILT_DEGREES} ${tiltCenter.x} ${tiltCenter.y})`
                }
              />
            </clipPath>
          ))}
        </defs>
      </svg>
      {embeddedRequests.map((request) =>
        request.entry === undefined ? null : (
          <EmbeddedDiagramAuthoring
            continuation={continuation}
            key={`${request.parent.id}:${request.diagramId}`}
            parent={request.parent}
            entry={request.entry}
            diagramId={request.diagramId}
            graphId={request.graphId}
            // Two answers and one membership test, and each is here for its own
            // reason. `authorInEmbeddedDiagram` is every way this canvas is not
            // being authored *except* an embedded edit; `authorOnCanvas` adds
            // that one, so it is false the moment any embedding is editing —
            // and the membership test is that same fact read the other way
            // round, reinstating the one embedding that owns the edit. Which
            // embedding it is never leaves this component, so it could not be
            // an answer.
            //
            // The two live edits are this canvas's own and read at same-render
            // freshness; the answers `App` holds are a frame behind them, since
            // each is reported up through an effect.
            enabled={embeddedAuthoringEnabled({
              readOnly: request.readOnly,
              portalEditing: embeddingIsPortalEditing(
                request.parent,
                portalNodesById,
                editingPortals,
              ),
              authorInEmbeddedDiagram: availability.authorInEmbeddedDiagram,
              authorOnCanvas: availability.authorOnCanvas,
              thisEmbeddingEditing: editingEmbeddingIds.has(request.parent.id),
              hostBodyEditing: bodyEditing,
              hostTitleEditing: thingAuthoring.titleEditing,
            })}
            framing={
              portalDraft.get(request.parent.data.thingId) ??
              request.parent.data.spaceContent?.framing
            }
            bounds={request.bounds}
            absolute={request.absolute}
            tiltCenter={request.tiltCenter}
            publish={publishEmbedded}
          />
        ),
      )}
      {/*
        A failed read is announced on the Space Thing that asked for it, named by
        the Title the author gave that Thing: the canvas can hold several
        embeddings, and a sentence naming none of them says nothing about which
        one is empty. Drawn from the standing requests, so a Thing that is Closed
        takes its announcement with it.
      */}
      {embeddedRequests.flatMap(({ parent, spaceId }) => {
        const message = embeddedFailures.get(spaceId);
        return message === undefined
          ? []
          : [
              <span key={parent.id} role="alert" className="canvas-refusal">
                {`${titleName(parent.data.title)}: ${message}`}
              </span>,
            ];
      })}
      {/*
        The sentence a refused canvas command leaves behind. Placed and styled
        exactly like Edge Authoring's `gesture` refusal, because it is the same
        case: the press is over, and there is no surface left to attach it to.
      */}
      {commandRefusal !== null && (
        <span role="alert" className="canvas-refusal" data-testid="canvas-command-refusal">
          {commandRefusal}
        </span>
      )}
      <ZoomSlider />
      {graphs.length > 0 && (
        <GraphHud
          graphs={graphs}
          colorByGraphId={colorByGraphId}
          activeGraphId={activeGraphId}
          activeGraphThingIds={activeGraphThingIds}
        />
      )}
      <OverviewCamera presenting={presenting} />
      <PresentingCamera activeThingId={activeThingId} />
      <OpeningFramingCamera framing={openingFraming} />
      {edgeSurface.layer}
    </ReactFlow>,
  );
}
