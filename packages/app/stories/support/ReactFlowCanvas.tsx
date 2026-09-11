import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import type { ThingId, GraphId, DiagramId } from '@project/core';
import {
  Placement,
  positionedStrategy,
  type LayoutStrategyGraph,
  type Space,
} from '@project/graph';
import { nodeTypes, edgeTypes, ZoomSlider, type ThingFlowNode } from '@project/react-flow-adapter';
import { spaceEntityActions } from '#src/entity-actions';
import { MAX_ZOOM, OVERVIEW_FIT } from '#src/camera';
import {
  canvasProjection,
  type CanvasInteraction,
  type CanvasNodesAndEdges,
} from '#src/canvas-projection';
import { THING_SIZE, thingSizeVars } from '#src/thing';
import { resolveDiagram } from '#src/diagram-resolution';
import { thingIds, graphIds, diagramId, space } from './fixture';

/**
 * Which authored Diagram of which Space a fixture draws.
 *
 * A parameter rather than a module constant because the catalogue now draws
 * more than one Space: the inventory's own fixture answers most stories, and
 * the Command Dock's prototype needs a Space with two Diagrams and three Graphs
 * over one of them. Both go through the same derivation, so a story cannot draw
 * a canvas the application would build differently.
 */
export interface DrawnDiagram {
  readonly space: Space;
  readonly diagramId: DiagramId;
}

/** What a fixture draws unless it names another Diagram. */
const INVENTORY_DIAGRAM: DrawnDiagram = { space, diagramId };

interface Derivation {
  readonly pending: ReturnType<typeof canvasProjection>;
  readonly laidOut: Promise<LayoutStrategyGraph>;
}

const derive = ({ space: drawn, diagramId: id }: DrawnDiagram): Derivation => {
  const resolved = resolveDiagram(drawn, id);
  const pending = canvasProjection(drawn, resolved);
  return {
    pending,
    laidOut: positionedStrategy(Placement.fromDiagram(resolved.diagram))(pending.strategyGraph),
  };
};

const interaction = (
  activeGraphId: GraphId | null,
  selectedThingId: ThingId | null = null,
): CanvasInteraction => ({
  activeGraphId,
  activeThingId: null,
  selectedThingId,
  presenting: false,
  moved: false,
});

