import {
  COLLAPSED_RESOURCE_SIZE,
  DEFAULT_OPEN_SIZE,
  spaceSnapshotSchema,
  uuidSchema,
  type PositionedMap,
  type ResourcePlacement,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';

/*
 * Deterministic aggregates and small Edits for the persistence cost harness
 * (`.scratch/code-quality/issues/17-measure-persistence-work-for-small-edits.md`).
 *
 * One edited Space holds `editedResources` Markdown Resources on one Map with
 * one chained Graph. `unrelatedSpaces` further ordinary Spaces, each holding
 * `unrelatedResources` Resources of the same workload, sit beside it. Meta holds
 * one Space Resource per ordinary Space, which is what makes each of them a
 * referenced — and therefore valid — member of the aggregate.
 */

export interface Workload {
  readonly editedResources: number;
  readonly unrelatedSpaces: number;
  readonly unrelatedResources: number;
  /** Characters in each Markdown Resource body. */
  readonly bodyLength: number;
}

export interface Scenario {
  readonly name: string;
  readonly workload: Workload;
  readonly metaSpaceId: UUID;
  readonly editedSpaceId: UUID;
  readonly unrelatedSpaceIds: readonly UUID[];
  readonly spaces: readonly SpaceSnapshot[];
}

const id = (value: number): UUID =>
  uuidSchema.parse(`17000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`);

const PARAGRAPH =
  'Graph-native presentations place Markdown Resources on a Map and connect them into Graphs. ';

const body = (title: string, length: number): string => {
  const heading = `# ${title}\n\n`;
  const text = PARAGRAPH.repeat(Math.ceil(length / PARAGRAPH.length) + 1);
  return `${heading}${text}`.slice(0, Math.max(length, heading.length));
};

const COLUMNS = 10;

/** One ordinary Space: `count` Markdown Resources in a grid, chained by one Graph. */
const ordinarySpace = (
  spaceNumber: number,
  title: string,
  count: number,
  bodyLength: number,
): SpaceSnapshot => {
  const base = spaceNumber * 100_000;
  const mapId = id(base + 1);
  const graphId = id(base + 2);
  const resourceIds = Array.from({ length: count }, (_, index) => id(base + 1_000 + index));
  const positions: Record<UUID, ResourcePlacement> = {};
  resourceIds.forEach((resourceId, index) => {
    positions[resourceId] = {
      x: (index % COLUMNS) * 340,
      y: Math.floor(index / COLUMNS) * 220,
      open: false,
    };
  });
  const edges = resourceIds.flatMap((from, index) => {
    const to = resourceIds[index + 1];
    return to === undefined ? [] : [{ from, to }];
  });
  return spaceSnapshotSchema.parse({
    id: id(base),
    document: {
      version: 1,
      title,
      defaultMap: mapId,
      maps: [
        {
          id: mapId,
          title: 'Map 1',
          kind: 'positioned',
          positions,
          graphs: [{ id: graphId, title: 'Graph 1', edges }],
          activeGraph: graphId,
        },
      ],
    },
    resources: resourceIds.map((resourceId, index) => ({
      id: resourceId,
      document: {
        title: `Resource ${index + 1}`,
        kind: 'markdown',
        body: body(`Resource ${index + 1}`, bodyLength),
      },
    })),
  });
};

const firstMap = (snapshot: SpaceSnapshot) => {
  const [map] = snapshot.document.maps ?? [];
  if (map?.kind !== 'positioned') throw new Error(`Space ${snapshot.id} has no positioned Map`);
  const [graph] = map.graphs;
  if (graph === undefined) throw new Error(`Space ${snapshot.id} has no Graph`);
  return { map, graph };
};

export const scenario = (workload: Workload): Scenario => {
  const edited = ordinarySpace(1, 'Edited Space', workload.editedResources, workload.bodyLength);
  const unrelated = Array.from({ length: workload.unrelatedSpaces }, (_, index) =>
    ordinarySpace(
      10 + index,
      `Unrelated Space ${index + 1}`,
      workload.unrelatedResources,
      workload.bodyLength,
    ),
  );
  const metaMapId = id(2);
  const metaGraphId = id(3);
  const referenced = [edited, ...unrelated];
  const spaceResourceIds = referenced.map((_, index) => id(100 + index));
  const positions: Record<UUID, ResourcePlacement> = {};
  spaceResourceIds.forEach((resourceId, index) => {
    positions[resourceId] = { x: index * 340, y: 0, open: false };
  });
  const meta = spaceSnapshotSchema.parse({
    id: id(1),
    document: {
      version: 1,
      title: 'Persistence cost Meta',
      defaultMap: metaMapId,
      maps: [
        {
          id: metaMapId,
          title: 'Map 1',
          kind: 'positioned',
          positions,
          graphs: [{ id: metaGraphId, title: 'Graph 1', edges: [] }],
          activeGraph: metaGraphId,
        },
      ],
    },
    resources: referenced.map((target, index) => {
      const { map, graph } = firstMap(target);
      return {
        id: spaceResourceIds[index],
        document: {
          title: target.document.title,
          kind: 'space',
          spaceId: target.id,
          map: map.id,
          graph: graph.id,
        },
      };
    }),
  });
  return {
    name: `N=${workload.editedResources} U=${workload.unrelatedSpaces}x${workload.unrelatedResources} body=${workload.bodyLength}`,
    workload,
    metaSpaceId: meta.id,
    editedSpaceId: edited.id,
    unrelatedSpaceIds: unrelated.map(({ id: spaceId }) => spaceId),
    spaces: [meta, ...referenced],
  };
};

export const EDIT_KINDS = [
  'rename',
  'body',
  'move',
  'open',
  'resize',
  'add-edge',
  'add-resource',
] as const;
export type EditKind = (typeof EDIT_KINDS)[number];

/** Which Resource sample `sample` edits, spread so repeated Edge additions never repeat. */
const subjectIndex = (snapshot: SpaceSnapshot, sample: number): number =>
  (sample * 3 + 1) % Math.max(1, snapshot.resources.length - 2);

const withPositions = (
  snapshot: SpaceSnapshot,
  update: (positions: PositionedMap['positions']) => PositionedMap['positions'],
): SpaceSnapshot => {
  const { map } = firstMap(snapshot);
  const next = { ...map, positions: update({ ...map.positions }) };
  return {
    ...snapshot,
    document: {
      ...snapshot.document,
      maps: (snapshot.document.maps ?? []).map((candidate) =>
        candidate.id === map.id ? next : candidate,
      ),
    },
  };
};

/**
 * Give the subject the Open Size `size` answers for its current size, moving
 * every other Resource by the growth on one axis (ADR 0084, ADR 0093): at or
 * past the subject's collapsed right edge takes the width, otherwise at or past
 * its collapsed bottom edge takes the height.
 */
const sizeTo = (
  snapshot: SpaceSnapshot,
  subjectId: UUID,
  size: (current: { readonly width: number; readonly height: number }) => {
    readonly width: number;
    readonly height: number;
  },
): SpaceSnapshot =>
  withPositions(snapshot, (positions) => {
    const placement = positions[subjectId];
    if (placement === undefined) throw new Error(`Resource ${subjectId} is not placed`);
    const current = placement.open ? placement.openSize : COLLAPSED_RESOURCE_SIZE;
    const openSize = size(current);
    const growth = {
      width: Math.max(0, openSize.width - current.width),
      height: Math.max(0, openSize.height - current.height),
    };
    const right = placement.x + COLLAPSED_RESOURCE_SIZE.width;
    const bottom = placement.y + COLLAPSED_RESOURCE_SIZE.height;
    const next: Record<UUID, ResourcePlacement> = {};
    for (const [resourceId, other] of Object.entries(positions)) {
      if (other === undefined) continue;
      const key = uuidSchema.parse(resourceId);
      if (key === subjectId) next[key] = { ...other, open: true, openSize };
      else if (other.x >= right) next[key] = { ...other, x: other.x + growth.width };
      else if (other.y >= bottom) next[key] = { ...other, y: other.y + growth.height };
      else next[key] = other;
    }
    return next;
  });

/**
 * The next snapshot one small Edit produces — the same kind of document change
 * Space Authoring's completion makes, not its exact derivation. `open` and
 * `resize` displace the other Resources (`sizeTo`), so each rewrites many
 * placements while staying one Map change; `add-resource` is the one Edit here
 * that changes the Space's Resource membership.
 */
export const applyEdit = (
  snapshot: SpaceSnapshot,
  kind: EditKind,
  sample: number,
): SpaceSnapshot => {
  const index = subjectIndex(snapshot, sample);
  const subject = snapshot.resources[index];
  if (subject === undefined) throw new Error(`Space ${snapshot.id} has no Resource ${index}`);
  switch (kind) {
    case 'rename':
    case 'body':
      return {
        ...snapshot,
        resources: snapshot.resources.map((resource) => {
          if (resource.id !== subject.id || resource.document.kind !== 'markdown') return resource;
          return kind === 'rename'
            ? { ...resource, document: { ...resource.document, title: `Renamed ${sample}` } }
            : {
                ...resource,
                document: {
                  ...resource.document,
                  body: `${resource.document.body}\n\nEdit ${sample}.`,
                },
              };
        }),
      };
    case 'move':
      return withPositions(snapshot, (positions) => {
        const placement = positions[subject.id];
        if (placement === undefined) throw new Error(`Resource ${subject.id} is not placed`);
        positions[subject.id] = { ...placement, x: placement.x + 40, y: placement.y + 20 };
        return positions;
      });
    case 'open':
      return sizeTo(snapshot, subject.id, () => DEFAULT_OPEN_SIZE);
    case 'resize':
      return sizeTo(snapshot, subject.id, (current) => ({
        width: current.width + 40,
        height: current.height + 20,
      }));
    case 'add-edge': {
      const to = snapshot.resources[index + 2];
      if (to === undefined) throw new Error(`Space ${snapshot.id} has no Resource ${index + 2}`);
      const { map, graph } = firstMap(snapshot);
      const nextMap = {
        ...map,
        graphs: map.graphs.map((candidate) =>
          candidate.id === graph.id
            ? { ...candidate, edges: [...candidate.edges, { from: subject.id, to: to.id }] }
            : candidate,
        ),
      };
      return {
        ...snapshot,
        document: {
          ...snapshot.document,
          maps: (snapshot.document.maps ?? []).map((candidate) =>
            candidate.id === map.id ? nextMap : candidate,
          ),
        },
      };
    }
    case 'add-resource': {
      const added = uuidSchema.parse(
        `17000000-0000-4000-9${sample.toString(16).padStart(3, '0')}-${snapshot.id.slice(-12)}`,
      );
      const withResource = withPositions(snapshot, (positions) => ({
        ...positions,
        [added]: { x: -400, y: sample * 220, open: false },
      }));
      return {
        ...withResource,
        resources: [
          ...withResource.resources,
          {
            id: added,
            document: { title: `Added ${sample}`, kind: 'markdown', body: `# Added ${sample}` },
          },
        ],
      };
    }
  }
};
