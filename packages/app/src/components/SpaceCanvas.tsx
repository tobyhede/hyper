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
  type Resource,
  type ResourceId,
  type Graph,
  type GraphId,
} from '@project/core';
import type { SpaceSession } from '@project/persistence';
import { CANVAS_RESOURCE_DRAG_TILT_DEGREES, type EntityActionGroup } from '@project/ui';
import {
  nodeTypes,
  GraphConnectionLine,
  GraphHud,
  ZoomSlider,
  type ResourceFlowNode,
} from '@project/react-flow-adapter';
import { activeGraphColor } from '../colors';
import { describeAuthoringRefusal } from '../authoring-refusal';
import type { AuthoringAvailability } from '../authoring-availability';
import { useCanvasResourceAuthoring } from '../canvas-resource-authoring';
import type { SpaceEndpointTargets } from '../space-resource-targets';
import { useEdgeAuthoring } from '../edge-authoring-react';
import type { EdgeAuthoring } from '../edge-authoring';
import type { CanvasSelection, ResourceResize, EdgeSubject } from '../render-adapter';
import type { SpaceAuthoring } from '../space-authoring';
import { MAX_ZOOM, OVERVIEW_FIT } from '../camera';
import { RESOURCE_SIZE } from '../resource';
import { RESOURCE_DRAG_TYPE } from './ResourcesPopover';
import { OverviewCamera, PresentingCamera, OpeningFramingCamera } from './cameras';
import {
  canvasNodeConnection,
  clipEmbeddedNode,
  embeddedClipId,
  parseEmbeddedNodeId,
} from '../embedded-map';
import {
  embeddedAuthoringEnabled,
  editingPortalAncestor,
  embeddingIsPortalEditing,
} from '../embedded-open-space-resource';
import { useEmbeddedOpenSpaceEndpoints } from '../use-embedded-open-space-resources';
import { useOpenSpaces } from '../open-spaces-context';
import { EmbeddedMapAuthoring } from './EmbeddedMapAuthoring';
import type { Continuation } from '../continuation';
import {
  framingFromFit,
  panFraming,
  zoomFraming,
  type SpaceEndpointFraming,
} from '../space-resource-framing';

/**
 * What the graph tells assistive technology it can do.
 *
 * React Flow's defaults describe its own local deletion. Hyper instead routes
 * both Resources and Edges through the completed Space Edit lifecycle, so these
 * labels describe the application-owned commands rather than a local array
 * mutation.
 *
 * Both node keys are set because React Flow picks between them on
 * `disableKeyboardA11y`, and the one it names `keyboardDisabled` is the one an
 * ordinary keyboard-enabled graph gets.
 */
const ARIA_LABEL_CONFIG = {
  'node.a11yDescription.default':
    'Press enter or space to open a Resource, backspace or delete to remove it from this Map, the arrow keys to move it, and escape to cancel.',
  'node.a11yDescription.keyboardDisabled':
    'Press enter or space to open a Resource, backspace or delete to remove it from this Map, the arrow keys to move it, and escape to cancel.',
  'edge.a11yDescription.default':
    'Press backspace or delete to remove this Edge from its Graph, or escape to deselect it.',
} as const;

/** A pending placement keeps Resources readable without advertising authored gestures. */
const PENDING_ARIA_LABEL_CONFIG = {
  ...ARIA_LABEL_CONFIG,
  'node.a11yDescription.default': 'This Resource is unavailable while placement is pending.',
  'node.a11yDescription.keyboardDisabled':
    'This Resource is unavailable while placement is pending.',
} as const;

/**
 * The one unmodified authoring shortcut, named where it is bound.
 *
 * Exported so the control that announces it to a screen reader takes the key
 * from the handler that answers it rather than from a literal beside it: the
 * announcement and the binding are one fact, and two copies of it can drift
 * without anything failing.
 */
export const ADD_RESOURCE_KEY = 'C';

const subscribeToNothing = (): (() => void) => () => undefined;

