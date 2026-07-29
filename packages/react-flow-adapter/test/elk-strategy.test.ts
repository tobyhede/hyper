import { describe, expect, it } from 'vitest';
import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { LayoutGraph } from '@project/graph';
import { elkStrategy, type ElkEngine } from '../src/index';
import { uuid } from './uuid';

const graph: LayoutGraph = {
  cards: [
    {
      id: uuid('00000000-0000-4000-8000-000000000002'),
      width: 150,
      height: 50,
      ports: [
        { id: 'a-s-a', side: 'out' },
        { id: 'a-s-b', side: 'out' },
      ],
    },
    {
      id: uuid('00000000-0000-4000-8000-000000000003'),
      width: 150,
      height: 50,
      ports: [{ id: 'b-t-a', side: 'in' }],
    },
  ],
  edges: [
    {
      id: 'a-b',
      source: uuid('00000000-0000-4000-8000-000000000002'),
      sourceHandle: 'a-s-a',
      target: uuid('00000000-0000-4000-8000-000000000003'),
      targetHandle: 'b-t-a',
    },
  ],
};

/** Captures the graph handed to ELK instead of laying it out. */
function spyEngine(): { engine: ElkEngine; seen: () => ElkNode } {
  let captured: ElkNode | undefined;
  return {
    engine: {
      layout: (g) => {
        captured = g;
        return Promise.resolve(g);
      },
    },
    seen: () => captured!,
  };
}

describe('elkStrategy', () => {
  it('hands ELK a layered root graph carrying the strategy', async () => {
    const spy = spyEngine();
    await elkStrategy(undefined, spy.engine)(graph);

    const root = spy.seen();
    expect(root.id).toBe('root');
    expect(root.layoutOptions?.['elk.algorithm']).toBe('layered');
    expect(root.children).toHaveLength(2);
  });

  it('assigns port sides (in WEST, out EAST) and lets ELK order them', async () => {
    const spy = spyEngine();
    await elkStrategy(undefined, spy.engine)(graph);

    const a = spy.seen().children!.find((c) => c.id === '00000000-0000-4000-8000-000000000002')!;
    expect(a.layoutOptions?.['org.eclipse.elk.portConstraints']).toBe('FIXED_SIDE');
    expect(a.ports!.map((p) => p.id)).toEqual([
      '00000000-0000-4000-8000-000000000002##a-s-a',
      '00000000-0000-4000-8000-000000000002##a-s-b',
    ]);
    expect(a.ports![0]!.layoutOptions?.['org.eclipse.elk.port.side']).toBe('EAST');

    const b = spy.seen().children!.find((c) => c.id === '00000000-0000-4000-8000-000000000003')!;
    expect(b.ports![0]!.layoutOptions?.['org.eclipse.elk.port.side']).toBe('WEST');
  });

  it('namespaces edge endpoints by card id', async () => {
    const spy = spyEngine();
    await elkStrategy(undefined, spy.engine)(graph);
    expect(spy.seen().edges).toEqual([
      {
        id: 'a-b',
        sources: ['00000000-0000-4000-8000-000000000002##a-s-a'],
        targets: ['00000000-0000-4000-8000-000000000003##b-t-a'],
      },
    ]);
  });

  it('puts positions and port offsets onto the cards it was given', async () => {
    const laid = await elkStrategy()(graph);

    for (const card of laid.cards) {
      expect(Number.isFinite(card.x)).toBe(true);
      expect(Number.isFinite(card.y)).toBe(true);
    }

    const [a, b] = laid.cards;
    // Direction RIGHT: b lands to the right of a.
    expect(b!.x!).toBeGreaterThan(a!.x!);

    // Ports keep the bare handle ids the render layer knows them by.
    expect(a!.ports.map((p) => p.id)).toEqual(['a-s-a', 'a-s-b']);
    expect(Number.isFinite(a!.ports[0]!.y)).toBe(true);
  });

  it("returns ELK's routed geometry on the edges", async () => {
    const laid = await elkStrategy()(graph);
    const edge = laid.edges.find((e) => e.id === 'a-b')!;
    // The routing the app used to discard now comes back on the edge.
    const [section] = edge.sections ?? [];
    expect(section).toBeDefined();
    expect(Number.isFinite(section!.startPoint.x)).toBe(true);
    expect(Number.isFinite(section!.endPoint.x)).toBe(true);
    // The edge keeps the identity it was given.
    expect(edge).toMatchObject({
      id: 'a-b',
      source: '00000000-0000-4000-8000-000000000002',
      target: '00000000-0000-4000-8000-000000000003',
    });
  });
});

