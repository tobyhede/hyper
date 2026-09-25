import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { loadSpaceAggregate, type SpaceAggregateError } from '../src/index';

const uuid = (value: string): UUID => uuidSchema.parse(value);
const META = uuid('00000000-0000-4000-8000-000000000101');
const CHILD = uuid('00000000-0000-4000-8000-000000000102');
const OTHER = uuid('00000000-0000-4000-8000-000000000103');
const META_RESOURCE = uuid('00000000-0000-4000-8000-000000000201');
const SECOND_META_RESOURCE = uuid('00000000-0000-4000-8000-000000000202');
const CHILD_RESOURCE = uuid('00000000-0000-4000-8000-000000000203');
const MAP = uuid('00000000-0000-4000-8000-000000000301');
const SECOND_MAP = uuid('00000000-0000-4000-8000-000000000302');
const GRAPH = uuid('00000000-0000-4000-8000-000000000401');
const SECOND_GRAPH = uuid('00000000-0000-4000-8000-000000000402');

type StoredResource = SpaceSnapshot['resources'][number];

const markdown = (id: UUID, title = id): StoredResource => ({
  id,
  document: { title, kind: 'markdown', body: '' },
});

/**
 * A Space Resource always carries a selection, so this helper always takes one
 * (ADR 0079). What the aggregate then decides is whether the pair *resolves* in
 * the target — an id naming nothing there is a dangling reference to something
 * deleted, which is what every refusal below is about.
 */
const spaceResource = (
  id: UUID,
  target: UUID,
  selection: { readonly map: UUID; readonly graph: UUID },
): StoredResource => ({
  id,
  document: { title: id, kind: 'space', spaceId: target, ...selection },
});

/** The selection every Space Resource whose target was built with `map: true` names. */
const SELECTS_FIRST = { map: MAP, graph: GRAPH } as const;

const snapshot = (
  id: UUID,
  resources: readonly StoredResource[],
  options: {
    readonly map?: boolean;
    readonly secondMap?: boolean;
  } = {},
): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id,
    document: {
      version: 1,
      title: id,
      maps: [
        ...(options.map === true
          ? [
              {
                id: MAP,
                title: 'Map',
                kind: 'positioned',
                positions: Object.fromEntries(
                  resources.map(({ id: resourceId }, index) => [
                    resourceId,
                    { x: index * 100, y: 0, open: false },
                  ]),
                ),
                graphs: [{ id: GRAPH, title: 'Graph', edges: [] }],
                activeGraph: GRAPH,
              },
            ]
          : []),
        ...(options.secondMap === true
          ? [
              {
                id: SECOND_MAP,
                title: 'Second Map',
                kind: 'positioned' as const,
                positions: Object.fromEntries(
                  resources.map(({ id: resourceId }, index) => [
                    resourceId,
                    { x: index * 100, y: 100, open: false },
                  ]),
                ),
                graphs: [{ id: SECOND_GRAPH, title: 'Second Graph', edges: [] }],
                activeGraph: SECOND_GRAPH,
              },
            ]
          : []),
      ],
    },
    resources,
  });

const errorsOf = (result: ReturnType<typeof loadSpaceAggregate>) => {
  if (result.ok) throw new Error('expected aggregate intake to fail');
  return result.errors;
};

