import { describe, expect, it } from 'vitest';
import { SPACE_THING_EMBED_INSET, spaceSnapshotSchema, uuidSchema } from '@project/core';
import { loadSpaceSnapshot, Placement, positionedStrategy } from '@project/graph';
import { AUTHORING_HANDLE_DIAMETER, type ThingFlowNode } from '@project/react-flow-adapter';
import { canvasProjection } from '../src/canvas-projection';
import {
  canvasNodeConnection,
  clipEmbeddedNode,
  constrainEmbeddedPosition,
  embeddedDiagram,
  embeddedNodeId,
  parseEmbeddedNodeId,
  type EmbeddedParentProjection,
} from '../src/embedded-diagram';
import { resolveDiagram } from '../src/diagram-resolution';

const id = (value: number) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`);
const SPACE = id(1);
const DIAGRAM = id(2);
const GRAPH = id(3);
const A = id(4);
const B = id(5);
const REFERENCE = id(6);
const PARENT = id(7);

async function projection(open = false) {
  const loaded = loadSpaceSnapshot(
    spaceSnapshotSchema.parse({
      id: SPACE,
      document: {
        version: 1,
        title: 'Target',
        defaultDiagram: DIAGRAM,
        diagrams: [
          {
            id: DIAGRAM,
            title: 'Diagram',
            kind: 'positioned',
            positions: {
              [A]: { x: 0, y: 0, open: false },
              [B]: { x: 400, y: 0, open: false },
              [REFERENCE]: open
                ? { x: 0, y: 300, open: true, openSize: { width: 560, height: 420 } }
                : { x: 0, y: 300, open: false },
            },
            graphs: [{ id: GRAPH, title: 'Graph', edges: [{ from: A, to: B }] }],
          },
        ],
      },
      things: [
        { id: A, document: { kind: 'markdown', title: 'A', body: 'Target content' } },
        { id: B, document: { kind: 'markdown', title: 'B', body: '' } },
        { id: REFERENCE, document: { kind: 'reference', title: 'Reference Thing', target: A } },
      ],
    }),
  );
  if (!loaded.ok) throw new Error('Invalid fixture');
  const resolved = resolveDiagram(loaded.space, DIAGRAM);
  const pending = canvasProjection(loaded.space, resolved);
  return pending.project(
    await positionedStrategy(Placement.fromDiagram(resolved.diagram))(pending.strategyGraph),
    {
      activeGraphId: GRAPH,
      activeThingId: null,
      selectedThingId: null,
      presenting: false,
    },
  );
}

const parent = (source: ThingFlowNode, width = 1000, height = 1000): ThingFlowNode => ({
  ...source,
  id: PARENT,
  width,
  height,
  position: { x: 800, y: 900 },
  zIndex: 10,
  data: { ...source.data, thingId: PARENT, kind: 'space' },
});

async function draw(open = false, width = 1000, height = 1000) {
  const projected = await projection(open);
  const first = projected.nodes[0];
  if (first === undefined) throw new Error('No fixture Thing');
  return {
    projected,
    parent: parent(first, width, height),
    drawn: embeddedDiagram({
      parent: parent(first, width, height),
      projection: projected,
      offset: { x: 16, y: 42 },
      enabled: true,
    }),
  };
}

const embedded = (nodes: readonly ThingFlowNode[], thingId: string): ThingFlowNode => {
  const node = nodes.find((candidate) => candidate.data.thingId === thingId);
  if (node === undefined) throw new Error('No embedded Thing');
  return node;
};

/** The region `embeddedDiagram` clips into when no narrower bounds are given. */
const view = (parent: {
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}) => ({
  top: SPACE_THING_EMBED_INSET.top,
  left: SPACE_THING_EMBED_INSET.left,
  right: (parent.width ?? 0) - SPACE_THING_EMBED_INSET.right,
  bottom: (parent.height ?? 0) - SPACE_THING_EMBED_INSET.bottom,
});

const projectionParent = (source: ThingFlowNode): EmbeddedParentProjection => ({
  id: source.id,
  width: source.width,
  height: source.height,
  zIndex: source.zIndex,
});

const drawFrom = (
  source: ThingFlowNode,
  projected: Awaited<ReturnType<typeof projection>>,
  bounds = view(source),
) =>
  embeddedDiagram({
    parent: projectionParent(source),
    projection: projected,
    offset: { x: 16, y: 42 },
    enabled: true,
    bounds,
  });

describe('an embedded production projection', () => {
  it('does not reparent from the containing Thing canvas position', async () => {
    const { parent: initial, projected } = await draw();
    const before = drawFrom(initial, projected);
    const after = drawFrom(
      {
        ...initial,
        position: { x: initial.position.x + 120, y: initial.position.y + 80 },
      },
      projected,
    );
    expect(after).toEqual(before);
  });

  it('redraws when the containing Thing z-index changes', async () => {
    const { parent: initial, projected } = await draw();
    expect(drawFrom({ ...initial, zIndex: (initial.zIndex ?? 0) + 1 }, projected)).not.toEqual(
      drawFrom(initial, projected),
    );
  });

  it('redraws when the target projection or ancestor bounds change', async () => {
    const { parent: initial, projected } = await draw();
    const before = drawFrom(initial, projected);
    const first = projected.nodes[0];
    if (first === undefined) throw new Error('No fixture Thing');
    const moved = {
      ...projected,
      nodes: [
        { ...first, position: { x: first.position.x + 24, y: first.position.y } },
        ...projected.nodes.slice(1),
      ],
    };
    expect(drawFrom(initial, moved)).not.toEqual(before);
    expect(drawFrom(initial, projected, { ...view(initial), right: 300 })).not.toEqual(before);
  });

  it('parents Things and translates their authored positions without moving the source', async () => {
    const { drawn, projected } = await draw();
    expect(drawn.nodes.find((node) => node.data.thingId === B)).toMatchObject({
      id: embeddedNodeId(PARENT, B),
      parentId: PARENT,
      position: { x: 416, y: 42 },
      draggable: true,
      selectable: true,
      focusable: true,
      connectable: true,
      data: { connectionAuthoringEnabled: true },
    });
    expect(projected.nodes.find((node) => node.data.thingId === B)?.position).toEqual({
      x: 400,
      y: 0,
    });
  });

  it('draws a Thing beyond the containing bounds where it was authored, clipped rather than moved', async () => {
    // React Flow applies a numeric `extent` in `adoptUserNodes`, which is
    // rendering and not only dragging, so an extent narrower than the authored
    // placement silently redraws the Diagram. Clipping is what a Thing that no
    // longer fits gets; the containing bounds constrain gesture proposals
    // instead (`constrainEmbeddedPosition`).
    const { drawn } = await draw(false, 400, 400);
    const beyond = drawn.nodes.find((node) => node.data.thingId === B);
    expect(beyond?.position).toEqual({ x: 416, y: 42 });
    expect(beyond?.extent).toBeUndefined();
    expect(beyond?.style?.clipPath).toBe('inset(-12px 292px -12px -12px)');
  });

  it('constrains a gesture proposal to the drawn region, not the containing box', () => {
    // These expectations used to clamp into `[0, width] x [0, height]`, which is
    // the containing Thing's own box rather than what it draws: the bands
    // `SPACE_THING_EMBED_INSET` reserves are its rail, border and footer, and a
    // proposal accepted inside them is clipped rather than drawn (below).
    const drawn = view({ width: 700, height: 500 });
    expect(constrainEmbeddedPosition({ x: 600, y: 120 }, drawn)).toEqual({ x: 600, y: 120 });
    expect(constrainEmbeddedPosition({ x: 900, y: 640 }, drawn)).toEqual({ x: 660, y: 372 });
    expect(constrainEmbeddedPosition({ x: -30, y: -8 }, drawn)).toEqual({ x: 16, y: 16 });
  });

  it('holds a proposal inside bounds an ancestor has narrowed', () => {
    // A nested embedding is clipped by every ancestor as well as by its own
    // containing Thing, and `SpaceCanvas` hands that intersection down as the
    // request's bounds. Clamped into the containing Thing's own region instead,
    // a proposal is accepted where the ancestor's clip then hides it — the same
    // defect as the corner case above, one level in.
    const narrowed = { left: 16, top: 42, right: 300, bottom: 200 };
    expect(constrainEmbeddedPosition({ x: 900, y: 640 }, narrowed)).toEqual({ x: 276, y: 176 });
  });

  it('leaves a proposal taken to the bottom-right corner drawn rather than clipped away', async () => {
    const { drawn, parent } = await draw(false, 700, 500);
    const node = embedded(drawn.nodes, B);
    const held = constrainEmbeddedPosition({ x: 900, y: 640 }, view(parent));
    // 260x146 of Thing, of which the sliver keeps 24 on each axis inside the
    // view: right 660 + 260 - 684, bottom 372 + 146 - 396. Clamped to the
    // containing box instead, both clips exceeded the Thing's own extent and the
    // committed Thing vanished from the embedded view altogether.
    expect(clipEmbeddedNode({ ...node, position: held }, view(parent)).style?.clipPath).toBe(
      'inset(-12px 236px 122px -12px)',
    );
  });

  it('leaves a proposal taken to the rail and border bands drawn rather than clipped away', async () => {
    const { drawn, parent } = await draw(false, 700, 500);
    const node = embedded(drawn.nodes, B);
    const held = constrainEmbeddedPosition({ x: -30, y: -8 }, view(parent));
    const slack = AUTHORING_HANDLE_DIAMETER / 2;
    expect(clipEmbeddedNode({ ...node, position: held }, view(parent)).style?.clipPath).toBe(
      `inset(-${slack}px -${slack}px -${slack}px -${slack}px)`,
    );
  });

  it('clips a partial Thing instead of removing it when the containing Thing gets smaller', async () => {
    const { drawn } = await draw(false, 560, 420);
    expect(drawn.nodes).toHaveLength(3);
    expect(drawn.nodes.find((node) => node.data.thingId === B)?.style?.clipPath).toBe(
      'inset(-12px 132px -12px -12px)',
    );
  });

  it('uses the target projection for Open Reference Thing content and its authored placement', async () => {
    const { drawn } = await draw(true);
    expect(drawn.nodes.find((node) => node.data.thingId === REFERENCE)).toMatchObject({
      width: 560,
      height: 420,
      data: { expanded: true, body: 'Target content', kind: 'reference' },
    });
    // B sits at the target Diagram's authored 400 plus the embedding offset, and
    // the Open Reference Thing below it moves nothing: displacement is applied by the Edit
    // that opens a Thing, so it is already in the coordinates the target Space
    // stores (ADR 0084).
    expect(drawn.nodes.find((node) => node.data.thingId === B)?.position).toEqual({
      x: 416,
      y: 42,
    });
  });

  it('remaps Edge endpoints while preserving the production handle declarations', async () => {
    const { drawn, projected } = await draw();
    expect(drawn.edges[0]).toMatchObject({
      source: embeddedNodeId(PARENT, A),
      target: embeddedNodeId(PARENT, B),
      selectable: false,
      reconnectable: false,
    });
    expect(drawn.nodes[0]?.handles).toEqual(projected.nodes[0]?.handles);
    expect(drawn.edges[0]?.sourceHandle).toBe(projected.edges[0]?.sourceHandle);
  });

  it('reads a placement id back into its parent and Thing', () => {
    expect(parseEmbeddedNodeId(embeddedNodeId(PARENT, A))).toEqual({
      parentId: PARENT,
      thingId: A,
    });
    const nestedParent = embeddedNodeId(PARENT, B);
    expect(parseEmbeddedNodeId(embeddedNodeId(nestedParent, A))).toEqual({
      parentId: nestedParent,
      thingId: A,
    });
    expect(parseEmbeddedNodeId(A)).toBeUndefined();
    expect(parseEmbeddedNodeId('embedded:not-a-thing')).toBeUndefined();
  });

  it('routes a pair of canvas node ids to one Space or refuses a cross-Space pair', () => {
    expect(canvasNodeConnection(A, B)).toEqual({ kind: 'host', from: A, to: B });
    expect(canvasNodeConnection(embeddedNodeId(PARENT, A), embeddedNodeId(PARENT, B))).toEqual({
      kind: 'embedded',
      parentId: PARENT,
      from: A,
      to: B,
    });
    expect(canvasNodeConnection(embeddedNodeId(PARENT, A), B)).toEqual({ kind: 'invalid' });
    expect(canvasNodeConnection(embeddedNodeId(PARENT, A), embeddedNodeId(A, B))).toEqual({
      kind: 'invalid',
    });
  });

  it('gives embedded nodes placement ids that are not Thing identities', async () => {
    const { drawn } = await draw();
    for (const node of drawn.nodes) {
      expect(uuidSchema.safeParse(node.id).success).toBe(false);
      expect(node.id).toBe(embeddedNodeId(PARENT, node.data.thingId));
      expect(uuidSchema.safeParse(node.data.thingId).success).toBe(true);
    }
    for (const edge of drawn.edges) {
      expect(uuidSchema.safeParse(edge.source).success).toBe(false);
      expect(uuidSchema.safeParse(edge.target).success).toBe(false);
    }
  });

  it('does not change a Thing flow-pixel size when the portal zooms', async () => {
    const projected = await projection();
    const first = projected.nodes[0];
    if (first === undefined) throw new Error('No fixture Thing');
    const source = projected.nodes.find((node) => node.data.thingId === B);
    if (source === undefined) throw new Error('No fixture Thing B');
    const zoomed = embeddedDiagram({
      parent: parent(first),
      projection: projected,
      offset: { x: 16, y: 42 },
      zoom: 0.5,
      enabled: true,
    });
    const drawn = embedded(zoomed.nodes, B);
    expect(drawn.width).toBe(source.width);
    expect(drawn.height).toBe(source.height);
    expect(drawn.position).toEqual({ x: 400 * 0.5 + 16, y: 0 * 0.5 + 42 });
    expect(drawn.handles).toEqual(source.handles);
    expect(drawn.style).not.toHaveProperty('--embed-zoom');
    expect(drawn.style).toMatchObject({ transition: 'none' });
  });

  it('clips a zoomed Thing to the containing window so it cannot paint outside', async () => {
    const projected = await projection();
    const first = projected.nodes[0];
    if (first === undefined) throw new Error('No fixture Thing');
    const source = projected.nodes.find((node) => node.data.thingId === B);
    if (source === undefined) throw new Error('No fixture Thing B');
    const containing = parent(first, 400, 400);
    const zoomed = embeddedDiagram({
      parent: containing,
      projection: projected,
      offset: { x: 16, y: 42 },
      zoom: 4,
      enabled: true,
    });
    const drawn = embedded(zoomed.nodes, B);
    // B is authored at 400,0. Framing multiplies the point, not the box, so the
    // Thing sits at 1616,42 at its Closed Size and is fully to the right of a
    // 400-wide window (right edge 384). The 1492px right inset is that overflow.
    expect(drawn.width).toBe(source.width);
    expect(drawn.height).toBe(source.height);
    expect(drawn.position).toEqual({ x: 1616, y: 42 });
    expect(drawn.style?.clipPath).toBe('inset(-12px 1492px -12px -12px)');
  });

  it('makes a Read embedding inert so the containing Space Thing remains the drag target', async () => {
    const projected = await projection();
    const first = projected.nodes[0];
    if (first === undefined) throw new Error('No fixture Thing');
    const containing = parent(first);
    const inert = embeddedDiagram({
      parent: containing,
      projection: projected,
      offset: { x: 16, y: 42 },
      enabled: false,
    });
    expect(inert.nodes[0]).toMatchObject({
      draggable: false,
      selectable: false,
      focusable: false,
      connectable: false,
      className: 'nopan nowheel nodrag',
      data: { connectionAuthoringEnabled: false },
    });
    expect(inert.nodes[0]?.style?.pointerEvents).toBe('none');
  });

  it('gives two embeddings of the same Space distinct node and Edge identities', async () => {
    const { drawn, projected, parent } = await draw();
    const second = embeddedDiagram({
      parent: { ...parent, id: id(8) },
      projection: projected,
      offset: { x: 16, y: 42 },
      enabled: true,
    });
    expect(new Set([...drawn.nodes, ...second.nodes].map((node) => node.id)).size).toBe(6);
    expect(new Set([...drawn.edges, ...second.edges].map((edge) => edge.id)).size).toBe(2);
  });
});
