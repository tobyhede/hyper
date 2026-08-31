import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import type { CardId, GraphId } from '@project/core';
import { nodeTypes, edgeTypes, ZoomSlider, type CardFlowNode } from '@project/react-flow-adapter';
import { MAX_ZOOM, OVERVIEW_FIT } from '#src/camera';
import { canvasProjection, type CanvasInteraction } from '#src/canvas-projection';
import { CARD_SIZE, cardSizeVars } from '#src/card';
import { createRendererResolver } from '#src/renderer';
import { cardIds, graphIds, layoutId, space } from './fixture';

const resolveRenderer = createRendererResolver({
  // A selected Layout never converts, so the resolver cannot call this. It is
  // still a real UUID because the resolver's interface deliberately accepts no
  // story-specific partial adapter.
  newGraphId: () => graphIds.short,
});
const renderer = resolveRenderer(space, layoutId);
const pending = canvasProjection(space, renderer);
const laidOut = renderer.strategy(pending.strategyGraph);

const interaction = (
  activeGraphId: GraphId | null,
  selectedCardId: CardId | null = null,
): CanvasInteraction => ({
  activeGraphId,
  activeCardId: null,
  selectedCardId,
  presenting: false,
  moved: false,
});

type ProjectedCanvas = ReturnType<typeof pending.project>;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface FixtureCanvasCard {
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
  selectedCardId: CardId | null = null,
): ProjectedCanvas | Error | null {
  const [projected, setProjected] = useState<ProjectedCanvas | Error | null>(null);

  useEffect(() => {
    const mounted = { current: true };
    void (async () => {
      try {
        const resolved = await laidOut;
        if (mounted.current)
          setProjected(pending.project(resolved, interaction(activeGraphId, selectedCardId)));
      } catch (error) {
        if (mounted.current)
          setProjected(error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [activeGraphId, selectedCardId]);

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
  /** Production Cards only: connect-by-drag and the same ceiling `SpaceCanvas` uses. */
  readonly interactive?: boolean;
  /** The mount's own size and stage dressing; the surrounding frame is `StoryCanvasFrame`'s. */
  readonly className: string;
  readonly children?: ReactNode;
}

/**
 * The one real React Flow instance every canvas-hosting story mounts.
 *
 * Every fixture that puts nodes on a real canvas — the HUD, the selected Edge
 * controls, the Card specimens, the zoom control, the Layout preview — goes
 * through this rather than instantiating `<ReactFlow>` itself. `Background`,
 * `minZoom`/`maxZoom` defaults, `proOptions` and whether `ReactFlowProvider`
 * wraps the flow are this component's decisions so a new fixture cannot drift
 * from them by omission. `cardSizeVars` is applied unconditionally: a fixture
 * that mounts the production `CardNode` needs it to size correctly and one
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
    <div className={className} style={cardSizeVars}>
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

function RealReactFlow({
  nodes,
  edges,
  className,
  controls = false,
  zoom,
}: {
  readonly nodes: readonly CardFlowNode[];
  readonly edges: readonly Edge[];
  readonly className: string;
  readonly controls?: boolean;
  readonly zoom?: number | undefined;
}) {
  return (
    <StoryCanvas
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      viewport={zoom === undefined ? { fit: true } : { fit: false, x: 0, y: 0, zoom }}
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
      className="inv-card-node-stage inv-card-node-stage--large"
      nodes={projected.nodes}
      edges={projected.edges}
      controls
    />
  );
}

/**
 * The real React Flow canvas, adapter nodes, Edges, background and zoom control
 * for application-framed Ladle stories. Extra Cards reuse the production
 * CardNode projection; stories supply only identity, title and placement.
 */
export function LayoutCanvasFixture({
  cards = [],
}: {
  readonly cards?: readonly FixtureCanvasCard[];
}) {
  const projected = useProjection(graphIds.long);
  if (projected === null) return null;
  if (projected instanceof Error) return <PlacementFailure reason={projected} />;
  const template = projected.nodes[0];
  const additions =
    template === undefined
      ? []
      : cards.map((card): CardFlowNode => ({
          ...template,
          id: card.id,
          position: { x: card.x, y: card.y },
          selected: true,
          data: { ...template.data, title: card.title },
        }));

  return (
    <RealReactFlow
      className="size-full"
      nodes={[...projected.nodes, ...additions]}
      edges={projected.edges}
      controls
      zoom={0.65}
    />
  );
}

export interface CanvasCardNodeSpecimenProps {
  readonly cardId?: CardId;
  readonly selected?: boolean;
  readonly editingTitle?: boolean;
  readonly graphColor?: string;
  readonly cardEditingEnabled?: boolean;
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
 * A typed one-node React Flow harness. It supplies fixture state only; CardNode
 * remains responsible for presentation state, controls, handles and geometry.
 */
export function CanvasCardNodeSpecimen({
  cardId = cardIds.strategies,
  selected = false,
  editingTitle = false,
  graphColor,
  cardEditingEnabled,
  nodeSize,
  expanded,
  onOpenChange,
  onResize,
  stageClassName = '',
  zoom,
  title,
  body,
  readOnly = false,
}: CanvasCardNodeSpecimenProps) {
  const projected = useProjection(graphIds.long);
  if (projected === null) return null;
  if (projected instanceof Error) return <PlacementFailure reason={projected} />;

  const source = projected.nodes.find(({ id }) => id === cardId);
  if (source === undefined) throw new Error(`Missing fixture Card ${cardId}`);

  const data: CardFlowNode['data'] = {
    ...source.data,
    readOnly,
    titleEditingEnabled: true,
    cardEditingEnabled: cardEditingEnabled ?? source.data.kind === 'markdown',
    onEditCard: onOpenChange ?? (() => 'completed'),
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
  // Set exactly the way `SpaceCanvas` sets it: resize is Card behaviour, not
  // kind behaviour, so its presence follows Open state alone.
  if (expanded === true) {
    if (onResize !== undefined) {
      data.resize = {
        minWidth: CARD_SIZE.width,
        minHeight: CARD_SIZE.height,
        onResizeStart: () => undefined,
        onResize,
        onResizeEnd: () => undefined,
        onResizeCancel: () => undefined,
      };
    }
  }

  const nodePosition = zoom === undefined ? source.position : { x: 40, y: 40 };
  const node: CardFlowNode = {
    ...source,
    position: nodePosition,
    ...nodeSize,
    selected,
    data,
  };

  return (
    <RealReactFlow
      className={`inv-card-node-stage ${stageClassName}`}
      nodes={[node]}
      edges={[]}
      zoom={zoom}
    />
  );
}