/**
 * Where an unmodified letter is somebody else's, not the canvas's command.
 *
 * One selector for both shortcuts, because the two answers have to agree: `C`
 * and `F2` are pressed on the same tree, and a control missing from one list and
 * present in the other makes the same element a command target for one key and
 * not for the other. They disagreed — `C` named only text entry — and the canvas
 * zoom controls render *inside* the wrapper both are bound to, so a `c` with
 * Zoom in focused added a Resource.
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
 * the surfaces that carry no marker of their own — `ResourceSearchCombobox`'s popup
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
 * The Resource a key came from, or `null` if it came from anywhere else.
 *
 * Answered from the projection rather than from the DOM id alone, which is what
 * keeps a second canvas's node — a story, a catalogue page — from naming a Resource
 * this Map is not drawing.
 */
const focusedResource = (
  target: Element,
  nodes: readonly ResourceFlowNode[],
): ResourceId | null => {
  const element = target.closest<HTMLElement>('.react-flow__node[data-id]');
  if (element === null) return null;
  const id = element.dataset['id'];
  return nodes.find((node) => node.id === id)?.data.resourceId ?? null;
};

export interface SpaceCanvasProps {
  readonly continuation: Continuation;
  nodes: ResourceFlowNode[];
  edges: Edge[];
  /** The next projection, merged in by a completed connection so its Edge draws. */
  projectedNodes: readonly ResourceFlowNode[] | null;
  /** The Resource the traversal has reached, or `null` in overview. */
  activeResourceId: string | null;
  /**
   * That a traversal is running — the Navigation mode, not an availability
   * answer. Two consumers read it, and neither is an authoring operation: the
   * camera that returns to the overview when the traversal ends (ADR 0027), and
   * the click that resumes an embedded read of a Space that has been Exited,
   * which nothing edits. What presenting *withdraws* from authoring is
   * `availability`'s to say.
   */
  presenting: boolean;
  /**
   * That the selected Map's placement has resolved and the store has taken
   * it — the fact, not an operation, and read by one consumer: the aria
   * description React Flow gives every node.
   *
   * It is here rather than folded into `availability` because that description
   * is a *statement about the placement* and its withheld form says so in
   * words: "This Resource is unavailable while placement is pending." Any
   * availability answer would make it false somewhere — `connectOnCanvas`
   * announces "pending" over a placement that resolved long ago the moment an
   * author begins an inline Map rename on the Dock, which is a lie told
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
  onNodesChange: OnNodesChange<ResourceFlowNode>;
  onEdgesChange: OnEdgesChange;
  /** The whole Edge interaction lifecycle, which this canvas composes rather than interprets. */
  edgeAuthoring: EdgeAuthoring;
  selection: CanvasSelection;
  onSelectResource: (resourceId: ResourceId) => void;
  onSelectEdge: (subject: EdgeSubject) => void;
  /** The Resources this Map places — what an Edge picker may offer. */
  placedResources: readonly Resource[];
  /** Exact neutral title shown by the transient empty-drop preview. */
  newResourceTitle: string;
  /**
   * Create a detached Resource at the visible centre — the graph-focused `C`, whose
   * toolbar twin lives outside this component.
   */
  onAddResource: () => void;
  /** Complete an external Resources View drop at an authored top-left anchor. */
  onAddExistingResource: (
    resourceId: ResourceId,
    anchor: { readonly x: number; readonly y: number },
  ) => void;
  /**
   * The Resource a completed creation asks to be named, or `null`.
   *
   * The identity, not a flag: each creation mints a fresh one, so a *change* is
   * what says a Resource has just been created — which is how the naming
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
   * Presenting replaces the Resource with its content rather than drawing content on
   * it, so an editor cannot survive it and the draft would go with no exit
   * spent. The caret stays this component's (`spec.md` §6) — what leaves is the
   * one bit a sibling surface needs to stay out of the way.
   */
  onBodyEditingChange?: (editing: boolean) => void;
  /** Reports the Resource title draft so sibling naming surfaces stay withdrawn. */
  onTitleEditingChange?: (editing: boolean) => void;
  resourceResize: ResourceResize;
  /**
   * Report whether some embedded Map on this canvas is running a Resource edit.
   *
   * The one availability fact that is produced *inside* this subtree: an
   * embedded Map publishes its live edits from within React Flow, so nothing
   * above can see one without being told. It goes into the render adapter
   * rather than up a chain of `useState` because that store re-renders the
   * Space's command surface and this canvas together, and the answer derived
   * from it comes back down as `availability.authorOnCanvas` — one answer, not
   * a term recombined here (`authoring-availability.ts`).
   */
  reportEmbeddedMapEditing: (editing: boolean) => void;
  /** Identity of the authored surface this canvas and its HUD are drawing. */
  spaceTitle: string;
  mapTitle: string;
  graphs: readonly Graph[];
  colorByGraphId: Readonly<Record<string, string>>;
  activeGraphId: GraphId | null;
  /** What each Space Resource's target offers it, for the Resources of kind `space` on this canvas. */
  spaceResourceTargets?: SpaceEndpointTargets;
  /**
   * What commands each Resource on this canvas offers — copy an address, delete it
   * — drawn on the Resource's own rail (ADR 0073).
   *
   * Passed straight through to `useCanvasResourceAuthoring`, which is where every
   * other per-Resource operation is attached. Absent on a canvas whose Resources have
   * no such commands to run, which is how an embedded Map draws none.
   *
   * A command list is built afresh on every render of the composition that owns
   * it — an address and an Edit both read state that has just changed — so this
   * widens the measured exception below from "the node wrappers rebuild
   * whenever `nodes` changes identity" to "whenever this canvas renders".
   * Correctness is unaffected, and closing it is the same per-node cache that
   * note already names.
   */
  resourceEntityActions?: (resourceId: ResourceId) => readonly EntityActionGroup[];
}

