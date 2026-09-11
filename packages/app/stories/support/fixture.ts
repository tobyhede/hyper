import {
  uuidSchema,
  type Thing,
  type Graph,
  type Diagram,
  type SpaceFile,
  type UUID,
} from '@project/core';
import { loadSpace, serializeThingFile, type ThingFile, type Space } from '@project/graph';
import { GRAPH_PALETTE as PRODUCTION_GRAPH_PALETTE } from '#src/colors';

/**
 * The inventory's fixture: a small, believable Space, shaped to exercise the
 * cases the design has to survive rather than to tell a story.
 *
 * Six Things, two Graphs sharing two of them, one Alias, and one deliberately
 * long title.
 *
 * Real ids, parsed through `uuidSchema`, so this data is the same shape the
 * product's own components receive. A story that hands `GraphSelector` a
 * hand-rolled object proves nothing about `GraphSelector`.
 */

const id = (value: string): UUID => uuidSchema.parse(value);

export const thingIds = {
  opening: id('0b6f4a52-8f1e-4a7c-9f2d-1c4b5e6a7d80'),
  problem: id('1c7a5b63-9021-4b8d-8a3e-2d5c6f7b8e91'),
  strategies: id('2d8b6c74-a132-4c9e-9b4f-3e6d7a8c9f02'),
  traversal: id('3e9c7d85-b243-4daf-8c5a-4f7e8b9daf13'),
  openingAlias: id('4fad8e96-c354-4eb0-9d6b-5a8f9cae0b24'),
  closing: id('6bcfa0b8-e576-40d2-9f8d-7cabedca2d46'),
} as const;

export const graphIds = {
  long: id('7cd0b1c9-f687-41e3-8a9e-8dbcfedb3e57'),
  short: id('8de1c2da-0798-42f4-9baf-9ecdafec4f68'),
} as const;

export const diagramId = id('9ef2d3eb-18a9-4305-8cba-afdeb0fd5a79');
export const spaceId = id('a0f3e4fc-29ba-4416-9dcb-b0efc10e6b8a');

/** The application palette, reused rather than translated for the catalogue. */
export const GRAPH_PALETTE = PRODUCTION_GRAPH_PALETTE;

export const things: readonly Thing[] = [
  {
    id: thingIds.opening,
    kind: 'markdown',
    title: 'Opening',
    body: '# Opening\n\nWhere the traversal begins.',
  },
  {
    id: thingIds.problem,
    // The long title: three lines at 18px in a 260px thing, which is what
    // `text-wrap: balance` and the three-line clamp are there to survive.
    title: 'Why authored placement beats a layout engine that reshuffles on every edit',
    kind: 'markdown',
    body: '# Placement\n\nThree spike increments each reshuffled the existing things.',
  },
  {
    id: thingIds.strategies,
    title: 'Strategies',
    kind: 'markdown',
    body: '# Strategies\n\nNo strategy is privileged.',
  },
  {
    id: thingIds.traversal,
    title: 'Traversal',
    kind: 'markdown',
    body: '# Traversal\n\nPresenting is this canvas, closer in.',
  },
  {
    id: thingIds.openingAlias,
    title: 'Strategy overview',
    kind: 'alias',
    target: thingIds.strategies,
  },
  {
    id: thingIds.closing,
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
      { from: thingIds.opening, to: thingIds.problem },
      { from: thingIds.problem, to: thingIds.strategies },
      { from: thingIds.strategies, to: thingIds.traversal },
      { from: thingIds.traversal, to: thingIds.openingAlias },
    ],
  },
  {
    // Shares `opening` and `strategies` with the Long path, exercising the
    // production overview's overlapping Graph projection.
    id: graphIds.short,
    title: 'Short path',
    color: GRAPH_PALETTE[1],
    edges: [
      { from: thingIds.opening, to: thingIds.strategies },
      { from: thingIds.strategies, to: thingIds.closing },
    ],
  },
];

export const colorByGraphId = {
  [graphIds.long]: GRAPH_PALETTE[0],
  [graphIds.short]: GRAPH_PALETTE[1],
} as const;

/**
 * Where the static canvas draws each Thing. Authored, as placement always is —
 * these are hand-set so both Graphs read forward, left to right, which is the
 * only way two overlaid Graphs stay legible (the acyclic-union
 * limit). `closing` belongs to only the short Graph, so the design still has to
 * distinguish Things with different Graph membership.
 */
export const positions = {
  [thingIds.opening]: { x: 40, y: 170, open: false },
  [thingIds.problem]: { x: 380, y: 30, open: false },
  [thingIds.strategies]: { x: 720, y: 170, open: false },
  [thingIds.traversal]: { x: 1060, y: 30, open: false },
  [thingIds.openingAlias]: { x: 1400, y: 170, open: false },
  [thingIds.closing]: { x: 1060, y: 330, open: false },
} as const;

export const diagrams: readonly Diagram[] = [
  {
    id: diagramId,
    kind: 'positioned',
    title: 'Collection 1',
    positions: Object.fromEntries(
      things.map((thing) => [thing.id, positions[thing.id] ?? { x: 0, y: 0, open: false }]),
    ),
    graphs: [...graphs],
    activeGraph: graphIds.long,
  },
];

export const spaceTitle = 'Graph-native presentations';

const thingFiles: ThingFile[] = things.map((thing) => ({
  path: `things/${thing.id}.md`,
  text: serializeThingFile(thing),
}));

const spaceFile: SpaceFile = {
  version: 1,
  id: spaceId,
  title: spaceTitle,
  diagrams: [...diagrams],
};

const loaded = loadSpace(spaceFile, thingFiles);
if (!loaded.ok) {
  throw new Error(
    `Invalid surface-inventory fixture: ${loaded.errors.map(({ message }) => message).join('; ')}`,
  );
}

/** Validated production-domain input for every React Flow catalogue harness. */
export const space: Space = loaded.space;