describe('routes a back-edge around the cards', () => {
  // We hand the adapter a graph that contains a back-edge directly: it lays out a
  // LayoutGraph and does not enforce domain rules, so this is the level to test
  // back-edge *rendering*. In a real space a back-edge now comes only from two
  // routes disagreeing on the order of shared cards (ADR 0003) — a single route
  // may not close a cycle (ADR 0023). The edges below (`… → C → B`, target B laid
  // left of source C) are just the simplest deterministic back-edge; ELK routes
  // it around the cards and issue 03 draws that instead of a bezier stub.
  const CARDS = [
    uuid('00000000-0000-4000-8000-00000000000a'),
    uuid('00000000-0000-4000-8000-00000000000b'),
    uuid('00000000-0000-4000-8000-00000000000c'),
  ];
  const backConnections = [
    ['loop::0', CARDS[0]!, CARDS[1]!],
    ['loop::1', CARDS[1]!, CARDS[2]!],
    ['loop::2', CARDS[2]!, CARDS[1]!],
  ] as const;
  const backEdge: LayoutGraph = {
    cards: CARDS.map((id) => ({
      id,
      width: 260,
      height: 300,
      ports: [
        { id: 'loop::in', side: 'in' as const },
        { id: 'loop::out', side: 'out' as const },
      ],
    })),
    edges: backConnections.map(([id, source, target]) => ({
      id,
      source,
      target,
      sourceHandle: 'loop::out',
      targetHandle: 'loop::in',
    })),
  };

  it('gives the back-edge bend points, so it channels around rather than cutting across', async () => {
    const laid = await elkStrategy()(backEdge);
    const back = laid.edges.find((e) => e.id === 'loop::2')!;
    const [section] = back.sections ?? [];
    expect(section).toBeDefined();
    // A forward edge between adjacent layers is straight; a back-edge has to turn
    // out, run past the cards and back in — which ELK expresses as bend points.
    expect(section!.bendPoints?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('port id collision', () => {
  // Every card on a route carries the *same* handle ids (`00000000-0000-4000-8000-000000000004::in`/`00000000-0000-4000-8000-000000000004::out`),
  // so using bare handle ids as ELK port ids left ELK unable to tell which card
  // an edge attached to — collapsing layers even for a single route.
  const CHAIN = [
    uuid('00000000-0000-4000-8000-00000000000a'),
    uuid('00000000-0000-4000-8000-00000000000b'),
    uuid('00000000-0000-4000-8000-00000000000c'),
    uuid('00000000-0000-4000-8000-00000000000d'),
    uuid('00000000-0000-4000-8000-00000000000e'),
  ];

  const chain: LayoutGraph = {
    cards: CHAIN.map((id, i) => ({
      id,
      width: 260,
      height: 300,
      ports: [
        ...(i > 0 ? [{ id: '00000000-0000-4000-8000-000000000004::in', side: 'in' as const }] : []),
        ...(i < CHAIN.length - 1
          ? [{ id: '00000000-0000-4000-8000-000000000004::out', side: 'out' as const }]
          : []),
      ],
    })),
    edges: CHAIN.slice(0, -1).map((id, i) => ({
      id: `00000000-0000-4000-8000-000000000004::${i}`,
      source: id,
      sourceHandle: '00000000-0000-4000-8000-000000000004::out',
      target: CHAIN[i + 1]!,
      targetHandle: '00000000-0000-4000-8000-000000000004::in',
    })),
  };

  it('gives every card a distinct ELK port id', async () => {
    const spy = spyEngine();
    await elkStrategy(undefined, spy.engine)(chain);
    const ids = spy.seen().children!.flatMap((c) => c.ports!.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lays a single route out as a strictly left-to-right chain', async () => {
    const laid = await elkStrategy()(chain);
    const xs = laid.cards.map((c) => c.x!);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
    }
  });

  it('still exposes port offsets under the bare handle id', async () => {
    const laid = await elkStrategy()(chain);
    const b = laid.cards.find((c) => c.id === CHAIN[1])!;
    expect(
      Number.isFinite(b.ports.find((p) => p.id === '00000000-0000-4000-8000-000000000004::in')!.y),
    ).toBe(true);
    expect(
      Number.isFinite(b.ports.find((p) => p.id === '00000000-0000-4000-8000-000000000004::out')!.y),
    ).toBe(true);
  });
});

describe('shared cards keep each route on one line', () => {
  // Two routes running through the same cards. Under FIXED_ORDER, ELK orders
  // ports *clockwise* — EAST top-to-bottom but WEST bottom-to-top — so handing
  // both sides the same list order put a route's outbound handle at the top of
  // one card and its inbound handle at the bottom of the next, crossing the two
  // routes at every shared card. FIXED_SIDE lets ELK order within each side.
  const shared: LayoutGraph = {
    cards: [
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000005',
    ]
      .map(uuid)
      .map((id, i) => ({
        id,
        width: 260,
        height: 300,
        ports: [
          ...(i > 0
            ? [
                { id: '00000000-0000-4000-8000-000000000032::in', side: 'in' as const },
                { id: '00000000-0000-4000-8000-000000000033::in', side: 'in' as const },
              ]
            : []),
          ...(i < 2
            ? [
                { id: '00000000-0000-4000-8000-000000000032::out', side: 'out' as const },
                { id: '00000000-0000-4000-8000-000000000033::out', side: 'out' as const },
              ]
            : []),
        ],
      })),
    edges: [
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000003'),
    ].flatMap((src, i) =>
      ['00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000033'].map((r) => ({
        id: `${r}::${i}`,
        source: src,
        target: [
          uuid('00000000-0000-4000-8000-000000000003'),
          uuid('00000000-0000-4000-8000-000000000005'),
        ][i]!,
        sourceHandle: `${r}::out`,
        targetHandle: `${r}::in`,
      })),
    ),
  };

  it('puts a route at the same offset on both sides of every card', async () => {
    const laid = await elkStrategy()(shared);
    const offset = (cardId: string, handleId: string) =>
      laid.cards.find((c) => c.id === cardId)!.ports.find((p) => p.id === handleId)!.y;

    for (const route of [
      '00000000-0000-4000-8000-000000000032',
      '00000000-0000-4000-8000-000000000033',
    ]) {
      // Leaving a card and arriving at the next must be the same height, or the
      // two routes swap places between every pair of cards.
      expect(offset('00000000-0000-4000-8000-000000000002', `${route}::out`)).toBe(
        offset('00000000-0000-4000-8000-000000000003', `${route}::in`),
      );
      expect(offset('00000000-0000-4000-8000-000000000003', `${route}::out`)).toBe(
        offset('00000000-0000-4000-8000-000000000005', `${route}::in`),
      );
    }
  });

  it('keeps the two routes apart', async () => {
    const laid = await elkStrategy()(shared);
    const b = laid.cards.find((c) => c.id === '00000000-0000-4000-8000-000000000003')!;
    const at = (id: string) => b.ports.find((p) => p.id === id)!.y;
    expect(at('00000000-0000-4000-8000-000000000032::in')).not.toBe(
      at('00000000-0000-4000-8000-000000000033::in'),
    );
  });
});