export function SpaceCanvas({
  continuation,
  nodes,
  edges,
  projectedNodes,
  activeResourceId,
  presenting,
  placementReady,
  availability,
  onNodesChange,
  onEdgesChange,
  edgeAuthoring,
  selection,
  onSelectResource,
  onSelectEdge,
  placedResources,
  newResourceTitle,
  onAddResource,
  onAddExistingResource,
  nameOnCreation,
  authoring,
  spaceSession,
  onBodyEditingChange,
  onTitleEditingChange,
  resourceResize,
  reportEmbeddedMapEditing,
  spaceTitle,
  mapTitle,
  graphs,
  colorByGraphId,
  activeGraphId,
  spaceResourceTargets,
  resourceEntityActions,
}: SpaceCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  const spaces = useOpenSpaces();
  const thisSpaceId = spaceSession.getState().working.id;
  const activeSpaceId = useSyncExternalStore(spaces?.subscribe ?? subscribeToNothing, () =>
    spaces === null ? null : spaces.getState().activeSpaceId,
  );
  const readThisCanvasOpeningFraming = (): SpaceEndpointFraming | undefined => {
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
   * The Resources a gesture is moving, read from React Flow's `nodeLookup`.
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
  } = useEmbeddedOpenSpaceEndpoints(nodes, spaces, draggingIds);

  const editingEmbeddingIds = new Set(
    embeddedRequests.flatMap((request) => {
      const value = embeddedPublications.get(request.parent.id);
      return value !== undefined &&
        request.entry === value.entry &&
        value.mapId === request.mapId &&
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
   * the Set above, because it is a question about a Resource of this canvas rather
   * than about what is in progress. A layout effect rather than an ordinary
   * one: the answer comes back through the store in the same commit, so no
   * frame is painted with authoring still offered over a live embedded edit.
   *
   * Every reason the answers carry lives in `authoring-availability.ts`, beside
   * the answer it governs — including why the Edge lifecycle reads
   * `authorOnCanvas` rather than the shorter rule it once had, and why a
   * connection is reachable on the presented Resource that `authorOnCanvas`
   * withdraws.
   */
  const embeddedEditing = editingEmbeddingIds.size > 0;
  useLayoutEffect(() => {
    reportEmbeddedMapEditing(embeddedEditing);
    return () => reportEmbeddedMapEditing(false);
  }, [embeddedEditing, reportEmbeddedMapEditing]);
  const resourceAuthoring = useCanvasResourceAuthoring({
    continuation,
    nodes,
    availability,
    nameOnCreation,
    authoring,
    spaceSession,
    resourceResize,
    onSelectResource,
    spaceResourceTargets,
    resourceEntityActions,
    portalEditing: editingPortals,
    onPortalEditingChange,
  });
  const {
    bodyEditing,
    openResource: onOpenResource,
    beginTitleEditing,
    completeSpaceEndpointFraming,
  } = resourceAuthoring;

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
    onTitleEditingChange?.(resourceAuthoring.titleEditing || embeddedTitleEditing);
    return () => onTitleEditingChange?.(false);
  }, [resourceAuthoring.titleEditing, embeddedTitleEditing, onTitleEditingChange]);
  const liveEmbeddings = useMemo(
    () =>
      embeddedRequests.flatMap((request) => {
        const value = embeddedPublications.get(request.parent.id);
        if (value?.mapId !== request.mapId) return [];
        if (request.entry === value.entry) return [value];
        return [
          {
            ...value,
            changeNodes: () => undefined,
            // The three Resource commands aimed at a retained read answer it the
            // same way: reopen the target's session so the next press acts.
            // The canvas still announces that delete removes the focused Resource
            // from its Map, and this drawing is still focusable, so an
            // answer of `null` alone consumed the key and did nothing at all.
            // There is no refusal to report either — the target is not open,
            // which is a state this press ends rather than a refused Edit.
            removeResource: () => {
              void resumeEmbedded(request.spaceId);
              return null;
            },
            nodes: value.nodes.map((node): ResourceFlowNode => ({
              ...clipEmbeddedNode(node, request.bounds),
              draggable: false,
              data: {
                ...node.data,
                readOnly: true,
                onEditResource: () => {
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

  const embedConnectFrom = useRef<{ parentId: string; from: ResourceId } | null>(null);
  const mayOfferEmbedded = useCallback(
    (resourceId: ResourceId) => {
      const session = embedConnectFrom.current;
      if (session === null) return false;
      return (
        embeddedPublications
          .get(session.parentId)
          ?.mayConnectResources(session.from, resourceId) === true
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
    placedResources,
    newResourceTitle,
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
  // than a ten-Resource fixture asks for, so read it as a measured exception rather
  // than an oversight.

  // No pointer gesture on a Resource's body opens it (ADR 0036). A click is left to
  // React Flow, which selects; the Title is its own one-activation control
  // (ADR 0065), whose events stop before this canvas handler. Opening is the
  // affordance and the Resource-level keyboard command.

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!availability.authorOnCanvas || !(event.target instanceof Element)) return;
      if (event.key === 'Enter' || event.key === ' ') {
        if (bodyEditing) return;
        // The same exclusion the `C` branch below makes, and now load-bearing
        // rather than defensive: an Expanded Resource draws its editor *inside* the
        // node, so a Space typed into it would otherwise be cancelled here
        // before the document ever received the character.
        if (event.target.closest(NOT_A_CANVAS_COMMAND) !== null) return;
        const resource = event.target.closest<HTMLElement>('.react-flow__node[data-id]');
        if (resource === null || !event.currentTarget.contains(resource)) return;
        const resourceId = resource.dataset['id'];
        if (resourceId === undefined) return;
        event.preventDefault();
        const embedded = liveEmbeddings
          .flatMap((value) => value.nodes)
          .find((node) => node.id === resourceId);
        if (embedded === undefined) onOpenResource(resourceId);
        else embedded.data.onEditResource?.(true);
        return;
      }
      // `C` adds a Resource, and it is the only unmodified authoring shortcut there
      // is. Answered here rather than on the window, so "graph focused" is a
      // fact about where the event came from rather than a guess: this handler
      // sits on React Flow's own wrapper, so a key pressed in the toolbar, in a
      // pane over the graph or in the Resources View never reaches it.
      //
      // Three exclusions, and each names a different way the key is not a
      // command. A modifier makes it a browser or OS shortcut. A repeat is one
      // press held down, and a command runs once per press. And a text control
      // is somewhere the author is *typing* a c — the inline title editor stops
      // its own key events before they get here, so this covers whatever text
      // entry the canvas gains next rather than a case that exists today.
      if (event.key.toUpperCase() !== ADD_RESOURCE_KEY) return;
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
      onAddResource();
    },
    [onOpenResource, availability.authorOnCanvas, bodyEditing, onAddResource, liveEmbeddings],
  );

  // `F2` renames the selected Resource, and this is the *only* handler that answers
  // it. A React Flow `onKeyDown` branch used to answer it first and ask nothing
  // about the target, so the key typed into a control renamed whichever Resource
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
  const editableNodes = resourceAuthoring.nodes;
  /**
   * The canvas React Flow draws: this Space's Resources, then the Maps its
   * Open Space Resources embed (ADR 0068).
   *
   * Concatenated here and nowhere earlier. React Flow requires a parent to be
   * declared before its children, which appending satisfies for free; and every
   * rule above — deletion, the title-editing selection, focus, Edge authoring —
   * is written over this Space's own Resources, so an embedded node mixed into
   * `editableNodes` would put another Space's Resource inside each of them.
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
        if (!editingPortals.has(withHeight.data.resourceId) || withHeight.data.kind !== 'space') {
          return withHeight;
        }
        // `nopan` only: an Open Resource does not take `nowheel` (ADR 0064).
        // Portal wheel is the capture listener below;
        // `space-resource-embedded-map.test.tsx` ('does not put nowheel on an
        // Open Space Resource in portal Edit, and wheel still authors its framing')
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
    const map = new Map<string, ResourceFlowNode>();
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
  const changeCanvasNodes: OnNodesChange<ResourceFlowNode> = useCallback(
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
    completeSpaceEndpointFraming,
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
      completeSpaceEndpointFraming,
      screenToFlowPosition,
      authorOnCanvas: availability.authorOnCanvas,
    };
  }, [
    editingPortals,
    portalNodesById,
    portalDraft,
    embeddedPublications,
    embeddedRequests,
    completeSpaceEndpointFraming,
    screenToFlowPosition,
    availability.authorOnCanvas,
  ]);

  useEffect(() => {
    const root = canvasRef.current;
    if (root === null) return;

    let pan: {
      pointerId: number;
      resourceId: ResourceId;
      lastX: number;
      lastY: number;
      framing: SpaceEndpointFraming;
    } | null = null;
    const zoomPending = new Map<ResourceId, SpaceEndpointFraming>();
    const zoomTimers = new Map<ResourceId, ReturnType<typeof setTimeout>>();

    const persist = (resourceId: ResourceId, framing: SpaceEndpointFraming, dropDraft = true) => {
      if (dropDraft) {
        setPortalDraft((previous) => {
          const next = new Map(previous);
          next.delete(resourceId);
          return next;
        });
      }
      portalGestureSnapshot.current.completeSpaceEndpointFraming(resourceId, framing);
    };

    const flushPendingZoom = (resourceId: ResourceId, dropDraft = true) => {
      const pending = zoomPending.get(resourceId);
      const timer = zoomTimers.get(resourceId);
      if (timer !== undefined) clearTimeout(timer);
      zoomPending.delete(resourceId);
      zoomTimers.delete(resourceId);
      if (pending !== undefined) persist(resourceId, pending, dropDraft);
    };

    const framingOf = (
      resourceId: ResourceId,
      parentId: string,
    ): SpaceEndpointFraming | undefined => {
      const session = portalGestureSnapshot.current;
      const drafted = session.portalDraft.get(resourceId);
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

    const portalParent = (target: EventTarget | null): ResourceFlowNode | undefined => {
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
      if (!portalGestureSnapshot.current.editingPortals.has(node.data.resourceId)) return undefined;
      return node;
    };

    const portalUnder = (target: EventTarget | null): ResourceFlowNode | undefined => {
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
      const resourceId = parent.data.resourceId;
      const existingTimer = zoomTimers.get(resourceId);
      if (existingTimer !== undefined) clearTimeout(existingTimer);
      zoomTimers.delete(resourceId);
      const pendingZoom = zoomPending.get(resourceId);
      if (pendingZoom !== undefined) zoomPending.delete(resourceId);
      const framing = pendingZoom ?? framingOf(resourceId, parent.id);
      if (framing === undefined) return;
      event.preventDefault();
      pan = {
        pointerId: event.pointerId,
        resourceId,
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
      const resourceId = pan.resourceId;
      pan = { ...pan, lastX: event.clientX, lastY: event.clientY, framing: next };
      setPortalDraft((previous) => {
        if (previous.get(resourceId) === next) return previous;
        const drafted = new Map(previous);
        drafted.set(resourceId, next);
        return drafted;
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      if (pan?.pointerId !== event.pointerId) return;
      persist(pan.resourceId, pan.framing);
      pan = null;
    };

    const onWheel = (event: WheelEvent) => {
      if (!portalGestureSnapshot.current.authorOnCanvas) return;
      const parent = portalUnder(event.target);
      if (parent === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      const resourceId = parent.data.resourceId;
      const current = zoomPending.get(resourceId) ?? framingOf(resourceId, parent.id);
      if (current === undefined) return;
      const next = zoomFraming(current, event.deltaY < 0 ? 1.1 : 1 / 1.1);
      zoomPending.set(resourceId, next);
      setPortalDraft((previous) => {
        const drafted = new Map(previous);
        drafted.set(resourceId, next);
        return drafted;
      });
      const existing = zoomTimers.get(resourceId);
      if (existing !== undefined) clearTimeout(existing);
      zoomTimers.set(
        resourceId,
        setTimeout(() => {
          flushPendingZoom(resourceId);
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
      for (const resourceId of [...zoomPending.keys()]) flushPendingZoom(resourceId, false);
    };
  }, [setPortalDraft]);

  /**
   * What a refused canvas command left the author with, or `null`.
   *
   * The Edge half of this key has surfaces of its own to land a refusal on —
   * the selected Edge's controls and its endpoint editor. The Resource half has
   * none: the press is over and the Resource it named may not even be on screen, so
   * this sentence is the whole of what the author is told. It is the same case
   * `edge-authoring-react.tsx` calls a `gesture` refusal, and it shares that
   * announcement's placement.
   */
  const [commandRefusal, setCommandRefusal] = useState<string | null>(null);
  // A refusal names the selection it was made against, so a selection that moves
  // takes it with it — the same rule Edge Authoring applies to a retained
  // `deletion` refusal. Adjusted during render rather than in an effect, the way
  // `canvas-resource-authoring.ts` drops a caret when authoring is withdrawn: the
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
        setCommandRefusal(embedded.removeResource(embeddedId));
        return;
      }
      // The Resource the key was *aimed at* wins over the one selected before it.
      // React Flow never selects a node on focus — its `onFocus` only auto-pans
      // — and only the Edge half of this canvas bridges the two, so a Tab to
      // another Resource leaves the selection behind while that Resource's assistive
      // description promises Delete removes *it*. The open branch above already
      // resolves its Resource this way; the selection is the fallback for a press
      // that came from the pane rather than from a node.
      const focusedResourceId = focusedResource(event.target, current.nodes);
      const { selection } = current;
      const resourceId =
        focusedResourceId ?? (selection.kind === 'resource' ? selection.resourceId : null);
      if (resourceId !== null) {
        event.preventDefault();
        const result = current.authoring.complete({
          kind: 'removed-resource-from-map',
          resourceId,
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
        embedConnectFrom.current = { parentId: parsed.parentId, from: parsed.resourceId };
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
        embeddedPublications.get(routed.parentId)?.connectResources(routed.from, routed.to);
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
          embeddedPublications.get(routed.parentId)?.mayConnectResources(routed.from, routed.to) ===
          true
        );
      }
      return isValidConnection(connection);
    },
    [embeddedPublications, isValidConnection],
  );

  const onExternalDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!availability.authorOnCanvas || !event.dataTransfer.types.includes(RESOURCE_DRAG_TYPE))
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
      const resourceId = uuidSchema.safeParse(event.dataTransfer.getData(RESOURCE_DRAG_TYPE));
      if (!resourceId.success) return;
      event.preventDefault();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onAddExistingResource(resourceId.data, {
        x: point.x - RESOURCE_SIZE.width / 2,
        y: point.y - RESOURCE_SIZE.height / 2,
      });
    },
    [availability.authorOnCanvas, onAddExistingResource, screenToFlowPosition],
  );

  const embeddedEvents = useMemo(() => {
    const props: Pick<ReactFlowProps<ResourceFlowNode>, 'onNodeClick'> = {};
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
      // Nothing on a Resource answers a double click. ADR 0065 made the Title a
      // one-activation control, so the second click of a pair lands in the field
      // the first one opened — and that field, like the control, carries
      // `.nopan`, the one class React Flow's zoom filter exempts. The Resource body
      // carries no such class, so a double click there would zoom the canvas
      // while meaning nothing to the Resource. Off for the whole canvas rather than
      // per node, so the gesture does not change meaning two pixels away from a
      // Resource.
      zoomOnDoubleClick={false}
      // While presenting the arrow keys control traversal, so React Flow must not
      // also read them as moving or selecting a node.
      nodesDraggable={availability.dragNodes}
      nodesFocusable={availability.selectNodes}
      elementsSelectable={availability.selectNodes}
      // Half of a pair, and useless without the other half. React Flow resolves
      // this into `NodeProps.isConnectable` and hands it to the node, enforcing
      // nothing itself on a handle it did not render — so `ResourceNode` forwards it
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
      // Presenting draws one resource full-screen, which is far closer than React
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
                // The window leans with the Resource it is cut out of. Written as
                // SVG's own `rotate(angle cx cy)`, which carries its centre and
                // so needs none of the `transform-box` reasoning the Edge layer
                // does — this `<clipPath>` lives in a 0x0 `<svg>` of its own,
                // where a view box would mean nothing.
                transform={
                  tiltCenter === undefined
                    ? undefined
                    : `rotate(${CANVAS_RESOURCE_DRAG_TILT_DEGREES} ${tiltCenter.x} ${tiltCenter.y})`
                }
              />
            </clipPath>
          ))}
        </defs>
      </svg>
      {embeddedRequests.map((request) =>
        request.entry === undefined ? null : (
          <EmbeddedMapAuthoring
            continuation={continuation}
            key={`${request.parent.id}:${request.mapId}`}
            parent={request.parent}
            entry={request.entry}
            mapId={request.mapId}
            graphId={request.graphId}
            // Two answers and one membership test, and each is here for its own
            // reason. `authorInEmbeddedMap` is every way this canvas is not
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
              authorInEmbeddedMap: availability.authorInEmbeddedMap,
              authorOnCanvas: availability.authorOnCanvas,
              thisEmbeddingEditing: editingEmbeddingIds.has(request.parent.id),
              hostBodyEditing: bodyEditing,
              hostTitleEditing: resourceAuthoring.titleEditing,
            })}
            framing={
              portalDraft.get(request.parent.data.resourceId) ??
              request.parent.data.spaceContent?.framing
            }
            bounds={request.bounds}
            absolute={request.absolute}
            drawnAbsolute={request.drawnAbsolute}
            tiltCenter={request.tiltCenter}
            publish={publishEmbedded}
          />
        ),
      )}
      {/*
        A failed read is announced on the Space Resource that asked for it, named by
        the Title the author gave that Resource: the canvas can hold several
        embeddings, and a sentence naming none of them says nothing about which
        one is empty. Drawn from the standing requests, so a Resource that is Closed
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
          spaceTitle={spaceTitle}
          mapTitle={mapTitle}
          graphs={graphs}
          colorByGraphId={colorByGraphId}
          activeGraphId={activeGraphId}
        />
      )}
      <OverviewCamera presenting={presenting} />
      <PresentingCamera activeResourceId={activeResourceId} />
      <OpeningFramingCamera framing={openingFraming} />
      {edgeSurface.layer}
    </ReactFlow>,
  );
}
