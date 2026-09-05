import { describe, expect, it } from 'vitest';
import { spaceSnapshotSchema, uuidSchema } from '@project/core';
import { loadSpaceSnapshot, Placement, positionedStrategy } from '@project/graph';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { canvasProjection } from '../src/canvas-projection';
import { constrainEmbeddedPosition, embeddedLayout, embeddedNodeId } from '../src/embedded-layout';
import { resolveLayout } from '../src/layout-resolution';

const id = (value: number) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`);
const SPACE = id(1);
const LAYOUT = id(2);
const GRAPH = id(3);
const A = id(4);
const B = id(5);
const ALIAS = id(6);
const PARENT = id(7);

async function projection(open = false) {
  const loaded = loadSpaceSnapshot(
    spaceSnapshotSchema.parse({
      id: SPACE,
      document: {
        version: 1,
        title: 'Target',
        defaultLayout: LAYOUT,
        layouts: [
          {
            id: LAYOUT,
            title: 'Layout',
            kind: 'positioned',
            positions: {
              [A]: { x: 0, y: 0, open: false },
              [B]: { x: 400, y: 0, open: false },
              [ALIAS]: open
                ? { x: 0, y: 300, open: true, openSize: { width: 560, height: 420 } }
                : { x: 0, y: 300, open: false },
            },
            graphs: [{ id: GRAPH, title: 'Graph', edges: [{ from: A, to: B }] }],
          },
        ],
      },
      cards: [
        { id: A, document: { kind: 'markdown', title: 'A', body: 'Target content' } },
        { id: B, document: { kind: 'markdown', title: 'B', body: '' } },
        { id: ALIAS, document: { kind: 'alias', title: 'Alias', target: A } },
      ],
    }),
  );
  if (!loaded.ok) throw new Error('Invalid fixture');
  const resolved = resolveLayout(loaded.space, LAYOUT);
  const pending = canvasProjection(loaded.space, resolved);
  return pending.project(
    await positionedStrategy(Placement.fromLayout(resolved.layout))(pending.strategyGraph),
    {
      activeGraphId: GRAPH,
      activeCardId: null,
      selectedCardId: null,
      presenting: false,
      moved: false,
    },
  );
}

const parent = (source: CardFlowNode, width = 1000, height = 1000): CardFlowNode => ({
  ...source,
  id: PARENT,
  width,
  height,
  position: { x: 800, y: 900 },
  zIndex: 10,
  data: { ...source.data, cardId: PARENT, kind: 'space' },
});

async function draw(open = false, width = 1000, height = 1000) {
  const projected = await projection(open);
  const first = projected.nodes[0];
  if (first === undefined) throw new Error('No fixture Card');
  return {
    projected,
    parent: parent(first, width, height),
    drawn: embeddedLayout({
      parent: parent(first, width, height),
      projection: projected,
      offset: { x: 16, y: 42 },
      enabled: true,
    }),
  };
}

describe('an embedded production projection', () => {
  it('parents Cards and translates their authored positions without moving the source', async () => {
    const { drawn, projected } = await draw();
    expect(drawn.nodes.find((node) => node.data.cardId === B)).toMatchObject({
      id: embeddedNodeId(PARENT, B),
      parentId: PARENT,
      position: { x: 416, y: 42 },
      draggable: true,
      selectable: true,
      focusable: true,
      connectable: false,
    });
    expect(projected.nodes.find((node) => node.data.cardId === B)?.position).toEqual({
      x: 400,
      y: 0,
    });
  });

  it('draws a Card beyond the containing bounds where it was authored, clipped rather than moved', async () => {
    // React Flow applies a numeric `extent` in `adoptUserNodes`, which is
    // rendering and not only dragging, so an extent narrower than the authored
    // placement silently redraws the Layout. Clipping is what a Card that no
    // longer fits gets; the containing bounds constrain gesture proposals
    // instead (`constrainEmbeddedPosition`).
    const { drawn } = await draw(false, 400, 400);
    const beyond = drawn.nodes.find((node) => node.data.cardId === B);
    expect(beyond?.position).toEqual({ x: 416, y: 42 });
    expect(beyond?.extent).toBeUndefined();
    expect(beyond?.style?.clipPath).toBe('inset(0px 292px 0px 0px)');
  });

  it('constrains a gesture proposal to the containing bounds', () => {
    const bounds = { width: 700, height: 500 };
    expect(constrainEmbeddedPosition({ x: 600, y: 40 }, bounds)).toEqual({ x: 600, y: 40 });
    expect(constrainEmbeddedPosition({ x: 900, y: 640 }, bounds)).toEqual({ x: 700, y: 500 });
    expect(constrainEmbeddedPosition({ x: -30, y: -8 }, bounds)).toEqual({ x: 0, y: 0 });
  });

  it('clips a partial Card instead of removing it when the containing Card gets smaller', async () => {
    const { drawn } = await draw(false, 560, 420);
    expect(drawn.nodes).toHaveLength(3);
    expect(drawn.nodes.find((node) => node.data.cardId === B)?.style?.clipPath).toBe(
      'inset(0px 132px 0px 0px)',
    );
  });

  it('uses the target projection for Open Alias content and displaced neighbours', async () => {
    const { drawn } = await draw(true);
    expect(drawn.nodes.find((node) => node.data.cardId === ALIAS)).toMatchObject({
      width: 560,
      height: 420,
      data: { expanded: true, body: 'Target content', kind: 'alias' },
    });
    expect(drawn.nodes.find((node) => node.data.cardId === B)?.position).toEqual({ x: 716, y: 42 });
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

  it('gives two embeddings of the same Space distinct node and Edge identities', async () => {
    const { drawn, projected, parent } = await draw();
    const second = embeddedLayout({
      parent: { ...parent, id: id(8) },
      projection: projected,
      offset: { x: 16, y: 42 },
      enabled: true,
    });
    expect(new Set([...drawn.nodes, ...second.nodes].map((node) => node.id)).size).toBe(6);
    expect(new Set([...drawn.edges, ...second.edges].map((edge) => edge.id)).size).toBe(2);
  });
});
