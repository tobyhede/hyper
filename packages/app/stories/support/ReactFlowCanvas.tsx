import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import type { ResourceId, GraphId, MapId } from '@project/core';
import {
  Placement,
  positionedStrategy,
  type LayoutStrategyGraph,
  type Space,
} from '@project/graph';
import {
  nodeTypes,
  edgeTypes,
  ZoomSlider,
  type ResourceFlowNode,
} from '@project/react-flow-adapter';
import { spaceEntityActions } from '#src/entity-actions';
import { MAX_ZOOM, OVERVIEW_FIT } from '#src/camera';
import {
  canvasProjection,
  type CanvasInteraction,
  type CanvasNodesAndEdges,
} from '#src/canvas-projection';
import { RESOURCE_SIZE, resourceSizeVars } from '#src/resource';
import { resolveMap } from '#src/map-resolution';
import { resourceIds, graphIds, mapId, space } from './fixture';

/**
 * Which authored Map of which Space a fixture draws.
 *
 * A parameter rather than a module constant because the catalogue draws
 * more than one Space: the inventory's own fixture answers most stories, and
 * the Command Dock's prototype needs a Space with two Maps and three Graphs
 * over one of them. Both go through the same derivation, so a story cannot draw
 * a canvas the application would build differently.
 */
export interface DrawnMap {
  readonly space: Space;
  readonly mapId: MapId;
}

/** What a fixture draws unless it names another Map. */
const INVENTORY_MAP: DrawnMap = { space, mapId };

interface Derivation {
  readonly pending: ReturnType<typeof canvasProjection>;
  readonly laidOut: Promise<LayoutStrategyGraph>;
}

const derive = ({ space: drawn, mapId: id }: DrawnMap): Derivation => {
  const resolved = resolveMap(drawn, id);
  const pending = canvasProjection(drawn, resolved);
  return {
    pending,
    laidOut: positionedStrategy(Placement.fromMap(resolved.map))(pending.strategyGraph),
  };
};

const interaction = (
  activeGraphId: GraphId | null,
  selectedResourceId: ResourceId | null = null,
): CanvasInteraction => ({
  activeGraphId,
  activeResourceId: null,
  selectedResourceId,
  presenting: false,
});

type ProjectedCanvas = CanvasNodesAndEdges;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface FixtureCanvasResource {
  readonly id: string;
  readonly title: string;
  readonly x: number;
  readonly y: number;
}

/**
 * A story that cannot lay out says so. Left unhandled, a rejected strategy
 * leaves `projected` null for good — a permanently blank story that reads as
 * "still loading" and reports to Ladle E2E as a missing element, with the cause
 * visible only as an unhandled rejection in the console.
 */
