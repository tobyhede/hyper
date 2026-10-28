import type { DrawnClipboardFailure } from '../embedded-publication';
import { ChromeContinuation } from './ChromeContinuation';
import { drawnDropRefusal, surfaceAvailability, withSurfacePolicy } from '../map-surface-policy';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  Background,
  ReactFlow,
  type EdgeMouseHandler,
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
  DEFAULT_KIND,
  COLLAPSED_RESOURCE_SIZE,
  isAcceptedImageUrl,
  takesOpen,
  titleName,
  uuidSchema,
  type ResourceId,
  type MapId,
} from '@project/core';
import { resolveResourceContent } from '@project/graph';
import type { SpaceSession } from '@project/persistence';
import {
  CANVAS_RESOURCE_DRAG_TILT_DEGREES,
  GraphIcon,
  graphPaint,
  spaceViewOf,
  type EntityActionGroup,
} from '@project/ui';
import {
  authorsEmbeddedMap,
  nodeTypes,
  GraphConnectionLine,
  GraphHeadMarkers,
  GraphConnectionLineHeadShape,
  GraphHud,
  ZoomSlider,
  type ResourceFlowNode,
} from '@project/react-flow-adapter';
import { connectionAppearance } from '../colors';
import { describeCanvasGestureRefusal, type CanvasGestureRefusal } from '../authoring-refusal';
import { CANVAS_OCCURRENCE, observeMapSurfaces, type MapSurface } from '../map-surface';
import { useCanvasResourceAuthoring } from '../canvas-resource-authoring';
import type { SpaceResourceTargets } from '../space-resource-targets';
import type { ResourcePlacementCommands } from '../resource-placement';
import type { MapSurfaceReading } from '../use-map-surface';
import { useEdgeAuthoring } from '../edge-authoring-react';
import { edgeSelectionOf, sameSelection } from '../render-adapter';
import { MAX_ZOOM, OVERVIEW_FIT } from '../camera';
import { RESOURCE_SIZE } from '../resource';
import { RESOURCE_DRAG_TYPE, SPACE_DRAG_TYPE } from './ResourcesPopover';
import { ResourceConnect, type Connecting } from './ResourceConnect';
import { OpeningFramingCamera } from './cameras';
import {
  canvasNodeConnection,
  clipEmbeddedNode,
  embeddedClipId,
  parseEmbeddedNodeId,
  withEmbeddedEdgeTypes,
} from '../embedded-map';
import { editingPortalAncestor, reportsBodyHeight } from '../embedded-open-space-resource';
import { useEmbeddedOpenSpaceResources } from '../use-embedded-open-space-resources';
import { useOpenSpaces } from '../open-spaces-context';
import type { OpenSpace } from '../open-spaces';
import { EmbeddedMapAuthoring } from './EmbeddedMapAuthoring';
import { CANVAS_KEYS, FULL_VIEW_KEYS, keyBelongsElsewhere, pressesBinding } from '../key-bindings';
import {
  ADD_RESOURCE,
  answerCommand,
  bindCommand,
  keyAnswerOf,
  NOT_A_CANVAS_COMMAND,
  OPEN_AND_EXPAND,
  OPEN_RESOURCE,
  presentFromHereCommand,
  REMOVE_SELECTION,
  removeFromMapReportedBy,
  RENAME_RESOURCE,
  showFullViewCommand,
  type AuthoringOccurrence,
  type OpenTarget,
  type OwnResourceTarget,
  type RemovalTarget,
  type PresentFrom,
} from '../canvas-commands';
import { useKeyAnswers, useKeyCover } from '../key-dispatcher';
import type { CanvasRailCommands } from '../resource-rail-actions';
import {
  graphNeighbours,
  neighbourToward,
  type NavigatedEdge,
  type NavigationDirection,
} from '../graph-navigation';
import { FullView } from './FullView';
import { openAndExpandSize, openHeight, visibleCanvasCap } from '../open-and-expand';
import type { CommandOutcomes } from '../command-outcomes';
import type { DeleteConfirmation } from '../delete-confirmation';
import type { ImageReplacements } from '../image-replacement';
import {
  framingFromFit,
  panFraming,
  zoomFraming,
  type SpaceResourceFraming,
} from '../space-resource-framing';

/**
 * What the graph tells assistive technology it can do.
 *
 * React Flow's defaults describe its own local deletion. InfinityCube instead routes
 * both Resources and Edges through the completed Space Edit lifecycle, so these
 * labels describe the application-owned commands rather than a local array
 * mutation.
 *
 * Both node keys are set because React Flow picks between them on
 * `disableKeyboardA11y`, and the one it names `keyboardDisabled` is the one an
 * ordinary keyboard-enabled graph gets.
 */
const RESOURCE_KEYS_DESCRIPTION =
  'Press enter to open a Resource, shift enter to open and expand it, space to read it in Full View, backspace or delete to remove it from this Map, and escape to cancel a move or unselect it. From a selected Resource, press the arrow keys to go along the Active Graph, or shift and the arrow keys to move it.';

const ARIA_LABEL_CONFIG = {
  'node.a11yDescription.default': RESOURCE_KEYS_DESCRIPTION,
  'node.a11yDescription.keyboardDisabled': RESOURCE_KEYS_DESCRIPTION,
  'edge.a11yDescription.default':
    'Press backspace or delete to remove this Edge from its Graph, or escape to deselect it.',
} as const;

const subscribeToNothing = (): (() => void) => () => undefined;

/**
 * The Resource a key came from, or `null` if it came from anywhere else.
 *
 * Answered from the projection rather than from the DOM id alone, which is what
 * keeps a second canvas's node — a story, a catalogue page — from naming a Resource
 * this Map is not drawing.
 */

/**
 * What a drag carrying files is over. `'place'` is the canvas's empty pane,
 * which takes the files at the drop point. `'refuse'` is anywhere else the
 * canvas draws — a Resource, a Map an Open Space Resource draws, a panel — where
 * placing at the drop point would cover what is there, or author this Map at a
 * point read from another; the drag is still claimed, with no effect, so the
 * browser does not open the file in place of the Space. `null` is a drag that
 * is not the canvas's to answer: no files, no authoring, or a field or control
 * that takes a drop of its own.
 */
const fileDropAt = (
  event: ReactDragEvent<HTMLDivElement>,
  authorOnCanvas: boolean,
): 'place' | 'refuse' | null => {
  if (!authorOnCanvas || !event.dataTransfer.types.includes('Files')) return null;
  if (!(event.target instanceof Element)) return null;
  if (event.target.closest(NOT_A_CANVAS_COMMAND) !== null) return null;
  return event.target.closest('.react-flow__pane') !== null &&
    event.target.closest('.react-flow__node') === null
    ? 'place'
    : 'refuse';
};