type ProjectedCanvas = CanvasNodesAndEdges;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface FixtureCanvasThing {
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
function useProjection(
  activeGraphId: GraphId | null,
  selectedThingId: ThingId | null = null,
  drawn: DrawnDiagram = INVENTORY_DIAGRAM,
): ProjectedCanvas | Error | null {
  const [projected, setProjected] = useState<ProjectedCanvas | Error | null>(null);
  // Keyed on the two things that decide the whole derivation, so a story that
  // re-renders on every Active Graph change does not lay the Space out again.
  // Destructured first because the identity of `drawn` itself is not what
  // decides a re-layout, and a dependency on the object would make an inline
  // `{ space, diagramId }` at a call site lay the Space out on every render.
  const { space: drawnSpace, diagramId: drawnDiagramId } = drawn;
  const { pending, laidOut } = useMemo(
    () => derive({ space: drawnSpace, diagramId: drawnDiagramId }),
    [drawnSpace, drawnDiagramId],
  );

  useEffect(() => {
    const mounted = { current: true };
    void (async () => {
      try {
        const resolved = await laidOut;
        if (mounted.current)
          setProjected(pending.project(resolved, interaction(activeGraphId, selectedThingId)));
      } catch (error) {
        if (mounted.current)
          setProjected(error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [pending, laidOut, activeGraphId, selectedThingId]);

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
  /** Production Things only: connect-by-drag and the same ceiling `SpaceCanvas` uses. */
  readonly interactive?: boolean;
  /** The mount's own size and stage dressing; the surrounding frame is `StoryCanvasFrame`'s. */
  readonly className: string;
  readonly children?: ReactNode;
}

/**
 * The one real React Flow instance every canvas-hosting story mounts.
 *
 * Every fixture that puts nodes on a real canvas — the HUD, the selected Edge
 * controls, the Thing specimens, the zoom control, the Diagram preview — goes
 * through this rather than instantiating `<ReactFlow>` itself. `Background`,
 * `minZoom`/`maxZoom` defaults, `proOptions` and whether `ReactFlowProvider`
 * wraps the flow are this component's decisions so a new fixture cannot drift
 * from them by omission. `thingSizeVars` is applied unconditionally: a fixture
 * that mounts the production `ThingNode` needs it to size correctly and one
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
  className,
  children,
}: StoryCanvasProps) {
  const typeProps: Mutable<Pick<ComponentProps<typeof ReactFlow>, 'nodeTypes' | 'edgeTypes'>> = {};
  if (nodeTypesProp !== undefined) typeProps.nodeTypes = nodeTypesProp;
  if (edgeTypesProp !== undefined) typeProps.edgeTypes = edgeTypesProp;

  return (
    <div className={className} style={thingSizeVars}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={[...nodes]}
          edges={[...edges]}
          {...typeProps}
          {...(viewport.fit
            ? { fitView: true, fitViewOptions: OVERVIEW_FIT }
            : { defaultViewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } })}
          minZoom={minZoom}
          maxZoom={maxZoom}
          nodesConnectable={interactive}
          nodesDraggable={false}
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
 * The height is the one thing that legitimately varies per story — the HUD's
 * minimap needs less room than the selected-Edge controls do to show a routed
 * Edge clearly — so it stays a caller-supplied Tailwind height class rather
 * than a second enum this module would have to keep in step with content it
 * cannot see.
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
 * meant a caller holding a full {@link StoryCanvasViewport} had nowhere to put
 * its `x` and `y`: it handed over the zoom, the offset was dropped without a
 * diagnostic, and the story drew pinned at the origin it did not ask for. The
 * union is the one shape from the caller to `StoryCanvas`, so there is no
 * lossy field left to forget.
 */
function RealReactFlow({
  nodes,
  edges,
  className,
  controls = false,
  viewport = { fit: true },
}: {
  readonly nodes: readonly ThingFlowNode[];
  readonly edges: readonly Edge[];
  readonly className: string;
  readonly controls?: boolean;
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
      className="inv-thing-node-stage inv-thing-node-stage--large"
      nodes={projected.nodes}
      edges={projected.edges}
      controls
    />
  );
}

/**
 * The real React Flow canvas, adapter nodes, Edges, background and zoom control
 * for application-framed Ladle stories. Extra Things reuse the production
 * ThingNode projection; stories supply only identity, title and placement.
 *
 * `drawn` and `activeGraphId` default to the inventory's own Space and its Long
 * Graph, which is what every story here drew when there was only one Space to
 * draw. A story that names another Diagram — the Command Dock's, which switches
 * between two of them — gets the same derivation over its own Space rather than
 * a second canvas beside this one, and switching the Active Graph re-projects
 * without laying the Space out again.
 *
 * The camera is {@link StoryCanvasViewport} rather than an optional `zoom`,
 * because a default and "fit this Diagram to the frame" are both spelled
 * `undefined` in that shape — a full-viewport story asking to fit would silently
 * get the pinned camera instead.
 */
/** Where the application-framed canvas sits when a story does not say. */
const PINNED_DIAGRAM_VIEWPORT: StoryCanvasViewport = { fit: false, x: 0, y: 0, zoom: 0.65 };

export function DiagramCanvasFixture({
  things = [],
  drawn,
  activeGraphId = graphIds.long,
  viewport = PINNED_DIAGRAM_VIEWPORT,
}: {
  readonly things?: readonly FixtureCanvasThing[];
  /** Which Diagram of which Space; the inventory's own when absent. */
  readonly drawn?: DrawnDiagram;
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
      : things.map((thing): ThingFlowNode => ({
          ...template,
          id: thing.id,
          position: { x: thing.x, y: thing.y },
          selected: true,
          data: { ...template.data, title: thing.title },
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

export interface CanvasThingNodeSpecimenProps {
  readonly thingId?: ThingId;
  readonly selected?: boolean;
  readonly editingTitle?: boolean;
  readonly graphColor?: string;
  readonly thingEditingEnabled?: boolean;
  readonly nodeSize?: { readonly width: number; readonly height: number };
  readonly expanded?: boolean;
  readonly onOpenChange?: (open: boolean) => 'completed' | 'retained';
  readonly onResize?: (size: { readonly width: number; readonly height: number }) => void;
  readonly stageClassName?: string;
  readonly zoom?: number | undefined;
  readonly title?: string;
  readonly body?: string;
  readonly readOnly?: boolean;
}

/**
 * A typed one-node React Flow harness. It supplies fixture state only; ThingNode
 * remains responsible for presentation state, controls, handles and geometry.
 */
export function CanvasThingNodeSpecimen({
  thingId = thingIds.strategies,
  selected = false,
  editingTitle = false,
  graphColor,
  thingEditingEnabled,
  nodeSize,
  expanded,
  onOpenChange,
  onResize,
  stageClassName = '',
  zoom,
  title,
  body,
  readOnly = false,
}: CanvasThingNodeSpecimenProps) {
  const projected = useProjection(graphIds.long);
  if (projected === null) return null;
  if (projected instanceof Error) return <PlacementFailure reason={projected} />;

  const source = projected.nodes.find(({ id }) => id === thingId);
  if (source === undefined) throw new Error(`Missing fixture Thing ${thingId}`);

  const thing = space.things.find((candidate) => candidate.id === thingId);
  const diagram = space.diagrams.find((candidate) => candidate.id === diagramId);
  if (thing === undefined || diagram === undefined)
    throw new Error('Missing fixture Thing or Diagram');

  const data: ThingFlowNode['data'] = {
    ...source.data,
    entityActions: spaceEntityActions({
      spaceId: space.id,
      spaceTitle: space.title,
      onCopy: () => true,
      onRename: null,
      onDeleteDiagram: null,
    })({ kind: 'thing', thing, diagram }),
    readOnly,
    titleEditingEnabled: true,
    thingEditingEnabled: thingEditingEnabled ?? source.data.kind === 'markdown',
    onEditThing: onOpenChange ?? (() => 'completed'),
    onBeginTitleEditing: () => undefined,
  };
  if (expanded !== undefined) data.expanded = expanded;
  if (title !== undefined) data.title = title;
  if (body !== undefined) data.body = body;
  // The editor is the state, so a specimen that asks to be renaming supplies
  // what ends the edit along with it.
  if (editingTitle) {
    data.titleEditor = { onComplete: () => null, onCancel: () => undefined };
  }
  if (graphColor !== undefined) data.activeGraphColor = graphColor;
  // Set exactly the way `SpaceCanvas` sets it: resize is Thing behaviour, not
  // kind behaviour, so its presence follows Open state alone.
  if (expanded === true) {
    if (onResize !== undefined) {
      data.resize = {
        minWidth: THING_SIZE.width,
        minHeight: THING_SIZE.height,
        onResizeStart: () => undefined,
        onResize,
        onResizeEnd: () => undefined,
        onResizeCancel: () => undefined,
      };
    }
  }

  const nodePosition = zoom === undefined ? source.position : { x: 40, y: 40 };
  const node: ThingFlowNode = {
    ...source,
    position: nodePosition,
    ...nodeSize,
    selected,
    data,
  };

  return (
    <RealReactFlow
      className={`inv-thing-node-stage ${stageClassName}`}
      nodes={[node]}
      edges={[]}
      viewport={zoom === undefined ? { fit: true } : { fit: false, x: 0, y: 0, zoom }}
    />
  );
}