describe('loadSpaceAggregate', () => {
  it('locates an invalid snapshot at its aggregate position', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [snapshot(META, []), { id: CHILD, document: { version: 1 }, resources: [] }],
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ kind: 'invalid-space-snapshot', snapshotIndex: 1 });
  });

  it('loads and indexes a complete Meta-rooted aggregate with convergence and scoped ids', () => {
    const result = loadSpaceAggregate({
      metaSpaceId: META,
      snapshots: [
        snapshot(
          META,
          [
            spaceResource(META_RESOURCE, CHILD, SELECTS_FIRST),
            spaceResource(SECOND_META_RESOURCE, CHILD, SELECTS_FIRST),
          ],
          { map: true },
        ),
        snapshot(CHILD, [markdown(CHILD_RESOURCE)], { map: true }),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.aggregate.metaSpaceId).toBe(META);
    expect(result.aggregate.lookup.space(CHILD)?.id).toBe(CHILD);
    expect(result.aggregate.spaces).toHaveLength(2);
  });

  it('refuses duplicate Space ids with every snapshot location', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [snapshot(META, []), snapshot(META, [])],
      }),
    );

    expect(errors).toEqual([
      { kind: 'duplicate-space-id', spaceId: META, snapshotIndexes: [0, 1] },
    ]);
  });

  it('refuses duplicate Resource ids across Spaces while allowing Map and Graph id reuse', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(
            META,
            [spaceResource(META_RESOURCE, CHILD, SELECTS_FIRST), markdown(CHILD_RESOURCE)],
            {
              map: true,
            },
          ),
          snapshot(CHILD, [markdown(CHILD_RESOURCE)], { map: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      { kind: 'duplicate-resource-id', resourceId: CHILD_RESOURCE, spaceIds: [META, CHILD] },
    ]);
  });

  it('refuses an aggregate without its configured Meta Space', () => {
    const errors = errorsOf(
      loadSpaceAggregate({ metaSpaceId: META, snapshots: [snapshot(CHILD, [])] }),
    );

    expect(errors).toEqual([{ kind: 'meta-space-missing', metaSpaceId: META }]);
  });

  it('locates a Space Resource whose target is absent', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [snapshot(META, [spaceResource(META_RESOURCE, CHILD, SELECTS_FIRST)])],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-resource-target-missing',
        spaceId: META,
        resourceId: META_RESOURCE,
        targetSpaceId: CHILD,
      },
    ]);
  });

  it('refuses a multi-Space reference cycle at the closing Resource', () => {
    // Both Spaces supply the Map and Graph their inbound Space Resource names,
    // because a dangling selection is reported before the walk that finds a
    // cycle ever runs. A cycle between two Spaces neither of which could be
    // opened would be refused for the selection and never reach this rule.
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceResource(META_RESOURCE, CHILD, SELECTS_FIRST)], { map: true }),
          snapshot(CHILD, [spaceResource(CHILD_RESOURCE, META, SELECTS_FIRST)], { map: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-resource-reference-cycle',
        spaceId: CHILD,
        resourceId: CHILD_RESOURCE,
        targetSpaceId: META,
      },
    ]);
  });

  it('refuses every ordinary Space with no inbound Space Resource', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [snapshot(META, []), snapshot(CHILD, [markdown(CHILD_RESOURCE)])],
      }),
    );

    expect(errors).toEqual([{ kind: 'ordinary-space-unreferenced', spaceId: CHILD }]);
  });

  it('locates an explicit Map that the target does not supply', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceResource(META_RESOURCE, CHILD, { map: OTHER, graph: GRAPH })]),
          snapshot(CHILD, [markdown(CHILD_RESOURCE)], { map: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-resource-map-missing',
        spaceId: META,
        resourceId: META_RESOURCE,
        targetSpaceId: CHILD,
        mapId: OTHER,
      },
    ]);
  });

  it('cannot report a missing Map without naming the Map it looked for', () => {
    type MapMissing = Extract<SpaceAggregateError, { readonly kind: 'space-resource-map-missing' }>;
    // The only producer reads the Resource's own `map`, which every Space
    // Resource carries (ADR 0079), so the refusal always names the Map it
    // looked for. Nothing falls back to the target's own opening selection,
    // so there is no arm in which the refusal has nothing to name.
    expectTypeOf<MapMissing['mapId']>().toEqualTypeOf<UUID>();
  });

  it('locates an explicit Graph that the target does not hold', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceResource(META_RESOURCE, CHILD, { map: MAP, graph: OTHER })]),
          snapshot(CHILD, [markdown(CHILD_RESOURCE)], { map: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-resource-graph-missing',
        spaceId: META,
        resourceId: META_RESOURCE,
        targetSpaceId: CHILD,
        graphId: OTHER,
      },
    ]);
  });

  it('accepts a Space Resource naming a Map of its target and a Graph that Map owns', () => {
    const result = loadSpaceAggregate({
      metaSpaceId: META,
      snapshots: [
        snapshot(META, [spaceResource(META_RESOURCE, CHILD, SELECTS_FIRST)]),
        snapshot(CHILD, [markdown(CHILD_RESOURCE)], { map: true }),
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('refuses a Graph outside the explicit Map', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceResource(META_RESOURCE, CHILD, { map: MAP, graph: SECOND_GRAPH })]),
          snapshot(CHILD, [markdown(CHILD_RESOURCE)], { map: true, secondMap: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-resource-graph-outside-map',
        spaceId: META,
        resourceId: META_RESOURCE,
        targetSpaceId: CHILD,
        mapId: MAP,
        graphId: SECOND_GRAPH,
      },
    ]);
  });

  it('lets two Space Resources converge on one target while each selects its own Map', () => {
    const result = loadSpaceAggregate({
      metaSpaceId: META,
      snapshots: [
        snapshot(
          META,
          [
            spaceResource(META_RESOURCE, CHILD, SELECTS_FIRST),
            spaceResource(SECOND_META_RESOURCE, CHILD, { map: SECOND_MAP, graph: SECOND_GRAPH }),
          ],
          { map: true },
        ),
        snapshot(CHILD, [markdown(CHILD_RESOURCE)], { map: true, secondMap: true }),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = result.aggregate.lookup.space(META);
    expect(meta?.lookup.resource(META_RESOURCE)).toMatchObject({
      kind: 'space',
      map: MAP,
      graph: GRAPH,
    });
    expect(meta?.lookup.resource(SECOND_META_RESOURCE)).toMatchObject({
      kind: 'space',
      map: SECOND_MAP,
      graph: SECOND_GRAPH,
    });
  });
});