export interface SpaceCanvasProps {
  /** The canvas's own drawing: its policy, its context and the collaborators it authors through. */
  readonly surface: MapSurface;
  /**
   * What `useMapSurface` answers for `surface` this render. The canvas draws
   * from it alone: the view its projection is built from, the next Resource
   * Title, the render adapter's reading and the availability its surface's
   * policy has narrowed.
   */
  readonly reading: MapSurfaceReading;
  /** Every way a Resource arrives on this canvas: created, dropped or pasted. */
  readonly placement: Pick<
    ResourcePlacementCommands,
    'createResource' | 'dropExistingResource' | 'dropSpace' | 'dropImages' | 'pasteImageUrl'
  >;
  readonly onDrawnClipboardFailuresChange?: (failures: readonly DrawnClipboardFailure[]) => void;
  readonly onDrawnSpacesChange?: (entries: readonly OpenSpace[]) => void;
  /** Where a Space Resource rail's Map report is held. */
  readonly commandOutcomes: CommandOutcomes;
  /** Where a Space Resource rail's Delete Map and Delete Graph ask first. */
  readonly deleteConfirmation: DeleteConfirmation;
  /**
   * The Space's image replacements (ADR 0106), which own the whole attempt.
   * The one way Replace reaches an Image Resource on this canvas that offers it.
   */
  readonly imageReplacement: Pick<ImageReplacements, 'replace'>;
  /** The Space's image picker, which Replace's Upload opens. */
  readonly pickImages: () => Promise<readonly File[]>;
  /**
   * The Resource a completed creation asks to be named, or `null`.
   *
   * The identity, not a flag: each creation mints a fresh one, so a *change* is
   * what says a Resource has just been created — which is how the naming
   * continuation survives being a prop rather than a command. A remount takes
   * nothing with it, because the initial state is whatever arrives with it.
   */
  readonly nameOnCreation: string | null;
  readonly spaceSession: SpaceSession;
  /** What each Space Resource's target offers it, for the Resources of kind `space` on this canvas. */
  readonly spaceResourceTargets?: SpaceResourceTargets;
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
   * widens the exception noted below from "the node wrappers rebuild
   * whenever `nodes` changes identity" to "whenever this canvas renders".
   * Correctness is unaffected, and closing it is the same per-node cache that
   * note already names.
   *
   * Handed the Resource's Connect to Resource group, so the caller places it
   * among the others.
   */
  readonly resourceEntityActions?: (
    resourceId: ResourceId,
    connect: EntityActionGroup,
    canvas: CanvasRailCommands,
  ) => readonly EntityActionGroup[];
  /**
   * Presenting from a Resource, which `P` asks for: whether a Resource is one
   * it presents from (`presentsFrom`), and the command.
   * Absent on a canvas nothing presents from, which includes a hidden Space's
   * and one already presenting.
   */
  readonly presentFrom?: PresentFrom | undefined;
  /**
   * The Resource read in Full View, which `Space` on a focused Resource shows,
   * and the way to change it. Absent on a canvas that offers no Full View.
   */
  readonly fullView?: {
    readonly resourceId: ResourceId | null;
    readonly show: (resourceId: ResourceId | null) => void;
  };
}

const ACROSS_DRAWINGS: CanvasGestureRefusal = { code: 'edge-across-drawings' };
const UNAVAILABLE_DRAWING: CanvasGestureRefusal = { code: 'drawn-map-unavailable' };

const ARROWS = [
  [CANVAS_KEYS.navigateLeft, 'left'],
  [CANVAS_KEYS.navigateRight, 'right'],
  [CANVAS_KEYS.navigateUp, 'up'],
  [CANVAS_KEYS.navigateDown, 'down'],
] as const;

/** The direction a plain arrow along the Active Graph asks for, if this press is one. */
const arrowDirectionOf = (event: KeyboardEvent): NavigationDirection | undefined =>
  ARROWS.find(([binding]) => pressesBinding(binding, event))?.[1];

/** The Active Graph neighbour that lies that way on screen, by the drawn nodes' centres. */
const neighbourOnScreen = (
  edges: readonly NavigatedEdge<ResourceId>[],
  from: ResourceId,
  elementOf: (resourceId: ResourceId) => HTMLElement | null,
  direction: NavigationDirection,
): ResourceId | undefined => {
  const centreOf = (element: Element) => {
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };
  const origin = elementOf(from);
  if (origin === null) return undefined;
  const candidates = graphNeighbours(edges, from).flatMap((id) => {
    const element = elementOf(id);
    return element === null ? [] : [{ id, centre: centreOf(element) }];
  });
  return neighbourToward(centreOf(origin), candidates, direction);
};

/** The Resource a drawn node shows, by the node's id in one drawing. */
const resourceOfNode = (nodes: readonly ResourceFlowNode[], id: string): ResourceId | undefined =>
  nodes.find((node) => node.id === id)?.data.resourceId;

/** The top-left of a collapsed Resource centred on a point, in that point's units. */
const centredAnchor = (point: { readonly x: number; readonly y: number }) => ({
  x: point.x - RESOURCE_SIZE.width / 2,
  y: point.y - RESOURCE_SIZE.height / 2,
});

/** Where an Edge drawn inside an embedded Map began: the embedding node's id, and the Resource dragged from. */
interface EmbeddedConnectionStart {
  readonly parentId: string;
  readonly from: ResourceId;
}

