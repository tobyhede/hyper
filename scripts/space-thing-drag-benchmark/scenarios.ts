import {
  spaceSnapshotSchema,
  uuidSchema,
  type SpaceSnapshot,
  type ThingPlacement,
  type UUID,
} from '@project/core';

export const BENCHMARK_SCALES = [10, 50, 100, 500] as const;
export type BenchmarkScale = (typeof BENCHMARK_SCALES)[number];
export type EdgeDensity = 'sparse' | 'dense';

export interface BenchmarkOptions {
  readonly scale: BenchmarkScale;
  readonly density: EdgeDensity;
  readonly openParents: 1 | 3;
}

export function benchmarkOptions(environment: NodeJS.ProcessEnv = process.env): BenchmarkOptions {
  const requestedScale = Number(environment['BENCHMARK_SCALE'] ?? '10');
  const scale = BENCHMARK_SCALES.find((candidate) => candidate === requestedScale);
  if (scale === undefined) throw new Error(`Unsupported BENCHMARK_SCALE: ${requestedScale}`);
  const requestedDensity = environment['BENCHMARK_DENSITY'] ?? 'sparse';
  if (requestedDensity !== 'sparse' && requestedDensity !== 'dense')
    throw new Error(`Unsupported BENCHMARK_DENSITY: ${requestedDensity}`);
  const requestedParents = Number(environment['BENCHMARK_OPEN_PARENTS'] ?? '1');
  if (requestedParents !== 1 && requestedParents !== 3)
    throw new Error(`Unsupported BENCHMARK_OPEN_PARENTS: ${requestedParents}`);
  return { scale, density: requestedDensity, openParents: requestedParents };
}

const id = (value: number): UUID =>
  uuidSchema.parse(`10000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`);

const markdown = (thingId: UUID, title: string) => ({
  id: thingId,
  document: { title, kind: 'markdown' as const, body: `# ${title}\n\nBenchmark content.` },
});

export interface BenchmarkScenario {
  readonly name: string;
  readonly scale: BenchmarkScale;
  readonly density: EdgeDensity;
  readonly openParents: 1 | 3;
  readonly aggregate: { readonly metaSpaceId: UUID; readonly spaces: readonly SpaceSnapshot[] };
  readonly expected: {
    readonly mountedThings: number;
    readonly mountedEdges: number;
    readonly visibleThings: number;
    readonly visibleEdges: number;
  };
}

export function benchmarkScenario(
  scale: BenchmarkScale,
  density: EdgeDensity,
  openParents: 1 | 3,
): BenchmarkScenario {
  const metaId = id(1);
  const targetId = id(2);
  const leafId = id(3);
  const metaDiagram = id(10);
  const metaGraph = id(11);
  const targetDiagram = id(20);
  const targetGraph = id(21);
  const leafDiagram = id(30);
  const leafGraph = id(31);
  const ordinaryId = id(40);
  const parentIds = Array.from({ length: openParents }, (_, index) => id(100 + index));
  const targetThingIds = Array.from({ length: scale }, (_, index) => id(1_000 + index));
  const nestedParentId = id(900);
  const leafThingId = id(901);
  const edges = targetThingIds.flatMap((from, index) => {
    const next = targetThingIds[index + 1];
    if (next === undefined) return [];
    const result = [{ from, to: next }];
    if (density === 'dense') {
      const second = targetThingIds[index + 2];
      const fourth = targetThingIds[index + 4];
      if (second !== undefined) result.push({ from, to: second });
      if (fourth !== undefined) result.push({ from, to: fourth });
    }
    return result;
  });
  const targetPositions: Record<UUID, ThingPlacement> = {};
  targetThingIds.forEach((thingId, index) => {
    targetPositions[thingId] = {
      x: (index % 10) * 340,
      y: Math.floor(index / 10) * 180,
      open: false,
    };
  });
  targetPositions[nestedParentId] = {
    x: 0,
    y: Math.ceil(scale / 10) * 180,
    open: true,
    openSize: { width: 640, height: 360 },
  };
  const metaPositions: Record<UUID, ThingPlacement> = {};
  metaPositions[ordinaryId] = { x: 20, y: 20, open: false };
  parentIds.forEach((thingId, index) => {
    metaPositions[thingId] = {
      x: 380 + index * 760,
      y: 20,
      open: true,
      openSize: { width: 700, height: 620 },
    };
  });

  const leaf = spaceSnapshotSchema.parse({
    id: leafId,
    document: {
      version: 1,
      title: 'Benchmark leaf',
      defaultDiagram: leafDiagram,
      diagrams: [
        {
          id: leafDiagram,
          title: 'Leaf',
          kind: 'positioned',
          positions: { [leafThingId]: { x: 24, y: 24, open: false } },
          graphs: [{ id: leafGraph, title: 'Leaf graph', edges: [] }],
          activeGraph: leafGraph,
        },
      ],
    },
    things: [markdown(leafThingId, 'Nested leaf Thing')],
  });
  const target = spaceSnapshotSchema.parse({
    id: targetId,
    document: {
      version: 1,
      title: `Benchmark target ${scale}`,
      defaultDiagram: targetDiagram,
      diagrams: [
        {
          id: targetDiagram,
          title: 'Embedded scale',
          kind: 'positioned',
          positions: targetPositions,
          graphs: [{ id: targetGraph, title: `${density} graph`, edges }],
          activeGraph: targetGraph,
        },
      ],
    },
    things: [
      ...targetThingIds.map((thingId, index) => markdown(thingId, `Embedded ${index + 1}`)),
      {
        id: nestedParentId,
        document: {
          title: 'Nested Space Thing',
          kind: 'space',
          spaceId: leafId,
          diagram: leafDiagram,
          graph: leafGraph,
        },
      },
    ],
  });
  const meta = spaceSnapshotSchema.parse({
    id: metaId,
    document: {
      version: 1,
      title: `Space Thing drag benchmark ${scale}`,
      defaultDiagram: metaDiagram,
      diagrams: [
        {
          id: metaDiagram,
          title: 'Benchmark',
          kind: 'positioned',
          positions: metaPositions,
          graphs: [
            {
              id: metaGraph,
              title: 'Parents',
              edges: parentIds.slice(1).flatMap((to, index) => {
                const from = parentIds[index];
                return from === undefined ? [] : [{ from, to }];
              }),
            },
          ],
          activeGraph: metaGraph,
        },
      ],
    },
    things: [
      markdown(ordinaryId, 'Ordinary Markdown Thing'),
      ...parentIds.map((thingId, index) => ({
        id: thingId,
        document: {
          title: `Parent ${index + 1}`,
          kind: 'space' as const,
          spaceId: targetId,
          diagram: targetDiagram,
          graph: targetGraph,
        },
      })),
    ],
  });
  // Open Spaces retains the target and leaf canvases beside the visible Meta
  // canvas. Count those roots as mounted, while the visible count describes
  // only Meta and the embeddings it currently draws.
  const visibleThings = 1 + openParents + openParents * (scale + 2);
  const visibleEdges = Math.max(0, openParents - 1) + openParents * edges.length;
  const mountedThings = visibleThings + (scale + 2) + 1;
  const mountedEdges = visibleEdges + edges.length;
  return {
    name: `${scale}-${density}-${openParents}-parent${openParents === 1 ? '' : 's'}`,
    scale,
    density,
    openParents,
    aggregate: { metaSpaceId: metaId, spaces: [meta, target, leaf] },
    expected: {
      mountedThings,
      mountedEdges,
      visibleThings,
      visibleEdges,
    },
  };
}
