import {
  uuidSchema,
  type Resource,
  type Graph,
  type Map,
  type SpaceFile,
  type UUID,
} from '@project/core';
import {
  GRAPH_PALETTE as PRODUCTION_GRAPH_PALETTE,
  GRAPH_PALETTE_ENTRIES as PRODUCTION_GRAPH_PALETTE_ENTRIES,
  loadSpace,
  serializeResourceFile,
  type ResourceFile,
  type Space,
} from '@project/graph';

/**
 * The inventory's fixture: a small, believable Space, shaped to exercise the
 * cases the design has to survive rather than to tell a story.
 *
 * Six Resources, two Graphs sharing two of them, one Reference Resource, and one deliberately
 * long title.
 *
 * Real ids, parsed through `uuidSchema`, so this data is the same shape the
 * product's own components receive. A story that hands `GraphSelector` a
 * hand-rolled object proves nothing about `GraphSelector`.
 */

const id = (value: string): UUID => uuidSchema.parse(value);

export const resourceIds = {
  opening: id('0b6f4a52-8f1e-4a7c-9f2d-1c4b5e6a7d80'),
  problem: id('1c7a5b63-9021-4b8d-8a3e-2d5c6f7b8e91'),
  strategies: id('2d8b6c74-a132-4c9e-9b4f-3e6d7a8c9f02'),
  traversal: id('3e9c7d85-b243-4daf-8c5a-4f7e8b9daf13'),
  openingReference: id('4fad8e96-c354-4eb0-9d6b-5a8f9cae0b24'),
  closing: id('6bcfa0b8-e576-40d2-9f8d-7cabedca2d46'),
} as const;

export const graphIds = {
  long: id('7cd0b1c9-f687-41e3-8a9e-8dbcfedb3e57'),
  short: id('8de1c2da-0798-42f4-9baf-9ecdafec4f68'),
} as const;

export const mapId = id('9ef2d3eb-18a9-4305-8cba-afdeb0fd5a79');
export const spaceId = id('a0f3e4fc-29ba-4416-9dcb-b0efc10e6b8a');

/** The application palette, reused rather than translated for the catalogue. */
export const GRAPH_PALETTE = PRODUCTION_GRAPH_PALETTE;
export const GRAPH_PALETTE_ENTRIES = PRODUCTION_GRAPH_PALETTE_ENTRIES;

export const resources: readonly Resource[] = [
  {
    id: resourceIds.opening,
    kind: 'markdown',
    title: 'Opening',
    body: '# Opening\n\nWhere the traversal begins.',
  },
  {
    id: resourceIds.problem,
    // The long title: three lines at 18px in a 260px resource, which is what
    // `text-wrap: balance` and the three-line clamp are there to survive.
    title: 'Why authored placement beats a layout engine that reshuffles on every edit',
    kind: 'markdown',
    body: '# Placement\n\nThree spike increments each reshuffled the existing resources.',
  },
  {
    id: resourceIds.strategies,
    title: 'Strategies',
    kind: 'markdown',
    body: '# Strategies\n\nNo strategy is privileged.',
  },
  {
    id: resourceIds.traversal,
    title: 'Traversal',
    kind: 'markdown',
    body: '# Traversal\n\nPresenting is this canvas, closer in.',
  },
  {
    id: resourceIds.openingReference,
    title: 'Strategy overview',
    kind: 'reference',
    target: resourceIds.strategies,
  },
  {
    id: resourceIds.closing,
    title: 'Closing',
    kind: 'markdown',
    body: '# Closing\n',
  },
];

export const graphs: readonly Graph[] = [
  {
    id: graphIds.long,
    title: 'Long path',
    color: GRAPH_PALETTE[0],
    edges: [
      { from: resourceIds.opening, to: resourceIds.problem },
      { from: resourceIds.problem, to: resourceIds.strategies },
      { from: resourceIds.strategies, to: resourceIds.traversal },
      { from: resourceIds.traversal, to: resourceIds.openingReference },
    ],
  },
  {
    // Shares `opening` and `strategies` with the Long path, exercising the
    // production overview's overlapping Graph projection.
    id: graphIds.short,
    title: 'Short path',
    color: GRAPH_PALETTE[1],
    edges: [
      { from: resourceIds.opening, to: resourceIds.strategies },
      { from: resourceIds.strategies, to: resourceIds.closing },
    ],
  },
];

export const colorByGraphId = {
  [graphIds.long]: GRAPH_PALETTE[0],
  [graphIds.short]: GRAPH_PALETTE[1],
} as const;

/**
 * Where the static canvas draws each Resource. Authored, as placement always is —
 * these are hand-set so both Graphs read forward, left to right, which is the
 * only way two overlaid Graphs stay legible (the acyclic-union
 * limit). `closing` belongs to only the short Graph, so the design still has to
 * distinguish Resources with different Graph membership.
 */
export const positions = {
  [resourceIds.opening]: { x: 40, y: 170, open: false },
  [resourceIds.problem]: { x: 380, y: 30, open: false },
  [resourceIds.strategies]: { x: 720, y: 170, open: false },
  [resourceIds.traversal]: { x: 1060, y: 30, open: false },
  [resourceIds.openingReference]: { x: 1400, y: 170, open: false },
  [resourceIds.closing]: { x: 1060, y: 330, open: false },
} as const;

export const maps: readonly Map[] = [
  {
    id: mapId,
    kind: 'positioned',
    title: 'Collection 1',
    positions: Object.fromEntries(
      resources.map((resource) => [
        resource.id,
        positions[resource.id] ?? { x: 0, y: 0, open: false },
      ]),
    ),
    graphs: [...graphs],
    activeGraph: graphIds.long,
  },
];

export const spaceTitle = 'Graph-native presentations';

const resourceFiles: ResourceFile[] = resources.map((resource) => ({
  path: `resources/${resource.id}.md`,
  text: serializeResourceFile(resource),
}));

const spaceFile: SpaceFile = {
  version: 1,
  id: spaceId,
  title: spaceTitle,
  maps: [...maps],
};

const loaded = loadSpace(spaceFile, resourceFiles);
if (!loaded.ok) {
  throw new Error(
    `Invalid surface-inventory fixture: ${loaded.errors.map(({ message }) => message).join('; ')}`,
  );
}

/** Validated production-domain input for every React Flow catalogue harness. */
export const space: Space = loaded.space;