export function useProjection(
  activeGraphId: GraphId | null,
  selectedResourceId: ResourceId | null = null,
  drawn: DrawnMap = INVENTORY_MAP,
): ProjectedCanvas | Error | null {
  const [projected, setProjected] = useState<ProjectedCanvas | Error | null>(null);
  // Keyed on the two inputs that decide the whole derivation, so a story that
  // re-renders on every Active Graph change does not lay the Space out again.
  // Destructured first because the identity of `drawn` itself is not what
  // decides a re-layout, and a dependency on the object would make an inline
  // `{ space, mapId }` at a call site lay the Space out on every render.
  const { space: drawnSpace, mapId: drawnMapId } = drawn;
  const { pending, laidOut } = useMemo(
    () => derive({ space: drawnSpace, mapId: drawnMapId }),
    [drawnSpace, drawnMapId],
  );

  useEffect(() => {
    const mounted = { current: true };
    void (async () => {
      try {
        const resolved = await laidOut;
        if (mounted.current)
          setProjected(pending.project(resolved, interaction(activeGraphId, selectedResourceId)));
      } catch (error) {
        if (mounted.current)
          setProjected(error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [pending, laidOut, activeGraphId, selectedResourceId]);

  return projected;
}

/** What a story draws in place of a canvas the strategy could not place. */
function PlacementFailure({ reason }: { readonly reason: Error }) {
  return <p role="alert">Placement failed: {reason.message}</p>;
}

/**
 * Where a canvas is fixed, not `defaultViewport`'s frame: `fit` is what an
 * author sees on opening, and an explicit `x`/`y`/`zoom` is a story pinning the
 * camera to a spot worth looking at. A discriminated union rather than optional
 * `defaultViewport`/`fitView` props, because passing both at once to
 * `<ReactFlow>` invites exactly the drift this exists to stop — one story fit,
 * the next hand-rolling a `defaultViewport` beside an unset `fitView` and
 * hoping the combination still means what it did elsewhere.
 */
export type StoryCanvasViewport =
  | { readonly fit: true }
  | { readonly fit: false; readonly x: number; readonly y: number; readonly zoom: number };

export interface StoryCanvasProps {
  readonly nodes: readonly Node[];
  readonly edges?: readonly Edge[];
  readonly nodeTypes?: NodeTypes;
  readonly edgeTypes?: EdgeTypes;
  readonly viewport: StoryCanvasViewport;
  readonly minZoom?: number;
  readonly maxZoom?: number;
  /** Production Resources only: connect-by-drag and the same ceiling `SpaceCanvas` uses. */
  readonly interactive?: boolean;
  /**
   * Whether a Resource on this canvas can be moved by a pointer.
   *
   * A story that asks for it hands its nodes over as `defaultNodes`, because
   * React Flow drops every change it is not answered for when `nodes` is
   * controlled — a controlled canvas here answers Selection alone, so the
   * position and the `dragging` flag go — and a story that cannot report a drag
   * cannot be dragged. So an
   * uncontrolled canvas is the price of a real gesture, and the cost is that
   * later prop updates no longer reach the flow: a story that drives a node from
   * its own state stays controlled and is not draggable.
   */
  readonly draggable?: boolean;
  /** The mount's own size and stage dressing; the surrounding frame is `StoryCanvasFrame`'s. */
  readonly className: string;
  readonly children?: ReactNode;
}

/**
 * The one real React Flow instance every canvas-hosting story mounts.
 *
 * Every fixture that puts nodes on a real canvas — the HUD, the selected Edge
 * controls, the Resource specimens, the zoom control, the Map preview — goes
 * through this rather than instantiating `<ReactFlow>` itself. `Background`,
 * `minZoom`/`maxZoom` defaults, `proOptions` and whether `ReactFlowProvider`
 * wraps the flow are this component's decisions so a new fixture cannot drift
 * from them by omission. `resourceSizeVars` is applied unconditionally: a fixture
 * that mounts the production `ResourceNode` needs it to size correctly and one
 * that doesn't is unaffected, so there is no reason to make a caller ask for it.
 */
export function StoryCanvas({
  nodes,
  edges = [],
  nodeTypes: nodeTypesProp,
  edgeTypes: edgeTypesProp,
  viewport,
  minZoom = 0.2,
  maxZoom = MAX_ZOOM,
  interactive = false,
  draggable = false,
  className,
  children,
}: StoryCanvasProps) {
  const typeProps: Mutable<Pick<ComponentProps<typeof ReactFlow>, 'nodeTypes' | 'edgeTypes'>> = {};
  if (nodeTypesProp !== undefined) typeProps.nodeTypes = nodeTypesProp;
  if (edgeTypesProp !== undefined) typeProps.edgeTypes = edgeTypesProp;
  /*
   * A controlled canvas still answers React Flow's Selection changes, because a
   * Resource's commands are drawn only while it is selected (ADR 0102). Only Selection is held here: a story that drives its
   * nodes from its own state keeps every other field, and a node the pointer has
   * not selected or deselected keeps the `selected` its story gave it.
   */
  const [selection, setSelection] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const onNodesChange = (changes: NodeChange[]) => {
    const selects = changes.filter((change) => change.type === 'select');
    if (selects.length === 0) return;
    setSelection((current) => {
      const next = new Map(current);
      for (const change of selects) next.set(change.id, change.selected);
      return next;
    });
  };
  const controlledNodes = nodes.map((node) => {
    const selected = selection.get(node.id);
    return selected === undefined ? node : { ...node, selected };
  });

  return (
    <div className={className} style={resourceSizeVars}>
      <ReactFlowProvider>
        <ReactFlow
          {...(draggable
            ? { defaultNodes: [...nodes] }
            : { nodes: controlledNodes, onNodesChange })}
          edges={[...edges]}
          {...typeProps}
          {...(viewport.fit
            ? { fitView: true, fitViewOptions: OVERVIEW_FIT }
            : { defaultViewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } })}
          minZoom={minZoom}
          maxZoom={maxZoom}
          nodesConnectable={interactive}
          nodesDraggable={draggable}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} />
          {children}
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

/**
 * The bordered, padded box a canvas-hosting story mounts `StoryCanvas` inside.
 *
 * The height varies per story with its content, so it is a caller-supplied
 * Tailwind height class.
 */
export function StoryCanvasFrame({
  height,
  children,
}: {
  readonly height: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={`${height} w-full bg-background p-[0.75rem] text-foreground`}>
      <div className="h-full overflow-hidden rounded-[8px] border border-border">{children}</div>
    </div>
  );
}

/**
 * The camera is carried whole rather than as a `zoom` this rebuilds around.
 *
 * Taking `zoom?: number` and writing `{ fit: false, x: 0, y: 0, zoom }` here
 * would leave a caller holding a full {@link StoryCanvasViewport} nowhere to
 * put its `x` and `y`: the offset would be dropped without a diagnostic, and
 * the story would draw pinned at an origin it did not ask for. The union is the
 * one shape from the caller to `StoryCanvas`, so there is no lossy field to
 * forget.
 */
function RealReactFlow({
  nodes,
  edges,
  className,
  controls = false,
  draggable = false,
  viewport = { fit: true },
}: {
  readonly nodes: readonly ResourceFlowNode[];
  readonly edges: readonly Edge[];
  readonly className: string;
  readonly controls?: boolean;
  readonly draggable?: boolean;
  readonly viewport?: StoryCanvasViewport;
}) {
  return (
    <StoryCanvas
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      viewport={viewport}
      maxZoom={MAX_ZOOM}
      interactive
      draggable={draggable}
      className={className}
    >
      {controls && <ZoomSlider />}
    </StoryCanvas>
  );
}

/** The production zoom control on the same real React Flow canvas the app uses. */
export function ZoomSliderSpecimen() {
  const projected = useProjection(graphIds.long);
  if (projected === null) return null;
  if (projected instanceof Error) return <PlacementFailure reason={projected} />;

  return (
    <RealReactFlow
      className="inv-resource-node-stage inv-resource-node-stage--large"
      nodes={projected.nodes}
      edges={projected.edges}
      controls
    />
  );
}

/**
 * The real React Flow canvas, adapter nodes, Edges, background and zoom control
 * for application-framed Ladle stories. Extra Resources reuse the production
 * ResourceNode projection; stories supply only identity, title and placement.
 *
 * `drawn` and `activeGraphId` default to the inventory's own Space and its Long
 * Graph, which is what most stories here draw. A story that names another Map — the Command Dock's, which switches
 * between two of them — gets the same derivation over its own Space rather than
 * a second canvas beside this one, and switching the Active Graph re-projects
 * without laying the Space out again.
 *
 * The camera is {@link StoryCanvasViewport} rather than an optional `zoom`,
 * because a default and "fit this Map to the frame" are both spelled
 * `undefined` in that shape — a full-viewport story asking to fit would silently
 * get the pinned camera instead.
 */
/** Where the application-framed canvas sits when a story does not say. */
const PINNED_MAP_VIEWPORT: StoryCanvasViewport = { fit: false, x: 0, y: 0, zoom: 0.65 };

export function MapCanvasFixture({
  resources = [],
  drawn,
  activeGraphId = graphIds.long,
  viewport = PINNED_MAP_VIEWPORT,
}: {
  readonly resources?: readonly FixtureCanvasResource[];
  /** Which Map of which Space; the inventory's own when absent. */
  readonly drawn?: DrawnMap;
  /** The Graph the canvas emphasises, or `null` for none. */
  readonly activeGraphId?: GraphId | null;
  /** The camera, through the same union `StoryCanvas` takes. */
  readonly viewport?: StoryCanvasViewport;
}) {
  const projected = useProjection(activeGraphId, null, drawn);
  if (projected === null) return null;
  if (projected instanceof Error) return <PlacementFailure reason={projected} />;
  const template = projected.nodes[0];
  const additions =
    template === undefined
      ? []
      : resources.map((resource): ResourceFlowNode => ({
          ...template,
          id: resource.id,
          position: { x: resource.x, y: resource.y },
          selected: true,
          data: { ...template.data, title: resource.title },
        }));

  return (
    <RealReactFlow
      className="size-full"
      nodes={[...projected.nodes, ...additions]}
      edges={projected.edges}
      controls
      viewport={viewport}
    />
  );
}

export interface CanvasResourceNodeSpecimenProps {
  readonly resourceId?: ResourceId;
  readonly selected?: boolean;
  readonly editingTitle?: boolean;
  readonly graphColor?: string;
  /**
   * Whether this specimen supplies the Open/Close operation, `onEditResource`.
   * Every Resource kind Opens and Closes through the same operation (ADR
   * 0070), so this defaults to true regardless of kind; a story asking for a
   * Resource with no Open capability at all sets it false.
   */
  readonly openOperationEnabled?: boolean;
  readonly nodeSize?: { readonly width: number; readonly height: number };
  readonly expanded?: boolean;
  readonly onOpenChange?: (open: boolean) => 'completed' | 'retained';
  readonly onResize?: (size: { readonly width: number; readonly height: number }) => void;
  readonly stageClassName?: string;
  readonly zoom?: number | undefined;
  readonly title?: string;
  readonly body?: string;
  readonly readOnly?: boolean;
  /** Whether the specimen can be moved by a pointer; see {@link StoryCanvasProps.draggable}. */
  readonly draggable?: boolean;
}

/**
 * A typed one-node React Flow harness. It supplies fixture state only; ResourceNode
 * remains responsible for presentation state, controls, handles and geometry.
 */
export function CanvasResourceNodeSpecimen({
  resourceId = resourceIds.strategies,
  selected = false,
  editingTitle = false,
  graphColor,
  openOperationEnabled = true,
  nodeSize,
  expanded,
  onOpenChange,
  onResize,
  stageClassName = '',
  zoom,
  title,
  body,
  readOnly = false,
  draggable = false,
}: CanvasResourceNodeSpecimenProps) {
  const projected = useProjection(graphIds.long);
  if (projected === null) return null;
  if (projected instanceof Error) return <PlacementFailure reason={projected} />;

  const source = projected.nodes.find(({ id }) => id === resourceId);
  if (source === undefined) throw new Error(`Missing fixture Resource ${resourceId}`);

  const resource = space.resources.find((candidate) => candidate.id === resourceId);
  const map = space.maps.find((candidate) => candidate.id === mapId);
  if (resource === undefined || map === undefined)
    throw new Error('Missing fixture Resource or Map');

  const data: ResourceFlowNode['data'] = {
    ...source.data,
    entityActions: spaceEntityActions({
      spaceId: space.id,
      spaceTitle: space.title,
      onCopy: () => true,
      onOpenIndependently: null,
      onRename: null,
    })({ kind: 'resource', resource, map }),
    readOnly,
    onBeginTitleEditing: () => undefined,
  };
  if (openOperationEnabled) data.onEditResource = onOpenChange ?? (() => 'completed');
  if (expanded !== undefined) data.expanded = expanded;
  if (title !== undefined) data.title = title;
  if (body !== undefined) data.body = body;
  // The editor is the state, so a specimen that asks to be renaming supplies
  // what ends the edit along with it.
  if (editingTitle) {
    data.titleEditor = { onComplete: () => null, onCancel: () => undefined };
  }
  if (graphColor !== undefined) data.activeGraphColor = graphColor;
  // Set exactly the way `SpaceCanvas` sets it: resize is Resource behaviour, not
  // kind behaviour, so its presence follows Open state alone.
  if (expanded === true) {
    if (onResize !== undefined) {
      data.resize = {
        minWidth: RESOURCE_SIZE.width,
        minHeight: RESOURCE_SIZE.height,
        onResizeStart: () => undefined,
        onResize,
        onResizeEnd: () => undefined,
        onResizeCancel: () => undefined,
      };
    }
  }

  const nodePosition = zoom === undefined ? source.position : { x: 40, y: 40 };
  const node: ResourceFlowNode = {
    ...source,
    position: nodePosition,
    ...nodeSize,
    selected,
    data,
  };

  return (
    <RealReactFlow
      className={`inv-resource-node-stage ${stageClassName}`}
      nodes={[node]}
      edges={[]}
      draggable={draggable}
      viewport={zoom === undefined ? { fit: true } : { fit: false, x: 0, y: 0, zoom }}
    />
  );
}