export function SpaceCanvas({
  surface,
  reading,
  placement,
  onDrawnClipboardFailuresChange,
  onDrawnSpacesChange,
  commandOutcomes,
  deleteConfirmation,
  imageReplacement,
  pickImages,
  nameOnCreation,
  spaceSession,
  spaceResourceTargets,
  resourceEntityActions,
  presentFrom,
  fullView,
}: SpaceCanvasProps) {
  const {
    view,
    newResourceTitle,
    canvasRendering,
    availability,
    setEditingResourceBody,
    setEditingResourceTitle,
  } = reading;
  const {
    liveProjection,
    projected,
    selection,
    changeNodes,
    changeEdges,
    selectResource,
    selectEdge,
    resourceResize,
    reportEmbeddedMapEditing,
  } = canvasRendering;
  const nodes = useMemo(() => liveProjection?.nodes ?? [], [liveProjection]);
  const latestNodes = useRef(nodes);
  useLayoutEffect(() => {
    latestNodes.current = nodes;
  }, [nodes]);
  const edges = useMemo(() => liveProjection?.edges ?? [], [liveProjection]);
  // Null while a replacement placement resolves. The canvas keeps drawing the
  // Resources on screen through that window, so a connection is reachable with
  // no fresh projection to hand over, and the store keeps its live nodes rather
  // than reconciling against nothing (`render-adapter.test.ts`, "keeps the
  // Resources on screen when a connection completes with no fresh projection").
  const projectedNodes = projected?.nodes ?? null;
  // That the render adapter holds a projection — so `nodes` is what it holds,
  // not the empty list that stands in for none. No gesture here waits for
  // `projected`: a Resource held while a replacement placement resolves stays
  // authorable (`SpaceCanvas.test.tsx`, "a %s held while a replacement
  // placement resolves").
  const { hasResourcesOnCanvas } = canvasRendering;
  const { authoring, edgeAuthoring } = surface;
  const context = surface.context();
  const { mapId, graphId: activeGraphId } = context;
  // That a traversal is running — the Navigation mode, not an availability
  // answer. What presenting withdraws from authoring is `availability`'s to
  // say; this reaches only the click that resumes an embedded read of a Space
  // that has been Exited, which nothing edits.
  const presenting = context.kind === 'canvas' && context.presentingResourceId !== null;
  const placedResources = view.placedResources;
  const { visibleGraphs: graphs, colors: colorByGraphId } = view.projection;
  const mapTitle = view.selectedMap.map.title;
  const spaceTitle = view.space.title;
  const { createResource, dropExistingResource, dropSpace, dropImages, pasteImageUrl } = placement;
  const addCanvasResource = useCallback(() => createResource(DEFAULT_KIND), [createResource]);
  const { screenToFlowPosition, getZoom, setCenter } = useReactFlow();

  const spaces = useOpenSpaces();
  const thisSpaceId = spaceSession.getState().working.id;
  const activeSpaceId = useSyncExternalStore(spaces?.subscribe ?? subscribeToNothing, () =>
    spaces === null ? null : spaces.getState().activeSpaceId,
  );
  const readThisCanvasOpeningFraming = (): SpaceResourceFraming | undefined => {
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
  // The canvas's own policy is the ceiling its first-level Maps inherit.
  // Transient withdrawals — presenting, another authoring surface, an image
  // replacement — reach those Maps as availability (`spaceOnCanvas` below),
  // never as a change of policy (ADR 0112).
  const rootPolicy = surface.context().policy;
  const embeddedRoot = useMemo(
    () => ({ spaceId: thisSpaceId, mapId, policy: rootPolicy }),
    [thisSpaceId, mapId, rootPolicy],
  );
  const {
    embeddedRequests,
    embeddedPublications,
    embeddedFailures,
    resumeEmbedded,
    publishEmbedded,
    reportBodyHeight,
    editingPortals,
    onPortalEditingChange: setPortalEditing,
    portalDraft,
    setPortalDraft,
  } = useEmbeddedOpenSpaceResources(nodes, spaces, draggingIds, embeddedRoot, hasResourcesOnCanvas);

  const onPortalEditingChange = useCallback(
    (resourceId: ResourceId, editing: boolean) => {
      setPortalEditing(resourceId, editing);
      if (!editing) selectResource(resourceId);
    },
    [setPortalEditing, selectResource],
  );

  const drawnSpaces = useMemo(
    () => [
      ...new Map(
        embeddedRequests.flatMap((request) =>
          request.entry === undefined ? [] : [[request.entry.id, request.entry] as const],
        ),
      ).values(),
    ],
    [embeddedRequests],
  );
  useEffect(() => {
    onDrawnSpacesChange?.(drawnSpaces);
  }, [drawnSpaces, onDrawnSpacesChange]);

  const clipboardFailures = useMemo(
    () =>
      embeddedRequests.flatMap((request) => {
        const failure = embeddedPublications.get(request.parent.id)?.clipboardFailure;
        return failure == null ? [] : [failure];
      }),
    [embeddedRequests, embeddedPublications],
  );
  useEffect(() => {
    onDrawnClipboardFailuresChange?.(clipboardFailures);
  }, [clipboardFailures, onDrawnClipboardFailuresChange]);

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
   * `authorOnCanvas`, and why a connection survives a live embedded edit that
   * `authorOnCanvas` withdraws.
   */
  const embeddedEditing = editingEmbeddingIds.size > 0;
  useLayoutEffect(() => {
    reportEmbeddedMapEditing(embeddedEditing);
    return () => reportEmbeddedMapEditing(false);
  }, [embeddedEditing, reportEmbeddedMapEditing]);
  /**
   * The open Connect list: its source, the Actions trigger it hangs from, and
   * the Map it was opened on. It is disposed of during render when authoring is
   * withdrawn, another Map is selected, or the source stops being placed, so it
   * never outlives its context (`resource-rail-actions.test.tsx`).
   */
  const [connecting, setConnecting] = useState<{
    readonly from: ResourceId;
    readonly anchor: HTMLElement | null;
    readonly mapId: MapId;
  } | null>(null);
  const connectingLive =
    connecting !== null && availability.authorOnCanvas && connecting.mapId === mapId;
  if (connecting !== null && !connectingLive) setConnecting(null);
  const connectingFrom = !connectingLive
    ? undefined
    : placedResources.find((resource) => resource.id === connecting.from);
  const openConnect: Connecting | null =
    connecting === null || connectingFrom === undefined
      ? null
      : { from: connectingFrom, anchor: connecting.anchor };
  /**
   * Open and expand (ADR 0137): one Edit Opening the Resource at the size its
   * content needs, capped at what this canvas shows at the current zoom, after
   * which the camera centres it at that zoom. The camera is the canvas's own,
   * so only its own Map's Resources are given it.
   */
  const openAndExpand = useCallback(
    (resourceId: ResourceId): void => {
      // Read when pressed, so the action factory below is not rebuilt on every
      // projection a drag or a selection publishes.
      const node = latestNodes.current.find((each) => each.data.resourceId === resourceId);
      const resource = view.space.lookup.resource(resourceId);
      const area = canvasRef.current;
      if (node === undefined || resource === undefined || area === null) return;
      if (!takesOpen(resource.kind)) return;
      const zoom = getZoom();
      const content = resolveResourceContent(view.space, resource);
      const size = openAndExpandSize(
        {
          width: node.width ?? COLLAPSED_RESOURCE_SIZE.width,
          height: node.height ?? COLLAPSED_RESOURCE_SIZE.height,
        },
        visibleCanvasCap(area.getBoundingClientRect(), zoom),
        (at) => openHeight(area, node, content, at),
      );
      const result = authoring.complete({ kind: 'opened-resource-to-fit', resourceId, size });
      if (result.kind === 'refused') return;
      // Issued, never awaited (ADR 0043). The Resource's top-left stays where
      // it is, so its new rect is known before the projection draws it.
      void setCenter(node.position.x + size.width / 2, node.position.y + size.height / 2, {
        zoom,
        duration: 0,
      });
    },
    [view.space, getZoom, setCenter, authoring],
  );
  /** Present from Here, on the canvas's own Map: what `P` and the rail item both run. */
  const presentFromHere = useMemo(
    () => presentFromHereCommand({ presentFrom, mayPresent: availability.present }),
    [presentFrom, availability.present],
  );
  /** Whether Open and expand is offered on a Resource of the canvas's own Map. */
  const expandable = useCallback(
    (resourceId: ResourceId): boolean => {
      const resource = view.space.lookup.resource(resourceId);
      return (
        availability.authorOnCanvas &&
        resource !== undefined &&
        takesOpen(resource.kind) &&
        placedResources.some((placed) => placed.id === resourceId)
      );
    },
    [availability.authorOnCanvas, view.space, placedResources],
  );
  /** Read in Full View, on the canvas's own Map: what Space and the rail item both run. */
  const showFullViewHere = useMemo(
    () =>
      showFullViewCommand({
        show: fullView === undefined ? undefined : (resourceId) => fullView.show(resourceId),
        selectNodes: availability.selectNodes,
      }),
    [fullView, availability.selectNodes],
  );
  /**
   * Connect to Resource, for placed Resources only. Choosing it selects the
   * Resource: the list is portalled out of it, so without the selection moving
   * into the list would withdraw the rail and the trigger the list hangs from.
   */
  const resourceActions = useMemo(
    () =>
      resourceEntityActions === undefined
        ? undefined
        : (resourceId: ResourceId) =>
            resourceEntityActions(
              resourceId,
              // Connecting is an Edit, so it goes where the canvas's authoring goes.
              availability.authorOnCanvas &&
                placedResources.some((resource) => resource.id === resourceId)
                ? [
                    {
                      id: 'connect',
                      label: 'Connect to Resource',
                      icon: <GraphIcon size={14} />,
                      onSelect: (opener) => {
                        selectResource(resourceId);
                        setConnecting({ from: resourceId, anchor: opener, mapId });
                        return 'done';
                      },
                    },
                  ]
                : [],
              {
                openAndExpand: bindCommand(OPEN_AND_EXPAND, {
                  resourceId,
                  canvas: { expandable, openAndExpand },
                }),
                fullView: bindCommand(showFullViewHere, { resourceId }),
                present: bindCommand(presentFromHere, resourceId),
              },
            ),
    [
      resourceEntityActions,
      availability.authorOnCanvas,
      placedResources,
      selectResource,
      mapId,
      expandable,
      openAndExpand,
      showFullViewHere,
      presentFromHere,
    ],
  );
  const resourceAuthoring = useCanvasResourceAuthoring({
    continuation: surface.continuation,
    commandOutcomes,
    deleteConfirmation,
    nodes,
    availability,
    nameOnCreation,
    authoring,
    spaceSession,
    resourceResize,
    onSelectResource: selectResource,
    imageReplacement,
    pickImages,
    spaceResourceTargets,
    resourceEntityActions: resourceActions,
    portalEditing: editingPortals,
    onPortalEditingChange,
  });
  const {
    bodyEditing,
    openResource: onOpenResource,
    beginTitleEditing,
    completeSpaceResourceFraming,
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
    setEditingResourceBody(bodyEditing || embeddedBodyEditing);
  }, [bodyEditing, embeddedBodyEditing, setEditingResourceBody]);
  useEffect(() => {
    setEditingResourceTitle(resourceAuthoring.titleEditing || embeddedTitleEditing);
    return () => setEditingResourceTitle(false);
  }, [resourceAuthoring.titleEditing, embeddedTitleEditing, setEditingResourceTitle]);
  const liveEmbeddings = useMemo(
    () =>
      embeddedRequests.flatMap((request) => {
        const value = embeddedPublications.get(request.parent.id);
        if (value?.mapId !== request.mapId) return [];
        if (request.entry === value.entry) return [value];
        return [
          {
            ...value,
            availability: surfaceAvailability(value.availability, request.policy, 'drawn'),
            changeNodes: () => undefined,
            edges: value.edges.map((edge) => ({
              ...edge,
              selected: false,
              selectable: false,
              focusable: false,
              deletable: false,
            })),
            // The three Resource commands aimed at a retained read answer it the
            // same way: reopen the target's session so the next press acts.
            // The canvas still announces that delete removes the focused Resource
            // from its Map, and this drawing is still focusable, so an
            // answer of `null` alone would consume the key and do nothing at all.
            // There is no refusal to report either — the target is not open,
            // which is a state this press ends rather than a refused Edit.
            removeFromMap: () => {
              void resumeEmbedded(request.spaceId);
            },
            nodes: value.nodes.map((node): ResourceFlowNode => {
              const stamped = withSurfacePolicy(
                clipEmbeddedNode(node, request.bounds),
                request.policy,
              );
              return {
                ...stamped,
                data: {
                  ...stamped.data,
                  onOpenChange: () => {
                    void resumeEmbedded(request.spaceId);
                    return 'retained';
                  },
                  onBeginTitleEditing: () => {
                    void resumeEmbedded(request.spaceId);
                  },
                },
              };
            }),
          },
        ];
      }),
    [embeddedRequests, embeddedPublications, resumeEmbedded],
  );

  useEffect(() => {
    const drawn = [surface, ...liveEmbeddings.map((entry) => entry.surface)];
    return observeMapSurfaces(drawn);
  }, [surface, liveEmbeddings]);

  const embeddingAt = useCallback(
    (point: { readonly x: number; readonly y: number }) =>
      [...embeddedRequests]
        .reverse()
        .find(
          ({ absolute, bounds }) =>
            point.x >= absolute.x + bounds.left &&
            point.x <= absolute.x + bounds.right &&
            point.y >= absolute.y + bounds.top &&
            point.y <= absolute.y + bounds.bottom,
        ),
    [embeddedRequests],
  );

  const embedConnectFrom = useRef<EmbeddedConnectionStart | null>(null);
  // The embedding a connection in flight started in, as state so the preview
  // redraws in that embedding's Graph when one starts. The ref above stays the
  // one `mayOfferEmbedded` reads: Edge Authoring calls it through a ref of its
  // own that is refreshed after commit, so a closure over this state would
  // answer from the render before the connection started.
  const [embeddedConnectionParent, setEmbeddedConnectionParent] = useState<string | null>(null);

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
  const commandsByEdge = useMemo(
    () =>
      new Map(
        liveEmbeddings.flatMap((value) =>
          value.edges.map((edge) => [edge.id, value.edgeSurface.commands] as const),
        ),
      ),
    [liveEmbeddings],
  );
  const edgeSurface = useEdgeAuthoring({
    commandsByEdge,
    authoring: edgeAuthoring,
    edges,
    projectedNodes,
    selection,
    activeGraphId,
    graphs,
    placedResources,
    newResourceTitle,
    enabled: availability.authorOnCanvas,
    onSelectEdge: selectEdge,
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
  // needs a per-node cache or the callbacks moved into context; it is a known
  // exception rather than an oversight.

  // No pointer gesture on a Resource's body opens it (ADR 0036). A click is left to
  // React Flow, which selects; the Title is its own one-activation control
  // (ADR 0065), whose events stop before this canvas handler. Opening is the
  // affordance and the Resource-level keyboard command.

  const occurrences = useMemo(
    () => [
      {
        id: CANVAS_OCCURRENCE,
        addResource: addCanvasResource,
        nodes,
        authoring,
        availability,
        bodyEditing: resourceAuthoring.bodyEditing,
        openResource: onOpenResource,
        beginTitleEditing,
        selection,
        removeFromMap: removeFromMapReportedBy(commandOutcomes, authoring),
        edgeAuthoring,
        deleteSelectedEdge: () =>
          edgeSurface.deleteEdges(edgeSurface.edges.filter((edge) => edge.selected)),
      },
      ...liveEmbeddings.map((value) => ({
        id: value.surface.occurrence(),
        addResource: () => value.placement.createResource(DEFAULT_KIND),
        nodes: value.nodes,
        authoring: value.surface.authoring,
        availability: value.availability,
        bodyEditing: value.bodyEditing,
        selection: value.surface.adapter.getState().selection,
        openResource: (id: string) => {
          const resourceId = resourceOfNode(value.nodes, id);
          if (resourceId !== undefined) value.openResource(resourceId);
        },
        beginTitleEditing: (id: string) => {
          const resourceId = resourceOfNode(value.nodes, id);
          if (resourceId !== undefined) value.beginTitleEditing(resourceId);
        },
        removeFromMap: value.removeFromMap,
        edgeAuthoring: value.surface.edgeAuthoring,
        deleteSelectedEdge: () => {
          const selected = value.surface.adapter.getState().selection;
          if (selected.kind !== 'edge') return;
          value.surface.edgeAuthoring.askToDelete([selected], (target) => {
            if (target.kind !== 'resource') return canvasRef.current;
            const node = value.nodes.find(
              (candidate) => candidate.data.resourceId === target.resourceId,
            );
            return node === undefined
              ? canvasRef.current
              : document.querySelector<HTMLElement>(
                  `.react-flow__node[data-id="${CSS.escape(node.id)}"]`,
                );
          });
        },
      })),
    ],
    [
      nodes,
      authoring,
      commandOutcomes,
      availability,
      resourceAuthoring.bodyEditing,
      onOpenResource,
      beginTitleEditing,
      selection,
      edgeAuthoring,
      edgeSurface,
      liveEmbeddings,
      addCanvasResource,
    ],
  );

  /** The Active Graph's Edges as Graph navigation reads them, and each Resource's drawn node. */
  const activeGraphLinks = (canvas: HTMLElement) => {
    const elementOf = (resourceId: ResourceId): HTMLElement | null => {
      const node = nodes.find((each) => each.data.resourceId === resourceId);
      return node === undefined
        ? null
        : canvas.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`);
    };
    const edgesOfGraph = edges.flatMap((edge) => {
      const subject = edgeSelectionOf(edge);
      return context.graphId !== null && subject?.graphId === context.graphId
        ? [{ source: subject.edge.from, target: subject.edge.to }]
        : [];
    });
    return { edges: edgesOfGraph, elementOf };
  };

  /**
   * The Active Graph walk from the focused Resource, or `null` where there is
   * none to take: only from the Resource node itself, so a key on one of its
   * controls is that control's, and only on the canvas's own Map.
   */
  const graphNavigationFrom = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!availability.selectNodes) return null;
    const focused = event.target;
    if (!(focused instanceof HTMLElement) || !focused.matches('.react-flow__node[data-id]'))
      return null;
    const from = resourceOfNode(nodes, focused.dataset['id'] ?? '');
    if (from === undefined) return null;
    const { edges: edgesOfGraph, elementOf } = activeGraphLinks(event.currentTarget);
    /** Select and focus a Resource; React Flow pans it into view (`autoPanOnNodeFocus`). */
    const moveTo = (resourceId: ResourceId | undefined): void => {
      const next = resourceId === undefined ? null : elementOf(resourceId);
      if (resourceId === undefined || next === null) return;
      selectResource(resourceId);
      next.focus();
    };
    return { from, focused, edges: edgesOfGraph, elementOf, moveTo };
  };

  /**
   * From a selected Resource, a plain arrow follows the Active Graph's Edge
   * that way instead of nudging the Resource, which moves to Shift+arrow. Answered in the capture phase,
   * because React Flow's own node handler nudges on the way back up and would
   * otherwise see the press first. Positions are read from the drawn nodes, in
   * screen space, where "right" is what the author sees as right.
   */
  const arrowAlongGraph = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const press = event.nativeEvent;
    if (!ARROWS.some(([binding]) => binding.keys.some((key) => key === press.key))) return;
    // Shift and an arrow, held or not, is React Flow's nudge.
    if (press.shiftKey && !press.ctrlKey && !press.metaKey && !press.altKey) return;
    const navigation = graphNavigationFrom(event);
    if (navigation === null) return;
    // Only from a selected Resource. A Resource focused but not selected, as
    // the browser's Tab or Escape leaves it, has nothing React Flow would
    // nudge, so the arrow is left alone.
    const focusedId = navigation.focused.dataset['id'];
    if (nodes.find((node) => node.id === focusedId)?.selected !== true) return;
    // React Flow nudges on every other arrow press too, ignoring repeats and
    // modifiers, so each one stops here. A modified arrow keeps the browser's
    // meaning; a held one is spent without going further.
    event.stopPropagation();
    if (press.ctrlKey || press.metaKey || press.altKey) return;
    event.preventDefault();
    const direction = arrowDirectionOf(press);
    if (direction === undefined) return;
    navigation.moveTo(
      neighbourOnScreen(navigation.edges, navigation.from, navigation.elementOf, direction),
    );
  };

  // Full View walks the Active Graph with the canvas's keys, reading the
  // positions of the nodes it covers, which stay drawn beneath it. Every key
  // pressed in it stops there, so no canvas command runs on a Map that cannot
  // be seen; the Dock above it keeps its own.
  const fullViewOf = fullView?.resourceId ?? null;
  const fullViewKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    fromContent: boolean,
  ): void => {
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (fullView === undefined || fullViewOf === null || canvas === null) return;
    if (keyBelongsElsewhere(event.nativeEvent)) return;
    if (pressesBinding(FULL_VIEW_KEYS.leave, event.nativeEvent)) {
      event.preventDefault();
      leaveFullView(false);
      return;
    }
    if (pressesBinding(FULL_VIEW_KEYS.openOnCanvas, event.nativeEvent)) {
      event.preventDefault();
      leaveFullView(true);
      return;
    }
    // The walk is the content's: an arrow on the view's own buttons is theirs.
    if (!fromContent) return;
    const { edges: edgesOfGraph, elementOf } = activeGraphLinks(canvas);
    const moveTo = (resourceId: ResourceId | undefined): void => {
      if (resourceId === undefined || elementOf(resourceId) === null) return;
      selectResource(resourceId);
      fullView.show(resourceId);
    };
    const direction = arrowDirectionOf(event.nativeEvent);
    if (direction !== undefined) {
      event.preventDefault();
      moveTo(neighbourOnScreen(edgesOfGraph, fullViewOf, elementOf, direction));
    }
  };

  /** Back to the canvas, on the Resource last read, Opening it there when asked and allowed. */
  const leaveFullView = (open: boolean): void => {
    if (fullView === undefined || fullViewOf === null) return;
    fullView.show(null);
    const node = nodes.find((each) => each.data.resourceId === fullViewOf);
    if (node === undefined) return;
    selectResource(fullViewOf);
    // Ahead of the render that would lift it, so the node can take focus now.
    canvasRef.current?.removeAttribute('inert');
    canvasRef.current
      ?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`)
      ?.focus();
    if (open && availability.authorOnCanvas && !bodyEditing) onOpenResource(node.id);
  };

  // Full View lasts while its Resource is drawn here and the canvas may be
  // selected on: presenting, another Map or a removal ends it.
  const fullViewDrawn =
    fullViewOf !== null &&
    availability.selectNodes &&
    nodes.some((node) => node.data.resourceId === fullViewOf);
  useEffect(() => {
    if (fullViewOf !== null && !fullViewDrawn) fullView?.show(null);
  }, [fullView, fullViewOf, fullViewDrawn]);

  // Full View is modal over the canvas it covers: focus cannot move into the
  // Map beneath it, and the Space's dispatcher answers no canvas key while it
  // is shown, so nothing is authored where it cannot be seen. An attribute rather than a
  // prop, because the React this application runs on does not know `inert`.
  const fullViewShown = fullView !== undefined && fullViewDrawn;
  useLayoutEffect(() => {
    canvasRef.current?.toggleAttribute('inert', fullViewShown);
  }, [fullViewShown]);
  useKeyCover('full-view', fullViewShown);

  // Enter, Shift+Enter and Space are aimed at the focused Resource: the node the
  // press landed on, inside this canvas, and never one of its own controls,
  // content or editor. The narrow guard is load-bearing rather than defensive:
  // an Open Resource draws its editor *inside* the node, so a Space typed into
  // it would otherwise be taken before the document ever received the
  // character. Enter Opens on whichever drawn Map holds the node; Shift+Enter
  // and Space act on the canvas's own Map, whose camera and Full View they use.
  const focusedNodeOf = useCallback((event: KeyboardEvent): string | undefined => {
    if (!(event.target instanceof Element)) return undefined;
    const node = event.target.closest<HTMLElement>('.react-flow__node[data-id]');
    if (node === null || canvasRef.current?.contains(node) !== true) return undefined;
    return node.dataset['id'];
  }, []);
  // A body edit holds the canvas's Enter and Space keys though not its rail, so
  // a press while one is open finds no Resource to aim at.
  const ownResourceOf = (event: KeyboardEvent): OwnResourceTarget | undefined => {
    const nodeId = bodyEditing ? undefined : focusedNodeOf(event);
    const resourceId = nodeId === undefined ? undefined : resourceOfNode(nodes, nodeId);
    return resourceId === undefined ? undefined : { resourceId };
  };
  useKeyAnswers(
    [
      {
        id: OPEN_RESOURCE.id,
        answer: (event: KeyboardEvent) =>
          answerCommand(OPEN_RESOURCE, event, (): OpenTarget | undefined => {
            const nodeId = focusedNodeOf(event);
            if (nodeId === undefined) return undefined;
            for (const occurrence of occurrences) {
              const node = occurrence.nodes.find((each) => each.id === nodeId);
              if (node === undefined) continue;
              return {
                occurrence: {
                  authorOnCanvas: occurrence.availability.authorOnCanvas,
                  // The canvas's own body edit holds the keyboard on every Map it draws.
                  bodyEditing: bodyEditing || occurrence.bodyEditing,
                  openResource: occurrence.openResource,
                },
                nodeId,
                takesOpen: takesOpen(node.data.kind),
              };
            }
            return undefined;
          }),
      },
      {
        id: OPEN_AND_EXPAND.id,
        answer: (event: KeyboardEvent) =>
          answerCommand(OPEN_AND_EXPAND, event, () => {
            const own = ownResourceOf(event);
            return own === undefined
              ? undefined
              : { ...own, canvas: { expandable, openAndExpand } };
          }),
      },
      {
        id: showFullViewHere.id,
        answer: (event: KeyboardEvent) =>
          answerCommand(showFullViewHere, event, () => ownResourceOf(event)),
      },
    ],
    'canvas',
  );

  // `P` presents the Active Graph from the selected Resource of this canvas's own
  // Map, through the command the rail's Present from Here runs. Nothing on the
  // canvas answers while Full View covers it.
  useKeyAnswers(
    [
      keyAnswerOf(
        presentFromHere,
        () =>
          occurrences
            .find((value) => value.id === CANVAS_OCCURRENCE)
            ?.nodes.find((node) => node.selected)?.data.resourceId,
      ),
    ],
    'canvas',
  );

  // `C` adds a Resource to the Map holding the selection, or else to the
  // canvas's own, from wherever focus is — the Dock included — except a surface
  // that owns its keys. `F2` renames the selected Resource on whichever drawn
  // Map holds it, and is the *only* answer to that key: a second, such as a
  // React Flow `onKeyDown` branch, would be an unguarded one, renaming whichever
  // Resource is selected when the key is typed into a control. Neither answers
  // while Full View covers the canvas, and either leaves its key alone where its
  // command cannot run (`docs/agents/rendering.md`'s keyboard contract).
  const authoringOf = (occurrence: (typeof occurrences)[number]): AuthoringOccurrence => ({
    authorOnCanvas: occurrence.availability.authorOnCanvas,
    bodyEditing: occurrence.bodyEditing,
    addResource: occurrence.addResource,
    beginTitleEditing: occurrence.beginTitleEditing,
  });
  useKeyAnswers(
    [
      keyAnswerOf(ADD_RESOURCE, () => {
        const current =
          occurrences.find(
            (value) => value.selection.kind !== 'none' || value.nodes.some((node) => node.selected),
          ) ?? occurrences.find((value) => value.id === CANVAS_OCCURRENCE);
        return current === undefined ? undefined : authoringOf(current);
      }),
      keyAnswerOf(RENAME_RESOURCE, () => {
        for (const occurrence of occurrences) {
          const selected = occurrence.nodes.find((node) => node.selected);
          if (selected !== undefined)
            return { occurrence: authoringOf(occurrence), nodeId: selected.id };
        }
        return undefined;
      }),
    ],
    'canvas',
  );

  // The operations, not the surface holding them: `useEdgeAuthoring` answers a
  // fresh object literal per render while each of these is stable, and a hook
  // that depended on the object would be rebuilt every time.
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
        const withHeight = reportsBodyHeight(node)
          ? {
              ...node,
              data: { ...node.data, onBodyHeightChange: reportBodyHeight },
            }
          : node;
        if (
          !editingPortals.has(withHeight.data.resourceId) ||
          !authorsEmbeddedMap(withHeight.data)
        ) {
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
    const byId = new Map<string, ResourceFlowNode>();
    for (const node of nodes) byId.set(node.id, node);
    for (const value of liveEmbeddings) {
      for (const child of value.nodes) byId.set(child.id, child);
    }
    return byId;
  }, [nodes, liveEmbeddings]);
  const canvasEdges = useMemo(
    () => [...edgeSurface.edges, ...liveEmbeddings.flatMap((value) => value.edges)],
    [edgeSurface.edges, liveEmbeddings],
  );
  const changeCanvasEdges = useCallback<OnEdgesChange>(
    (changes) => {
      const rootChanges = changes.filter((change) => {
        if (change.type === 'add') return true;
        const owner = liveEmbeddings.find((value) =>
          value.edges.some((edge) => edge.id === change.id),
        );
        if (owner === undefined) return true;
        if (change.type !== 'select' || !owner.availability.authorOnCanvas) return false;
        const edge = owner.edges.find((candidate) => candidate.id === change.id);
        const subject = edge === undefined ? null : edgeSelectionOf(edge);
        if (subject === null) return false;
        const adapter = owner.surface.adapter.getState();
        if (change.selected) adapter.selectEdge(subject);
        else if (sameSelection(adapter.selection, subject)) adapter.clearSelection();
        return false;
      });
      changeEdges(rootChanges);
    },
    [liveEmbeddings, changeEdges],
  );
  // A stable identity, or React Flow warns of a fresh `edgeTypes` object (#002).
  const canvasEdgeTypes = useMemo(
    () => withEmbeddedEdgeTypes(edgeSurface.edgeTypes),
    [edgeSurface.edgeTypes],
  );
  const changeCanvasNodes: OnNodesChange<ResourceFlowNode> = useCallback(
    (changes) => {
      changeNodes(changes);
      for (const value of liveEmbeddings) value.changeNodes(changes);
    },
    [changeNodes, liveEmbeddings],
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const portalGestureSnapshot = useRef({
    editingPortals,
    portalNodesById,
    portalDraft,
    embeddedPublications,
    embeddedRequests,
    completeSpaceResourceFraming,
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
      completeSpaceResourceFraming,
      screenToFlowPosition,
      authorOnCanvas: availability.authorOnCanvas,
    };
  }, [
    editingPortals,
    portalNodesById,
    portalDraft,
    embeddedPublications,
    embeddedRequests,
    completeSpaceResourceFraming,
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
      framing: SpaceResourceFraming;
    } | null = null;
    const zoomPending = new Map<ResourceId, SpaceResourceFraming>();
    const zoomTimers = new Map<ResourceId, ReturnType<typeof setTimeout>>();

    const persist = (resourceId: ResourceId, framing: SpaceResourceFraming, dropDraft = true) => {
      if (dropDraft) {
        setPortalDraft((previous) => {
          const next = new Map(previous);
          next.delete(resourceId);
          return next;
        });
      }
      portalGestureSnapshot.current.completeSpaceResourceFraming(resourceId, framing);
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
    ): SpaceResourceFraming | undefined => {
      const session = portalGestureSnapshot.current;
      const drafted = session.portalDraft.get(resourceId);
      if (drafted !== undefined) return drafted;
      const parent = session.portalNodesById.get(parentId);
      const stored =
        parent === undefined ? undefined : spaceViewOf(parent.data.display)?.view.framing;
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
      if (!authorsEmbeddedMap(node.data)) return undefined;
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

  /** What Delete is aimed at: the Resource it lands on, else the selection, inside the canvas only. */
  const removalTargetOf = useCallback(
    (event: KeyboardEvent): RemovalTarget | undefined => {
      if (!(event.target instanceof Element) || canvasRef.current?.contains(event.target) !== true)
        return undefined;
      const focusedNodeId = event.target.closest<HTMLElement>('.react-flow__node[data-id]')
        ?.dataset['id'];
      const occurrence = occurrences.find((value) =>
        focusedNodeId === undefined
          ? value.selection.kind !== 'none' || value.nodes.some((node) => node.selected)
          : value.nodes.some((node) => node.id === focusedNodeId),
      );
      if (occurrence === undefined) return undefined;
      const removal = {
        authorOnCanvas: occurrence.availability.authorOnCanvas,
        bodyEditing: occurrence.bodyEditing,
        removeFromMap: occurrence.removeFromMap,
        deleteSelectedEdge: occurrence.deleteSelectedEdge,
      };
      const node =
        focusedNodeId === undefined
          ? occurrence.nodes.find((each) => each.selected)
          : occurrence.nodes.find((each) => each.id === focusedNodeId);
      if (node !== undefined)
        return {
          occurrence: removal,
          subject: { kind: 'resource' as const, resourceId: node.data.resourceId },
        };
      return occurrence.selection.kind === 'edge'
        ? { occurrence: removal, subject: { kind: 'edge' as const } }
        : undefined;
    },
    [occurrences],
  );
  // Delete and Backspace remove from its Map the Resource they land on, or else
  // the selected one, or delete the selected Edge, on whichever drawn Map holds
  // it: the command the rail's Remove from Map runs, so both report alike. Only
  // a press inside the canvas, and nothing while Full View covers it.
  useKeyAnswers(
    [
      {
        id: REMOVE_SELECTION.id,
        answer: (event: KeyboardEvent) =>
          answerCommand(REMOVE_SELECTION, event, () => removalTargetOf(event)),
      },
    ],
    'canvas',
  );

  // The preview is drawn as the Graph the new Edge joins: the target's shown
  // Graph for a connection between one embedding's Resources, else the Active
  // Graph.
  const preview = useMemo(
    () =>
      (embeddedConnectionParent === null
        ? undefined
        : embeddedPublications.get(embeddedConnectionParent)?.connectionAppearance()) ??
      connectionAppearance(graphs, colorByGraphId, activeGraphId),
    [embeddedConnectionParent, embeddedPublications, graphs, colorByGraphId, activeGraphId],
  );
  const connectionLineStyle = useMemo(
    () => ({ stroke: graphPaint(preview.color), strokeWidth: 3 }),
    [preview.color],
  );

  const {
    onConnect,
    onConnectStart,
    onConnectEnd,
    isValidConnection,
    onMouseMove,
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    edgesReconnectable,
    edgesFocusable,
    deleteKeyCode,
    multiSelectionKeyCode,
    selectionKeyCode,
    selectionOnDrag,
  } = edgeSurface.reactFlowProps;

  const onCanvasEdgeMouseEnter = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      const owner = liveEmbeddings.find((value) => value.edges.some((each) => each.id === edge.id));
      (owner?.edgeSurface.reactFlowProps.onEdgeMouseEnter ?? onEdgeMouseEnter)(event, edge);
    },
    [liveEmbeddings, onEdgeMouseEnter],
  );
  const onCanvasEdgeMouseLeave = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      const owner = liveEmbeddings.find((value) => value.edges.some((each) => each.id === edge.id));
      (owner?.edgeSurface.reactFlowProps.onEdgeMouseLeave ?? onEdgeMouseLeave)(event, edge);
    },
    [liveEmbeddings, onEdgeMouseLeave],
  );
  // A connection is the gesture of the drawing it starts in: React Flow
  // reports to the canvas, and each event is handed to that drawing's own Edge
  // Authoring, which reads the canvas through its `EdgeDrawing`.
  const onEmbeddedConnectStart = useCallback<OnConnectStart>(
    (event, params) => {
      const parsed = parseEmbeddedNodeId(params.nodeId ?? '');
      const owner = parsed === undefined ? undefined : embeddedPublications.get(parsed.parentId);
      if (parsed !== undefined) {
        embedConnectFrom.current = { parentId: parsed.parentId, from: parsed.resourceId };
        setEmbeddedConnectionParent(parsed.parentId);
        owner?.edgeSurface.reactFlowProps.onConnectStart(event, params);
        return;
      }
      embedConnectFrom.current = null;
      setEmbeddedConnectionParent(null);
      onConnectStart(event, params);
    },
    [onConnectStart, embeddedPublications],
  );
  const onEmbeddedConnect = useCallback<OnConnect>(
    (connection) => {
      const routed = canvasNodeConnection(connection.source, connection.target);
      if (routed.kind === 'embedded') {
        embeddedPublications.get(routed.parentId)?.edgeSurface.reactFlowProps.onConnect(connection);
        return;
      }
      if (routed.kind === 'host') onConnect(connection);
      else setCommandRefusal(describeCanvasGestureRefusal(ACROSS_DRAWINGS));
    },
    [embeddedPublications, onConnect],
  );
  const onEmbeddedConnectEnd = useCallback<OnConnectEnd>(
    (event, connection) => {
      const source = connection.fromNode?.id;
      const target =
        connection.toNode?.id ??
        ('clientX' in event
          ? document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLElement>('.react-flow__node[data-id]')?.dataset['id']
          : undefined);
      if (
        source !== undefined &&
        target !== undefined &&
        target !== embedConnectFrom.current?.parentId &&
        canvasNodeConnection(source, target).kind === 'invalid'
      ) {
        setCommandRefusal(describeCanvasGestureRefusal(ACROSS_DRAWINGS));
      }
      const embedded = embedConnectFrom.current;
      embedConnectFrom.current = null;
      setEmbeddedConnectionParent(null);
      if (embedded === null) {
        onConnectEnd(event, connection);
        return;
      }
      embeddedPublications
        .get(embedded.parentId)
        ?.edgeSurface.reactFlowProps.onConnectEnd(event, connection);
    },
    [onConnectEnd, embeddedPublications],
  );

  const isEmbeddedConnectionValid = useCallback<IsValidConnection>(
    (connection) => {
      const routed = canvasNodeConnection(connection.source, connection.target);
      if (routed.kind === 'invalid') return false;
      if (routed.kind === 'embedded') {
        return (
          embeddedPublications
            .get(routed.parentId)
            ?.edgeSurface.reactFlowProps.isValidConnection(connection) === true
        );
      }
      return isValidConnection(connection);
    },
    [embeddedPublications, isValidConnection],
  );

  /**
   * Where a collapsed Resource centred on a screen point is anchored: its
   * top-left in canvas units, which is what every drop and paste authors.
   */
  const anchorAt = useCallback(
    (x: number, y: number) => centredAnchor(screenToFlowPosition({ x, y })),
    [screenToFlowPosition],
  );

  /**
   * The pointer's last position over the canvas, for a paste, which carries
   * none of its own; `null` once it leaves, when a paste lands at the canvas's
   * centre instead.
   */
  const pointer = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const trackPointer = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      const embedded = embedConnectFrom.current;
      if (embedded === null) onMouseMove(event);
      else
        embeddedPublications.get(embedded.parentId)?.edgeSurface.reactFlowProps.onMouseMove(event);
    },
    [onMouseMove, embeddedPublications],
  );
  const forgetPointer = useCallback(() => {
    pointer.current = null;
  }, []);

  /**
   * A pasted image URL creates an Image Resource at the pointer (ADR 0106).
   * Text pasted into a field is the field's, so only a paste the canvas or a
   * Resource on it received is read, and only text an Image Resource may hold.
   */
  const onPaste = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => {
      if (!availability.authorOnCanvas || !(event.target instanceof Element)) return;
      if (event.target.closest(NOT_A_CANVAS_COMMAND) !== null) return;
      const url = event.clipboardData.getData('text/plain').trim();
      if (!isAcceptedImageUrl(url)) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const at = pointer.current ?? {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      const point = screenToFlowPosition(at);
      const request = embeddingAt(point);
      if (request !== undefined) {
        const drawing = embeddedPublications.get(request.parent.id);
        const refusal = drawnDropRefusal(
          request.policy,
          request.depth,
          drawing?.availability.addResource === true,
        );
        if (refusal !== null || drawing === undefined) {
          setCommandRefusal(describeCanvasGestureRefusal(refusal ?? UNAVAILABLE_DRAWING));
          return;
        }
        drawing.placement.pasteImageUrl(url, centredAnchor(drawing.toAuthored(point)));
        setCommandRefusal(null);
        return;
      }
      pasteImageUrl(url, anchorAt(at.x, at.y));
    },
    [
      availability.authorOnCanvas,
      pasteImageUrl,
      anchorAt,
      screenToFlowPosition,
      embeddingAt,
      embeddedPublications,
    ],
  );

  const onExternalDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const request = embeddingAt(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      if (
        request !== undefined &&
        (event.dataTransfer.types.includes('Files') ||
          event.dataTransfer.types.includes(RESOURCE_DRAG_TYPE) ||
          event.dataTransfer.types.includes(SPACE_DRAG_TYPE))
      ) {
        event.preventDefault();
        event.dataTransfer.dropEffect = request.policy === 'authoring' ? 'copy' : 'none';
        return;
      }
      const files = fileDropAt(event, availability.authorOnCanvas);
      if (files !== null) {
        event.preventDefault();
        event.dataTransfer.dropEffect = files === 'place' ? 'copy' : 'none';
        return;
      }
      const { types } = event.dataTransfer;
      if (
        !availability.authorOnCanvas ||
        !(types.includes(RESOURCE_DRAG_TYPE) || types.includes(SPACE_DRAG_TYPE))
      )
        return;
      if (!(event.target instanceof Element) || event.target.closest('.react-flow__pane') === null)
        return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    [availability.authorOnCanvas, embeddingAt, screenToFlowPosition],
  );

  const onExternalDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element) || event.target.closest(NOT_A_CANVAS_COMMAND) !== null)
        return;
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const request = embeddingAt(point);
      if (request !== undefined) {
        event.preventDefault();
        const drawing = embeddedPublications.get(request.parent.id);
        const refusal = drawnDropRefusal(
          request.policy,
          request.depth,
          drawing?.availability.addResource === true,
        );
        if (refusal !== null || drawing === undefined) {
          setCommandRefusal(describeCanvasGestureRefusal(refusal ?? UNAVAILABLE_DRAWING));
          return;
        }
        const anchor = centredAnchor(drawing.toAuthored(point));
        if (event.dataTransfer.types.includes('Files')) {
          drawing.placement.dropImages([...event.dataTransfer.files], anchor);
          setCommandRefusal(null);
        } else {
          const resourceId = uuidSchema.safeParse(event.dataTransfer.getData(RESOURCE_DRAG_TYPE));
          const spaceId = uuidSchema.safeParse(event.dataTransfer.getData(SPACE_DRAG_TYPE));
          // The Resources list lists the canvas's own Space, and a Resource is
          // placed only on a Map of its own Space.
          if (resourceId.success)
            setCommandRefusal(
              drawing.entry.app.currentSpace().lookup.resource(resourceId.data) === undefined
                ? describeCanvasGestureRefusal({ code: 'resource-outside-drawn-space' })
                : drawing.placement.addExistingResource(resourceId.data, anchor, true),
            );
          else if (spaceId.success) {
            void drawing.entry.spaceResources
              .target(spaceId.data)
              .then(async (target) => {
                setCommandRefusal(
                  target === undefined
                    ? describeCanvasGestureRefusal({ code: 'drawn-space-unreadable' })
                    : await drawing.placement.addSpaceResourceFor(target, anchor),
                );
              })
              .catch(drawing.entry.app.reportObserverError);
          }
        }
        return;
      }
      // Files first: a drop from the desktop carries no Resources list type,
      // and the browser would otherwise open the file in place of the Space.
      const files = fileDropAt(event, availability.authorOnCanvas);
      if (files !== null) {
        event.preventDefault();
        if (files === 'place')
          dropImages([...event.dataTransfer.files], anchorAt(event.clientX, event.clientY));
        return;
      }
      if (!availability.authorOnCanvas || !(event.target instanceof Element)) return;
      if (event.target.closest('.react-flow__pane') === null) return;
      // Each source under its own type, so a drop is read as what the list
      // said it carried and never as the other source's id.
      const resourceId = uuidSchema.safeParse(event.dataTransfer.getData(RESOURCE_DRAG_TYPE));
      const spaceId = uuidSchema.safeParse(event.dataTransfer.getData(SPACE_DRAG_TYPE));
      if (!resourceId.success && !spaceId.success) return;
      event.preventDefault();
      // A collapsed Resource centred on the pointer, for either source. That a
      // dropped Space Resource is drawn at this size too, so the anchor centres
      // it, is held by `e2e/space-resource.spec.ts` ("dragging a Space from
      // the Resources list places its Space Resource at the drop point").
      const anchor = anchorAt(event.clientX, event.clientY);
      if (resourceId.success) dropExistingResource(resourceId.data, anchor);
      else if (spaceId.success) dropSpace(spaceId.data, anchor);
    },
    [
      availability.authorOnCanvas,
      dropExistingResource,
      dropSpace,
      dropImages,
      anchorAt,
      screenToFlowPosition,
      embeddingAt,
      embeddedPublications,
    ],
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

  const canvas = (
    <>
      <ReactFlow
        ref={canvasRef}
        nodes={canvasNodes}
        edges={canvasEdges}
        nodeTypes={nodeTypes}
        edgeTypes={canvasEdgeTypes}
        onNodesChange={changeCanvasNodes}
        {...embeddedEvents}
        onEdgesChange={changeCanvasEdges}
        // Edge Authoring's own properties, named one by one rather than spread, so
        // no property order below can silently replace one of its handlers.
        onConnect={onEmbeddedConnect}
        onConnectStart={onEmbeddedConnectStart}
        onConnectEnd={onEmbeddedConnectEnd}
        isValidConnection={isEmbeddedConnectionValid}
        onMouseMove={trackPointer}
        onMouseLeave={forgetPointer}
        onPaste={onPaste}
        onEdgeMouseEnter={onCanvasEdgeMouseEnter}
        onEdgeMouseLeave={onCanvasEdgeMouseLeave}
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
        onKeyDownCapture={arrowAlongGraph}
        // Programmatically focusable, and deliberately not a tab stop. React Flow's
        // native Edge Escape calls `blur()`, which leaves focus on `body` — not an
        // authoring context — and its pane carries no `tabindex`, so there is
        // nothing for the repair to focus without this. Negative, so the canvas
        // never becomes a stop a keyboard author has to pass through.
        tabIndex={-1}
        fitView={openingFraming === undefined}
        fitViewOptions={OVERVIEW_FIT}
        // Nothing on a Resource answers a double click. The Title is a
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
        // **Not `authorOnCanvas`**: a live embedded edit leaves a pointer
        // connection alone, and `authoring-availability.ts` records why.
        nodesConnectable={availability.connectOnCanvas}
        ariaLabelConfig={ARIA_LABEL_CONFIG}
        // No `connectionMode`: the default is Strict, and every legal drop here is
        // already source-to-target. Loose only adds source-to-source, which the
        // authoring handles refuse via `isConnectableEnd` and the graph ports via
        // `pointer-events: none` — so it would advertise a capability the design forbids.
        connectionLineStyle={connectionLineStyle}
        connectionLineComponent={GraphConnectionLine}
        minZoom={0.2}
        // React Flow's default ceiling of 2 stops an author well short of reading
        // one Resource at screen size. See `MAX_ZOOM`.
        maxZoom={MAX_ZOOM}
      >
        <ChromeContinuation
          continuation={surface.continuation}
          within={canvasRef}
          chromeRenameReady={availability.authorOnCanvas}
        />
        <Background gap={24} />
        <GraphHeadMarkers />
        <svg aria-hidden="true" width={0} height={0}>
          <defs>
            {embeddedRequests.map(({ parent, absolute, bounds, tiltCenter }) => (
              <clipPath
                key={parent.id}
                id={embeddedClipId(parent.id)}
                clipPathUnits="userSpaceOnUse"
              >
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
          request.entry?.app.currentSpace().lookup.map(request.mapId) === undefined ? null : (
            <EmbeddedMapAuthoring
              key={`${request.parent.id}:${request.mapId}`}
              parent={request.parent}
              entry={request.entry}
              mapId={request.mapId}
              graphId={request.graphId}
              policy={request.policy}
              spaceOnCanvas={
                availability.authorInEmbeddedMap &&
                (!embeddedEditing || editingEmbeddingIds.has(request.parent.id))
              }
              framing={
                portalDraft.get(request.parent.data.resourceId) ??
                spaceViewOf(request.parent.data.display)?.view.framing
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
        <OpeningFramingCamera framing={openingFraming} />
        {edgeSurface.layer}
        <ResourceConnect
          connecting={openConnect}
          placed={placedResources}
          edgeAuthoring={edgeAuthoring}
          projectedNodes={projectedNodes}
          onClose={() => setConnecting(null)}
        />
      </ReactFlow>
      {fullViewShown ? (
        <FullView
          space={view.space}
          resourceId={fullViewOf}
          onLeave={() => leaveFullView(false)}
          onOpen={availability.authorOnCanvas ? () => leaveFullView(true) : null}
          onKeyDown={fullViewKeyDown}
        />
      ) : null}
    </>
  );
  return edgeSurface.provide(
    <GraphConnectionLineHeadShape headShape={preview.headShape}>
      {canvas}
    </GraphConnectionLineHeadShape>,
  );
}
