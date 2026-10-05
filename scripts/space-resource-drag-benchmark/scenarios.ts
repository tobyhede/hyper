import {
  spaceSnapshotSchema,
  uuidSchema,
  type SpaceSnapshot,
  type ResourcePlacement,
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

const markdown = (resourceId: UUID, title: string) => ({
  id: resourceId,
  document: { title, kind: 'markdown' as const, body: `# ${title}\n\nBenchmark content.` },
});

export interface BenchmarkScenario {
  readonly name: string;
  readonly scale: BenchmarkScale;
  readonly density: EdgeDensity;
  readonly openParents: 1 | 3;
  readonly aggregate: { readonly metaSpaceId: UUID; readonly spaces: readonly SpaceSnapshot[] };
  readonly expected: {
    readonly mountedResources: number;
    readonly mountedEdges: number;
    readonly visibleResources: number;
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
  const metaMap = id(10);
  const metaGraph = id(11);
  const targetMap = id(20);
  const targetGraph = id(21);
  const leafMap = id(30);
  const leafGraph = id(31);
  const ordinaryId = id(40);
  const parentIds = Array.from({ length: openParents }, (_, index) => id(100 + index));
  const targetResourceIds = Array.from({ length: scale }, (_, index) => id(1_000 + index));
  const nestedParentId = id(900);
  const leafResourceId = id(901);
  const edges = targetResourceIds.flatMap((from, index) => {
    const next = targetResourceIds[index + 1];
    if (next === undefined) return [];
    const result = [{ from, to: next }];
    if (density === 'dense') {
      const second = targetResourceIds[index + 2];
      const fourth = targetResourceIds[index + 4];
      if (second !== undefined) result.push({ from, to: second });
      if (fourth !== undefined) result.push({ from, to: fourth });
    }
    return result;
  });
  const targetPositions: Record<UUID, ResourcePlacement> = {};
  targetResourceIds.forEach((resourceId, index) => {
    targetPositions[resourceId] = {
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
  const metaPositions: Record<UUID, ResourcePlacement> = {};
  metaPositions[ordinaryId] = { x: 20, y: 20, open: false };
  parentIds.forEach((resourceId, index) => {
    metaPositions[resourceId] = {
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
      defaultMap: leafMap,
      maps: [
        {
          id: leafMap,
          title: 'Leaf',
          kind: 'positioned',
          positions: { [leafResourceId]: { x: 24, y: 24, open: false } },
          graphs: [{ id: leafGraph, title: 'Leaf graph', edges: [] }],
          activeGraph: leafGraph,
        },
      ],
    },
    resources: [markdown(leafResourceId, 'Nested leaf Resource')],
  });
  const target = spaceSnapshotSchema.parse({
    id: targetId,
    document: {
      version: 1,
      title: `Benchmark target ${scale}`,
      defaultMap: targetMap,
      maps: [
        {
          id: targetMap,
          title: 'Embedded scale',
          kind: 'positioned',
          positions: targetPositions,
          graphs: [{ id: targetGraph, title: `${density} graph`, edges }],
          activeGraph: targetGraph,
        },
      ],
    },
    resources: [
      ...targetResourceIds.map((resourceId, index) =>
        markdown(resourceId, `Embedded ${index + 1}`),
      ),
      {
        id: nestedParentId,
        document: {
          title: 'Nested Space Resource',
          kind: 'space',
          spaceId: leafId,
          map: leafMap,
          graph: leafGraph,
        },
      },
    ],
  });
  const meta = spaceSnapshotSchema.parse({
    id: metaId,
    document: {
      version: 1,
      title: `Space Resource drag benchmark ${scale}`,
      defaultMap: metaMap,
      maps: [
        {
          id: metaMap,
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
    resources: [
      markdown(ordinaryId, 'Ordinary Markdown Resource'),
      ...parentIds.map((resourceId, index) => ({
        id: resourceId,
        document: {
          title: `Parent ${index + 1}`,
          kind: 'space' as const,
          spaceId: targetId,
          map: targetMap,
          graph: targetGraph,
        },
      })),
    ],
  });
  // Open Spaces retains the target and leaf canvases beside the visible Meta
  // canvas. Count those roots as mounted, while the visible count describes
  // only Meta and the embeddings it currently draws.
  const visibleResources = 1 + openParents + openParents * (scale + 2);
  const visibleEdges = Math.max(0, openParents - 1) + openParents * edges.length;
  const mountedResources = visibleResources + (scale + 2) + 1;
  const mountedEdges = visibleEdges + edges.length;
  return {
    name: `${scale}-${density}-${openParents}-parent${openParents === 1 ? '' : 's'}`,
    scale,
    density,
    openParents,
    aggregate: { metaSpaceId: metaId, spaces: [meta, target, leaf] },
    expected: {
      mountedResources,
      mountedEdges,
      visibleResources,
      visibleEdges,
    },
  };
}
