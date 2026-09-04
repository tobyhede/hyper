/**
 * THROWAWAY UX PROTOTYPE — not a production component and not an ADR proof.
 *
 * This story compares the two React Flow containment models that materially
 * change Space Card authoring. Keep the variants independent enough that the
 * comparison stays honest; delete this surface once the UX decision is made.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { Story } from '@ladle/react';
import {
  addEdge,
  Background,
  Controls,
  Handle,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnReconnect,
} from '@xyflow/react';
import {
  Button,
  Card,
  CardAction,
  CardHeader,
  CardSection,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@project/ui';
import './space-card-canvas-prototype.css';

export default { title: 'Review/Space Card Canvas Architecture' };

type PrototypeVariant = 'nested' | 'compound';
type CanvasScope = 'parent' | 'child';
type LayoutChoice = 'Architecture layout' | 'Flow view';
type GraphChoice = 'Main thread' | 'Decision fork';
type PresentationCard =
  | 'parent-intro'
  | 'child-entry'
  | 'nested-intro'
  | 'nested-exit'
  | 'child-exit'
  | 'child-stop'
  | 'parent-outro';

interface MarkdownNodeData extends Record<string, unknown> {
  readonly scope: CanvasScope;
  readonly title: string;
  readonly body: string;
  readonly accent: string;
}

interface SpaceNodeData extends Record<string, unknown> {
  readonly kind: 'nested' | 'compound';
}

type MarkdownNode = Node<MarkdownNodeData, 'markdown'>;
type SpaceNode = Node<SpaceNodeData, 'space'>;
type PrototypeNode = MarkdownNode | SpaceNode;

interface SpaceCardState {
  readonly open: boolean;
  readonly activeView: LayoutChoice;
  readonly activeGraph: GraphChoice;
  readonly entered: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly setActiveView: (view: LayoutChoice) => void;
  readonly setActiveGraph: (graph: GraphChoice) => void;
  readonly setEntered: (entered: boolean) => void;
  readonly renameCard: (scope: CanvasScope, id: string, title: string) => void;
  readonly childCanvas: ChildCanvasState;
  readonly standaloneHref: string;
}

interface ChildCanvasState {
  readonly nodes: readonly PrototypeNode[];
  readonly edges: readonly Edge[];
  readonly onNodesChange: ReturnType<typeof useNodesState<PrototypeNode>>[2];
  readonly onEdgesChange: ReturnType<typeof useEdgesState<Edge>>[2];
  readonly onConnect: (connection: Connection) => void;
  readonly onReconnect: OnReconnect<Edge>;
  readonly onGeometryChange: () => void;
}

interface BridgeEndpoint {
  readonly scope: CanvasScope;
  readonly nodeId: string;
  readonly role: 'source' | 'target';
}

interface BridgeEdge {
  readonly id: string;
  readonly source: BridgeEndpoint;
  readonly target: BridgeEndpoint;
}

interface BridgeDraft {
  readonly source: BridgeEndpoint;
  readonly clientX: number;
  readonly clientY: number;
}

interface BridgeControls {
  readonly begin: (endpoint: BridgeEndpoint, event: ReactPointerEvent) => void;
}

interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

interface DrawnBridge {
  readonly id: string;
  readonly source: CanvasPoint;
  readonly target: CanvasPoint;
  readonly draft: boolean;
}

interface NodeAccentStyle extends CSSProperties {
  readonly '--prototype-node-accent': string;
}

const PARENT_GRAPH = '#d05d3d';
const CHILD_GRAPH = '#16837a';

const INITIAL_PARENT_NODES: PrototypeNode[] = [
  {
    id: 'parent-intro',
    type: 'markdown',
    position: { x: 80, y: 320 },
    data: {
      scope: 'parent',
      title: 'Frame the problem',
      body: 'The containing Graph reaches into another independent Space.',
      accent: PARENT_GRAPH,
    },
  },
  {
    id: 'space-card',
    type: 'space',
    position: { x: 430, y: 145 },
    width: 720,
    height: 520,
    data: { kind: 'nested' },
  },
  {
    id: 'parent-outro',
    type: 'markdown',
    position: { x: 1325, y: 335 },
    data: {
      scope: 'parent',
      title: 'Return to the frame',
      body: 'An explicit exit Edge returns presentation to the containing Graph.',
      accent: PARENT_GRAPH,
    },
  },
];

const INITIAL_PARENT_EDGES: Edge[] = [];

const INITIAL_CHILD_NODES: PrototypeNode[] = [
  {
    id: 'child-entry',
    type: 'markdown',
    position: { x: 70, y: 70 },
    data: {
      scope: 'child',
      title: 'Child entry',
      body: 'A Card in the selected Graph; the Space Card itself is only the bridge.',
      accent: CHILD_GRAPH,
    },
  },
  {
    id: 'child-exit',
    type: 'markdown',
    position: { x: 390, y: 230 },
    data: {
      scope: 'child',
      title: 'Child exit',
      body: 'This Card can return through an explicit Edge owned by the containing Graph.',
      accent: CHILD_GRAPH,
    },
  },
  {
    id: 'child-stop',
    type: 'markdown',
    position: { x: 395, y: 30 },
    data: {
      scope: 'child',
      title: 'Valid terminus',
      body: 'A branch may end inside the child Space. No implicit bounce occurs.',
      accent: '#7d5bb3',
    },
  },
];

const INITIAL_CHILD_EDGES: Edge[] = [
  {
    id: 'child-entry-to-exit',
    source: 'child-entry',
    target: 'child-exit',
    style: { stroke: CHILD_GRAPH },
  },
  {
    id: 'child-entry-to-stop',
    source: 'child-entry',
    target: 'child-stop',
    style: { stroke: '#7d5bb3' },
  },
];

const INITIAL_BRIDGES: BridgeEdge[] = [
  {
    id: 'entry-bridge',
    source: { scope: 'parent', nodeId: 'parent-intro', role: 'source' },
    target: { scope: 'child', nodeId: 'child-entry', role: 'target' },
  },
  {
    id: 'exit-bridge',
    source: { scope: 'child', nodeId: 'child-exit', role: 'source' },
    target: { scope: 'parent', nodeId: 'parent-outro', role: 'target' },
  },
];

const COMPOUND_NODES: PrototypeNode[] = [
  {
    id: 'parent-intro',
    type: 'markdown',
    position: { x: 80, y: 340 },
    data: {
      scope: 'parent',
      title: 'Frame the problem',
      body: 'The containing Graph reaches into another independent Space.',
      accent: PARENT_GRAPH,
    },
  },
  {
    id: 'space-card',
    type: 'space',
    position: { x: 430, y: 145 },
    width: 720,
    height: 520,
    data: { kind: 'compound' },
  },
  {
    id: 'child-entry',
    type: 'markdown',
    parentId: 'space-card',
    extent: 'parent',
    position: { x: 70, y: 120 },
    data: {
      scope: 'child',
      title: 'Child entry',
      body: 'A Card in the selected Graph; the Space Card itself is only the bridge.',
      accent: CHILD_GRAPH,
    },
  },
  {
    id: 'child-exit',
    type: 'markdown',
    parentId: 'space-card',
    extent: 'parent',
    position: { x: 390, y: 280 },
    data: {
      scope: 'child',
      title: 'Child exit',
      body: 'This Card can return through an explicit Edge owned by the containing Graph.',
      accent: CHILD_GRAPH,
    },
  },
  {
    id: 'child-stop',
    type: 'markdown',
    parentId: 'space-card',
    extent: 'parent',
    position: { x: 395, y: 80 },
    data: {
      scope: 'child',
      title: 'Valid terminus',
      body: 'A branch may end inside the child Space. No implicit bounce occurs.',
      accent: '#7d5bb3',
    },
  },
  {
    id: 'parent-outro',
    type: 'markdown',
    position: { x: 1325, y: 355 },
    data: {
      scope: 'parent',
      title: 'Return to the frame',
      body: 'An explicit exit Edge returns presentation to the containing Graph.',
      accent: PARENT_GRAPH,
    },
  },
];

const COMPOUND_EDGES: Edge[] = [
  {
    id: 'entry-bridge',
    source: 'parent-intro',
    target: 'child-entry',
    style: { stroke: PARENT_GRAPH },
  },
  ...INITIAL_CHILD_EDGES,
  {
    id: 'exit-bridge',
    source: 'child-exit',
    target: 'parent-outro',
    style: { stroke: PARENT_GRAPH },
  },
];

const PRESENTATION_COPY = {
  'parent-intro': {
    title: 'Frame the problem',
    body: 'The Active Graph begins in the containing Space.',
    context: 'Containing Space / Main thread',
  },
  'child-entry': {
    title: 'Child entry',
    body: 'The entry Edge carries the containing Graph context into Research Space.',
    context: 'Containing Space / Research Space / Decision fork',
  },
  'nested-intro': {
    title: 'Nested API Space',
    body: 'A second crossing pushes another traversal frame; Back unwinds the same stack.',
    context: 'Containing Space / Research Space / API Space / Main thread',
  },
  'nested-exit': {
    title: 'Return from API Space',
    body: 'The explicit nested exit restores the Research Space traversal frame.',
    context: 'Containing Space / Research Space / Decision fork',
  },
  'child-exit': {
    title: 'Child exit',
    body: 'The containing Graph owns this explicit exit and resumes at its authored target.',
    context: 'Containing Space / Research Space / Decision fork',
  },
  'child-stop': {
    title: 'Valid terminus',
    body: 'This fork terminates inside Research Space. Nothing bounces automatically.',
    context: 'Containing Space / Research Space / Decision fork',
  },
  'parent-outro': {
    title: 'Return to the frame',
    body: 'Presentation continues in the containing Graph after the explicit exit.',
    context: 'Containing Space / Main thread',
  },
} satisfies Record<
  PresentationCard,
  { readonly title: string; readonly body: string; readonly context: string }
>;

const SpaceCardContext = createContext<SpaceCardState | null>(null);
const BridgeContext = createContext<BridgeControls | null>(null);

function useRequiredContext<T>(context: ReturnType<typeof createContext<T | null>>, name: string) {
  const value = useContext(context);
  if (value === null) throw new Error(`${name} must be used inside its prototype provider`);
  return value;
}

function useSpaceCard() {
  return useRequiredContext(SpaceCardContext, 'SpaceCardContext');
}

function useBridge() {
  return useRequiredContext(BridgeContext, 'BridgeContext');
}

function bridgeKey(endpoint: BridgeEndpoint) {
  return `${endpoint.scope}:${endpoint.nodeId}:${endpoint.role}`;
}

function PrototypeHandle({
  endpoint,
  position,
}: {
  readonly endpoint: BridgeEndpoint;
  readonly position: Position;
}) {
  const bridge = useBridge();
  return (
    <Handle
      type={endpoint.role}
      position={position}
      className="space-card-prototype__handle"
      data-bridge-endpoint="true"
      data-bridge-key={bridgeKey(endpoint)}
      data-bridge-scope={endpoint.scope}
      data-bridge-node={endpoint.nodeId}
      data-bridge-role={endpoint.role}
      aria-label={`${endpoint.role === 'source' ? 'Connect from' : 'Connect to'} ${endpoint.nodeId}`}
      onPointerDownCapture={(event) => {
        if (endpoint.role === 'source' && event.shiftKey) bridge.begin(endpoint, event);
      }}
    />
  );
}

function MarkdownCardNode({ id, data }: NodeProps<MarkdownNode>) {
  const { renameCard } = useSpaceCard();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.title);
  const accentStyle: NodeAccentStyle = { '--prototype-node-accent': data.accent };

  return (
    <>
      <PrototypeHandle
        endpoint={{ scope: data.scope, nodeId: id, role: 'target' }}
        position={Position.Left}
      />
      <Card
        size="sm"
        className="space-card-prototype__markdown"
        style={accentStyle}
        data-active="false"
      >
        <CardHeader>
          {editing ? (
            <div className="space-card-prototype__editor nodrag nopan nowheel">
              <Input
                aria-label={`Rename ${data.title}`}
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setDraft(data.title);
                    setEditing(false);
                  }
                  if (event.key === 'Enter' && draft.trim() !== '') {
                    renameCard(data.scope, id, draft.trim());
                    setEditing(false);
                  }
                }}
              />
              <div className="space-card-prototype__editor-actions">
                <Button
                  size="compact"
                  variant="ghost"
                  onClick={() => {
                    setDraft(data.title);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="compact"
                  disabled={draft.trim() === ''}
                  onClick={() => {
                    renameCard(data.scope, id, draft.trim());
                    setEditing(false);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-card-prototype__markdown-title">
              <CardTitle>{data.title}</CardTitle>
              <CardAction>
                <Button
                  className="nodrag nopan"
                  size="compact"
                  variant="ghost"
                  onClick={() => {
                    setDraft(data.title);
                    setEditing(true);
                  }}
                >
                  Edit
                </Button>
              </CardAction>
            </div>
          )}
        </CardHeader>
        {!editing && (
          <CardSection>
            <p className="space-card-prototype__markdown-copy">{data.body}</p>
          </CardSection>
        )}
      </Card>
      <PrototypeHandle
        endpoint={{ scope: data.scope, nodeId: id, role: 'source' }}
        position={Position.Right}
      />
    </>
  );
}

function SpaceCardHeader({ independent = false }: { readonly independent?: boolean }) {
  const state = useSpaceCard();
  return (
    <div className="space-card-prototype__space-header nodrag nopan nowheel">
      <div className="space-card-prototype__space-title">
        <strong>Research Space</strong>
        <span>{independent ? 'Independent root' : 'Space Card · linked Space'}</span>
      </div>
      <Select
        value={state.activeView}
        onValueChange={(value) => {
          if (value === 'Architecture layout' || value === 'Flow view') state.setActiveView(value);
        }}
      >
        <SelectTrigger className="space-card-prototype__selector" aria-label="Layout">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectItem value="Architecture layout">Architecture layout</SelectItem>
          <SelectItem value="Flow view">Flow view</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={state.activeGraph}
        onValueChange={(value) => {
          if (value === 'Main thread' || value === 'Decision fork') state.setActiveGraph(value);
        }}
      >
        <SelectTrigger className="space-card-prototype__selector" aria-label="Graph">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectItem value="Main thread">Main thread</SelectItem>
          <SelectItem value="Decision fork">Decision fork</SelectItem>
        </SelectContent>
      </Select>
      {!independent && (
        <Button size="compact" onClick={() => state.setEntered(true)}>
          Enter
        </Button>
      )}
      {!independent && (
        <a
          className="inline-flex items-center justify-center rounded-[6px] border border-border bg-secondary px-[11px] py-[6px] text-[13px] text-secondary-foreground no-underline hover:border-accent"
          href={state.standaloneHref}
          target="_blank"
          rel="noreferrer"
        >
          New tab
        </a>
      )}
      {!independent && (
        <Button size="compact" variant="ghost" onClick={() => state.setOpen(!state.open)}>
          {state.open ? 'Close' : 'Open'}
        </Button>
      )}
    </div>
  );
}

function ChildCanvas({ compact = false }: { readonly compact?: boolean }) {
  const { childCanvas } = useSpaceCard();
  return (
    <ReactFlowProvider>
      <ReactFlow
        className="space-card-prototype__child-flow"
        nodes={[...childCanvas.nodes]}
        edges={[...childCanvas.edges]}
        nodeTypes={NODE_TYPES}
        onNodesChange={childCanvas.onNodesChange}
        onEdgesChange={childCanvas.onEdgesChange}
        onConnect={childCanvas.onConnect}
        onReconnect={childCanvas.onReconnect}
        onMove={childCanvas.onGeometryChange}
        onNodeDrag={childCanvas.onGeometryChange}
        fitView
        fitViewOptions={{ padding: compact ? 0.18 : 0.3 }}
        minZoom={0.25}
        maxZoom={2.2}
        nodesConnectable
        edgesReconnectable
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="rgba(28, 39, 51, 0.14)" />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
    </ReactFlowProvider>
  );
}

function NestedSpaceCardNode(): ReactNode {
  const state = useSpaceCard();
  if (!state.open) {
    return (
      <div className="space-card-prototype__space-node">
        <div className="space-card-prototype__space-card" data-open="false">
          <SpaceCardHeader />
          <span className="space-card-prototype__marker space-card-prototype__marker--entry">
            →
          </span>
          <span className="space-card-prototype__marker space-card-prototype__marker--exit">→</span>
        </div>
      </div>
    );
  }
  return (
    <div className="space-card-prototype__space-node">
      <NodeResizer minWidth={560} minHeight={390} color={PARENT_GRAPH} />
      <div className="space-card-prototype__space-card" data-open="true">
        <SpaceCardHeader />
        <div className="space-card-prototype__space-body nowheel nodrag">
          <ChildCanvas compact />
        </div>
      </div>
    </div>
  );
}

function CompoundSpaceCardNode(): ReactNode {
  const state = useSpaceCard();
  return (
    <div className="space-card-prototype__space-node">
      {state.open && <NodeResizer minWidth={560} minHeight={390} color={PARENT_GRAPH} />}
      <div className="space-card-prototype__space-card" data-open={String(state.open)}>
        <SpaceCardHeader />
        {state.open ? (
          <div className="space-card-prototype__compound-ground" />
        ) : (
          <>
            <span className="space-card-prototype__marker space-card-prototype__marker--entry">
              →
            </span>
            <span className="space-card-prototype__marker space-card-prototype__marker--exit">
              →
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function SpaceCardNode({ data }: NodeProps<SpaceNode>) {
  return data.kind === 'nested' ? <NestedSpaceCardNode /> : <CompoundSpaceCardNode />;
}

const NODE_TYPES = { markdown: MarkdownCardNode, space: SpaceCardNode };

function endpointFromElement(element: Element | null): BridgeEndpoint | null {
  if (!(element instanceof HTMLElement)) return null;
  const handle = element.closest<HTMLElement>('[data-bridge-endpoint="true"]');
  const scope = handle?.dataset['bridgeScope'];
  const nodeId = handle?.dataset['bridgeNode'];
  const role = handle?.dataset['bridgeRole'];
  if (
    (scope !== 'parent' && scope !== 'child') ||
    nodeId === undefined ||
    (role !== 'source' && role !== 'target')
  ) {
    return null;
  }
  return { scope, nodeId, role };
}

function pointFor(stage: HTMLElement, endpoint: BridgeEndpoint): CanvasPoint | null {
  const element = stage.querySelector<HTMLElement>(`[data-bridge-key="${bridgeKey(endpoint)}"]`);
  if (element === null) return null;
  const stageRect = stage.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - stageRect.left + rect.width / 2,
    y: rect.top - stageRect.top + rect.height / 2,
  };
}

function bridgePath(source: CanvasPoint, target: CanvasPoint) {
  const bend = Math.max(64, Math.abs(target.x - source.x) * 0.42);
  return `M ${source.x} ${source.y} C ${source.x + bend} ${source.y}, ${target.x - bend} ${target.y}, ${target.x} ${target.y}`;
}

function NestedBridgeLayer({
  stage,
  edges,
  draft,
  geometryRevision,
}: {
  readonly stage: HTMLElement | null;
  readonly edges: readonly BridgeEdge[];
  readonly draft: BridgeDraft | null;
  readonly geometryRevision: number;
}) {
  const drawn: readonly DrawnBridge[] = (() => {
    // The revision is the signal from either React Flow camera that its DOM
    // transforms changed; reading it makes those callbacks redraw the overlay.
    void geometryRevision;
    if (stage === null) return [];
    const stageRect = stage.getBoundingClientRect();
    const complete = edges.flatMap((edge): DrawnBridge[] => {
      const source = pointFor(stage, edge.source);
      const target = pointFor(stage, edge.target);
      return source === null || target === null
        ? []
        : [{ id: edge.id, source, target, draft: false }];
    });
    const active =
      draft === null
        ? []
        : pointFor(stage, draft.source) === null
          ? []
          : [
              {
                id: 'draft',
                source: pointFor(stage, draft.source) ?? { x: 0, y: 0 },
                target: {
                  x: draft.clientX - stageRect.left,
                  y: draft.clientY - stageRect.top,
                },
                draft: true,
              },
            ];
    return [...complete, ...active];
  })();

  return (
    <svg className="space-card-prototype__bridge-layer" aria-hidden="true">
      {drawn.map((edge) => (
        <path
          key={edge.id}
          // Two whole class strings rather than a concatenation: this is a
          // `className`, so `prettier-plugin-tailwindcss` normalises whatever
          // is inside it and trims the leading space a ` --draft` suffix needs.
          // Written as a concatenation the modifier silently welds onto the
          // base name on the next `pnpm format`, and a draft bridge then
          // matches neither rule and paints an SVG-default black blob.
          className={
            edge.draft
              ? 'space-card-prototype__bridge-path space-card-prototype__bridge-path--draft'
              : 'space-card-prototype__bridge-path'
          }
          d={bridgePath(edge.source, edge.target)}
        />
      ))}
    </svg>
  );
}

function Presentation({
  history,
  setHistory,
}: {
  readonly history: readonly PresentationCard[];
  readonly setHistory: (history: readonly PresentationCard[]) => void;
}) {
  const current = history.at(-1);
  if (current === undefined) return null;
  const copy = PRESENTATION_COPY[current];
  const advance = (next: PresentationCard) => setHistory([...history, next]);
  const terminal = current === 'child-stop' || current === 'parent-outro';

  return (
    <section className="space-card-prototype__presentation" aria-label="Presentation traversal">
      <div className="space-card-prototype__presentation-path">{copy.context}</div>
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      <div className="space-card-prototype__presentation-actions">
        <Button
          variant="ghost"
          disabled={history.length === 1}
          onClick={() => setHistory(history.slice(0, -1))}
        >
          Back
        </Button>
        {current === 'parent-intro' && (
          <Button onClick={() => advance('child-entry')}>Enter Research Space</Button>
        )}
        {current === 'child-entry' && (
          <>
            <Button onClick={() => advance('nested-intro')}>Traverse nested Space</Button>
            <Button variant="secondary" onClick={() => advance('child-stop')}>
              End this branch here
            </Button>
          </>
        )}
        {current === 'nested-intro' && (
          <Button onClick={() => advance('nested-exit')}>Exit API Space</Button>
        )}
        {current === 'nested-exit' && (
          <Button onClick={() => advance('child-exit')}>Continue child Graph</Button>
        )}
        {current === 'child-exit' && (
          <Button onClick={() => advance('parent-outro')}>Take explicit exit</Button>
        )}
        {terminal && <span className="self-center text-xs text-[#9eabb5]">Graph terminated.</span>}
        <Button variant="ghost" onClick={() => setHistory([])}>
          End presentation
        </Button>
      </div>
    </section>
  );
}

function VariantSwitcher({
  variant,
  setVariant,
}: {
  readonly variant: PrototypeVariant;
  readonly setVariant: (variant: PrototypeVariant) => void;
}) {
  const nested = variant === 'nested';
  return (
    <nav className="space-card-prototype__switcher" aria-label="Prototype variants">
      <Button
        size="icon"
        variant="ghost"
        aria-label="Previous variant"
        onClick={() => setVariant(nested ? 'compound' : 'nested')}
      >
        ←
      </Button>
      <div className="space-card-prototype__switcher-copy">
        <strong>{nested ? 'A · Nested canvases' : 'B · Compound canvas'}</strong>
        <span>{nested ? 'independent child camera' : 'native cross-boundary edges'}</span>
      </div>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Next variant"
        onClick={() => setVariant(nested ? 'compound' : 'nested')}
      >
        →
      </Button>
    </nav>
  );
}

function IndependentSpaceRoot() {
  const [nodes, , onNodesChange] = useNodesState<PrototypeNode>(INITIAL_CHILD_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_CHILD_EDGES);
  const [activeView, setActiveView] = useState<LayoutChoice>('Architecture layout');
  const [activeGraph, setActiveGraph] = useState<GraphChoice>('Decision fork');
  const bridge = useMemo<BridgeControls>(() => ({ begin: () => undefined }), []);
  const childCanvas = useMemo<ChildCanvasState>(
    () => ({
      nodes,
      edges,
      onNodesChange,
      onEdgesChange,
      onConnect: (connection) =>
        setEdges((current) =>
          addEdge(
            { ...connection, id: `child-${current.length + 1}`, style: { stroke: CHILD_GRAPH } },
            current,
          ),
        ),
      onReconnect: (oldEdge, connection) =>
        setEdges((current) => reconnectEdge(oldEdge, connection, current)),
      onGeometryChange: () => undefined,
    }),
    [edges, nodes, onEdgesChange, onNodesChange, setEdges],
  );
  const context = useMemo<SpaceCardState>(
    () => ({
      open: true,
      activeView,
      activeGraph,
      entered: false,
      setOpen: () => undefined,
      setActiveView,
      setActiveGraph,
      setEntered: () => undefined,
      renameCard: () => undefined,
      childCanvas,
      standaloneHref: '',
    }),
    [activeGraph, activeView, childCanvas],
  );

  return (
    <BridgeContext.Provider value={bridge}>
      <SpaceCardContext.Provider value={context}>
        <main className="space-card-prototype space-card-prototype__standalone">
          <header className="space-card-prototype__root-header">
            <div>
              <strong>Research Space</strong>
              <p>Loaded independently — no opener, containing Graph, or return context.</p>
            </div>
            <Button onClick={() => window.close()}>Close tab</Button>
          </header>
          <div className="space-card-prototype__standalone-canvas">
            <ChildCanvas />
          </div>
        </main>
      </SpaceCardContext.Provider>
    </BridgeContext.Provider>
  );
}

function Prototype() {
  const initialVariant: PrototypeVariant =
    new URLSearchParams(window.location.search).get('variant') === 'nested' ? 'nested' : 'compound';
  const [variant, setVariantState] = useState<PrototypeVariant>(initialVariant);
  const [open, setOpenState] = useState(true);
  const [entered, setEntered] = useState(false);
  const [activeView, setActiveView] = useState<LayoutChoice>('Architecture layout');
  const [activeGraph, setActiveGraph] = useState<GraphChoice>('Decision fork');
  const [presentationHistory, setPresentationHistory] = useState<readonly PresentationCard[]>([]);
  const [status, setStatus] = useState(
    initialVariant === 'nested'
      ? 'Drag Cards and author local Edges normally. Hold Shift while dragging a handle across the Space boundary.'
      : 'Drag any handle across the Space boundary; React Flow authors and reconnects the Edge natively.',
  );
  const [geometryRevision, setGeometryRevision] = useState(0);
  const [draft, setDraft] = useState<BridgeDraft | null>(null);
  const [bridges, setBridges] = useState<readonly BridgeEdge[]>(INITIAL_BRIDGES);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const stageRef = useCallback((element: HTMLDivElement | null) => setStage(element), []);
  const bridgeSequence = useRef(INITIAL_BRIDGES.length);

  const [parentNodes, setParentNodes, onParentNodesChange] =
    useNodesState<PrototypeNode>(INITIAL_PARENT_NODES);
  const [parentEdges, setParentEdges, onParentEdgesChange] = useEdgesState(INITIAL_PARENT_EDGES);
  const [childNodes, setChildNodes, onChildNodesChange] =
    useNodesState<PrototypeNode>(INITIAL_CHILD_NODES);
  const [childEdges, setChildEdges, onChildEdgesChange] = useEdgesState(INITIAL_CHILD_EDGES);
  const [compoundNodes, setCompoundNodes, onCompoundNodesChange] =
    useNodesState<PrototypeNode>(COMPOUND_NODES);
  const [compoundEdges, setCompoundEdges, onCompoundEdgesChange] = useEdgesState(COMPOUND_EDGES);

  const bumpGeometry = useCallback(() => setGeometryRevision((revision) => revision + 1), []);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      setParentNodes((nodes) =>
        nodes.map((node) =>
          node.id === 'space-card'
            ? { ...node, width: next ? 720 : 320, height: next ? 520 : 96 }
            : node,
        ),
      );
      setCompoundNodes((nodes) =>
        nodes.map((node) =>
          node.id === 'space-card'
            ? { ...node, width: next ? 720 : 320, height: next ? 520 : 96 }
            : node.parentId === 'space-card'
              ? { ...node, hidden: !next }
              : node,
        ),
      );
      setCompoundEdges((edges) => edges.map((edge) => ({ ...edge, hidden: !next })));
      setStatus(
        next
          ? 'Space Card opened on its remembered Layout and Graph.'
          : 'Cross-Space Edges collapsed to authored entry and exit markers.',
      );
      requestAnimationFrame(bumpGeometry);
    },
    [bumpGeometry, setCompoundEdges, setCompoundNodes, setParentNodes],
  );

  const renameCard = useCallback(
    (scope: CanvasScope, id: string, title: string) => {
      const rename = (nodes: readonly PrototypeNode[]) =>
        nodes.map((node) =>
          node.id === id && node.type === 'markdown'
            ? { ...node, data: { ...node.data, title } }
            : node,
        );
      if (scope === 'parent') setParentNodes(rename);
      else setChildNodes(rename);
      setCompoundNodes(rename);
      setStatus(`Renamed ${scope} Card to “${title}”.`);
    },
    [setChildNodes, setCompoundNodes, setParentNodes],
  );

  const childOnConnect = useCallback(
    (connection: Connection) => {
      setChildEdges((edges) =>
        addEdge(
          { ...connection, id: `child-${edges.length + 1}`, style: { stroke: CHILD_GRAPH } },
          edges,
        ),
      );
      setStatus('Authored a local Edge inside Research Space.');
    },
    [setChildEdges],
  );
  const childOnReconnect = useCallback<OnReconnect<Edge>>(
    (oldEdge, connection) => {
      setChildEdges((edges) => reconnectEdge(oldEdge, connection, edges));
      setStatus('Reconnected a local child Edge.');
    },
    [setChildEdges],
  );
  const childCanvas = useMemo<ChildCanvasState>(
    () => ({
      nodes: childNodes,
      edges: childEdges,
      onNodesChange: onChildNodesChange,
      onEdgesChange: onChildEdgesChange,
      onConnect: childOnConnect,
      onReconnect: childOnReconnect,
      onGeometryChange: bumpGeometry,
    }),
    [
      bumpGeometry,
      childEdges,
      childNodes,
      childOnConnect,
      childOnReconnect,
      onChildEdgesChange,
      onChildNodesChange,
    ],
  );

  const standaloneHref = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('root', 'child');
    url.searchParams.set('variant', variant);
    return url.toString();
  }, [variant]);

  const context = useMemo<SpaceCardState>(
    () => ({
      open,
      activeView,
      activeGraph,
      entered,
      setOpen,
      setActiveView: (view) => {
        setActiveView(view);
        setStatus(
          `This Space Card now shows ${view}; the Space's independent selection is unchanged.`,
        );
      },
      setActiveGraph: (graph) => {
        setActiveGraph(graph);
        setStatus(
          `This Space Card now presents ${graph}; the Space's independent selection is unchanged.`,
        );
      },
      setEntered,
      renameCard,
      childCanvas,
      standaloneHref,
    }),
    [activeGraph, activeView, childCanvas, entered, open, renameCard, setOpen, standaloneHref],
  );

  const beginBridge = useCallback(
    (endpoint: BridgeEndpoint, event: ReactPointerEvent) => {
      if (variant !== 'nested') return;
      event.preventDefault();
      event.stopPropagation();
      setDraft({ source: endpoint, clientX: event.clientX, clientY: event.clientY });
      setStatus(
        'Cross-canvas bridge in progress — release over a target handle in the other canvas.',
      );
    },
    [variant],
  );
  const bridgeControls = useMemo<BridgeControls>(() => ({ begin: beginBridge }), [beginBridge]);

  useEffect(() => {
    if (draft === null) return;
    const move = (event: PointerEvent) =>
      setDraft((current) =>
        current === null
          ? null
          : { source: current.source, clientX: event.clientX, clientY: event.clientY },
      );
    const finish = (event: PointerEvent) => {
      const target = endpointFromElement(document.elementFromPoint(event.clientX, event.clientY));
      if (target !== null && target.role === 'target' && target.scope !== draft.source.scope) {
        bridgeSequence.current += 1;
        setBridges((edges) => [
          ...edges,
          { id: `bridge-${bridgeSequence.current}`, source: draft.source, target },
        ]);
        setStatus('Authored a cross-Space Edge through this Space Card.');
      } else {
        setStatus(
          'Bridge cancelled. Hold Shift and release on a target handle in the other canvas.',
        );
      }
      setDraft(null);
      bumpGeometry();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish, { once: true });
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
    };
  }, [bumpGeometry, draft]);

  const setVariant = useCallback((next: PrototypeVariant) => {
    setVariantState(next);
    setStatus(
      next === 'nested'
        ? 'Nested canvases: hold Shift while dragging a handle across the Space boundary.'
        : 'Compound canvas: drag any handle across the Space boundary with native Edge authoring.',
    );
    const url = new URL(window.location.href);
    url.searchParams.set('variant', next);
    window.history.replaceState(null, '', url);
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        setVariant(variant === 'nested' ? 'compound' : 'nested');
      }
      if (event.key === 'Escape' && entered) setEntered(false);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [entered, setVariant, variant]);

  useEffect(() => {
    const redraw = () => bumpGeometry();
    window.addEventListener('resize', redraw);
    const frame = requestAnimationFrame(redraw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', redraw);
    };
  }, [bumpGeometry, open, variant]);

  const visibleCompoundNodes = useMemo(
    () =>
      compoundNodes.map((node) =>
        node.parentId === 'space-card' ? { ...node, hidden: !open } : node,
      ),
    [compoundNodes, open],
  );

  const architectureNote =
    variant === 'nested'
      ? {
          title: 'A · Two React Flow instances',
          body: 'The embedded Space pans and zooms independently. Local Edges stay native; cross-canvas authoring needs explicit coordination (hold Shift and drag).',
        }
      : {
          title: 'B · One compound React Flow instance',
          body: 'Child Cards are subflow nodes, so entry, exit, authoring, and reconnection are native. The embedded Space shares the parent camera.',
        };

  return (
    <BridgeContext.Provider value={bridgeControls}>
      <SpaceCardContext.Provider value={context}>
        <main className="space-card-prototype">
          <header className="space-card-prototype__masthead">
            <span className="space-card-prototype__eyebrow">Throwaway UX prototype</span>
            <h1>Space Card canvas architecture</h1>
            <p>Same authored scenario, two containment models. Use ←/→ to compare.</p>
          </header>
          <aside className="space-card-prototype__architecture-note">
            <strong>{architectureNote.title}</strong>
            <p>{architectureNote.body}</p>
          </aside>
          <div className="space-card-prototype__stage" ref={stageRef}>
            {variant === 'nested' ? (
              <>
                <ReactFlow
                  key="nested-flow"
                  className="space-card-prototype__flow"
                  nodes={parentNodes}
                  edges={parentEdges}
                  nodeTypes={NODE_TYPES}
                  onNodesChange={onParentNodesChange}
                  onEdgesChange={onParentEdgesChange}
                  onConnect={(connection) =>
                    setParentEdges((edges) =>
                      addEdge(
                        {
                          ...connection,
                          id: `parent-${edges.length + 1}`,
                          style: { stroke: PARENT_GRAPH },
                        },
                        edges,
                      ),
                    )
                  }
                  onMove={bumpGeometry}
                  onNodeDrag={bumpGeometry}
                  fitView
                  fitViewOptions={{ padding: 0.16 }}
                  minZoom={0.18}
                  maxZoom={1.8}
                  nodesConnectable
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={24} color="rgba(28, 39, 51, 0.13)" />
                  <Controls position="bottom-left" showInteractive={false} />
                </ReactFlow>
                {open && (
                  <NestedBridgeLayer
                    stage={stage}
                    edges={bridges}
                    draft={draft}
                    geometryRevision={geometryRevision}
                  />
                )}
              </>
            ) : (
              <ReactFlow
                key="compound-flow"
                className="space-card-prototype__flow"
                nodes={visibleCompoundNodes}
                edges={open ? compoundEdges : []}
                nodeTypes={NODE_TYPES}
                onNodesChange={onCompoundNodesChange}
                onEdgesChange={onCompoundEdgesChange}
                onConnect={(connection) => {
                  setCompoundEdges((edges) =>
                    addEdge(
                      {
                        ...connection,
                        id: `compound-${edges.length + 1}`,
                        style: { stroke: PARENT_GRAPH },
                      },
                      edges,
                    ),
                  );
                  setStatus('Authored an Edge with React Flow native connection handling.');
                }}
                onReconnect={(oldEdge, connection) => {
                  setCompoundEdges((edges) => reconnectEdge(oldEdge, connection, edges));
                  setStatus('Reconnected an Edge across the Space boundary natively.');
                }}
                fitView
                fitViewOptions={{ padding: 0.16 }}
                minZoom={0.18}
                maxZoom={1.8}
                nodesConnectable
                edgesReconnectable
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={24} color="rgba(28, 39, 51, 0.13)" />
                <Controls position="bottom-left" showInteractive={false} />
              </ReactFlow>
            )}
          </div>
          <div className="space-card-prototype__status" role="status">
            {status}
            <Button
              className="ml-2"
              size="compact"
              variant="ghost"
              onClick={() => setPresentationHistory(['parent-intro'])}
            >
              Present Graph
            </Button>
          </div>
          <VariantSwitcher variant={variant} setVariant={setVariant} />
          {entered && (
            <section className="space-card-prototype__entered" aria-label="Entered Research Space">
              <header className="space-card-prototype__entered-header">
                <div className="space-card-prototype__entered-title">
                  <strong>Research Space</strong>
                  <span>
                    Entered from Space Card · {activeView} · {activeGraph}
                  </span>
                </div>
                <Button onClick={() => setEntered(false)}>Back to containing Space</Button>
              </header>
              <div className="space-card-prototype__entered-canvas">
                <ChildCanvas />
              </div>
            </section>
          )}
          <Presentation history={presentationHistory} setHistory={setPresentationHistory} />
        </main>
      </SpaceCardContext.Provider>
    </BridgeContext.Provider>
  );
}

export const CompareCanvasModels: Story = () => {
  const independent = new URLSearchParams(window.location.search).get('root') === 'child';
  return independent ? <IndependentSpaceRoot /> : <Prototype />;
};
CompareCanvasModels.meta = { iframed: true };
