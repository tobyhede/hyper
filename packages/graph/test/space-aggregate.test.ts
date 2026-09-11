import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { loadSpaceAggregate, type SpaceAggregateError } from '../src/index';

const uuid = (value: string): UUID => uuidSchema.parse(value);
const META = uuid('00000000-0000-4000-8000-000000000101');
const CHILD = uuid('00000000-0000-4000-8000-000000000102');
const OTHER = uuid('00000000-0000-4000-8000-000000000103');
const META_THING = uuid('00000000-0000-4000-8000-000000000201');
const SECOND_META_THING = uuid('00000000-0000-4000-8000-000000000202');
const CHILD_THING = uuid('00000000-0000-4000-8000-000000000203');
const DIAGRAM = uuid('00000000-0000-4000-8000-000000000301');
const SECOND_DIAGRAM = uuid('00000000-0000-4000-8000-000000000302');
const GRAPH = uuid('00000000-0000-4000-8000-000000000401');
const SECOND_GRAPH = uuid('00000000-0000-4000-8000-000000000402');

type StoredThing = SpaceSnapshot['things'][number];

const markdown = (id: UUID, title = id): StoredThing => ({
  id,
  document: { title, kind: 'markdown', body: '' },
});

const spaceThing = (
  id: UUID,
  target: UUID,
  selection: { readonly diagram?: UUID; readonly graph?: UUID } = {},
): StoredThing => ({
  id,
  document: { title: id, kind: 'space', spaceId: target, ...selection },
});

const snapshot = (
  id: UUID,
  things: readonly StoredThing[],
  options: {
    readonly diagram?: boolean;
    readonly secondDiagram?: boolean;
    readonly defaultDiagram?: UUID;
  } = {},
): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id,
    document: {
      version: 1,
      title: id,
      defaultDiagram: options.defaultDiagram,
      diagrams: [
        ...(options.diagram === true
          ? [
              {
                id: DIAGRAM,
                title: 'Diagram',
                kind: 'positioned',
                positions: Object.fromEntries(
                  things.map(({ id: thingId }, index) => [
                    thingId,
                    { x: index * 100, y: 0, open: false },
                  ]),
                ),
                graphs: [{ id: GRAPH, title: 'Graph', edges: [] }],
                activeGraph: GRAPH,
              },
            ]
          : []),
        ...(options.secondDiagram === true
          ? [
              {
                id: SECOND_DIAGRAM,
                title: 'Second Diagram',
                kind: 'positioned' as const,
                positions: Object.fromEntries(
                  things.map(({ id: thingId }, index) => [
                    thingId,
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
    things,
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
        snapshots: [snapshot(META, []), { id: CHILD, document: { version: 1 }, things: [] }],
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
            spaceThing(META_THING, CHILD, { diagram: DIAGRAM, graph: GRAPH }),
            spaceThing(SECOND_META_THING, CHILD),
          ],
          { diagram: true },
        ),
        snapshot(CHILD, [markdown(CHILD_THING)], { diagram: true }),
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

  it('refuses duplicate Thing ids across Spaces while allowing Diagram and Graph id reuse', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceThing(META_THING, CHILD), markdown(CHILD_THING)], { diagram: true }),
          snapshot(CHILD, [markdown(CHILD_THING)], { diagram: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      { kind: 'duplicate-thing-id', thingId: CHILD_THING, spaceIds: [META, CHILD] },
    ]);
  });

  it('refuses an aggregate without its configured Meta Space', () => {
    const errors = errorsOf(
      loadSpaceAggregate({ metaSpaceId: META, snapshots: [snapshot(CHILD, [])] }),
    );

    expect(errors).toEqual([{ kind: 'meta-space-missing', metaSpaceId: META }]);
  });

  it('locates a Space Thing whose target is absent', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [snapshot(META, [spaceThing(META_THING, CHILD)])],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-thing-target-missing',
        spaceId: META,
        thingId: META_THING,
        targetSpaceId: CHILD,
      },
    ]);
  });

  it('refuses a multi-Space reference cycle at the closing Thing', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceThing(META_THING, CHILD)]),
          snapshot(CHILD, [spaceThing(CHILD_THING, META)]),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-thing-reference-cycle',
        spaceId: CHILD,
        thingId: CHILD_THING,
        targetSpaceId: META,
      },
    ]);
  });

  it('refuses every ordinary Space with no inbound Space Thing', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [snapshot(META, []), snapshot(CHILD, [markdown(CHILD_THING)])],
      }),
    );

    expect(errors).toEqual([{ kind: 'ordinary-space-unreferenced', spaceId: CHILD }]);
  });

  it('locates an explicit Diagram that the target does not supply', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceThing(META_THING, CHILD, { diagram: OTHER })]),
          snapshot(CHILD, [markdown(CHILD_THING)], { diagram: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-thing-diagram-missing',
        spaceId: META,
        thingId: META_THING,
        targetSpaceId: CHILD,
        diagramId: OTHER,
      },
    ]);
  });

  it('cannot report a missing Diagram without naming the Diagram it looked for', () => {
    type DiagramMissing = Extract<
      SpaceAggregateError,
      { readonly kind: 'space-thing-diagram-missing' }
    >;
    // The only producer resolves `thing.diagram ?? target.defaultDiagram` and
    // continues when that is absent, so the refusal always names a Diagram.
    expectTypeOf<DiagramMissing['diagramId']>().toEqualTypeOf<UUID>();
  });

  it('locates an explicit Graph that the target does not hold', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceThing(META_THING, CHILD, { graph: OTHER })]),
          snapshot(CHILD, [markdown(CHILD_THING)], { diagram: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-thing-graph-missing',
        spaceId: META,
        thingId: META_THING,
        targetSpaceId: CHILD,
        graphId: OTHER,
      },
    ]);
  });

  it.each([
    {
      name: 'an explicit authored Diagram',
      selection: { diagram: DIAGRAM },
      target: { diagram: true },
    },
    {
      name: 'a Graph with the target Diagram fallback',
      selection: { graph: GRAPH },
      target: { diagram: true },
    },
    {
      name: 'no selections when the target has no Graph',
      selection: {},
      target: {},
    },
  ])('accepts $name', ({ selection, target }) => {
    const result = loadSpaceAggregate({
      metaSpaceId: META,
      snapshots: [
        snapshot(META, [spaceThing(META_THING, CHILD, selection)]),
        snapshot(CHILD, [markdown(CHILD_THING)], target),
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('refuses a Graph outside the explicit Diagram', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [
            spaceThing(META_THING, CHILD, { diagram: DIAGRAM, graph: SECOND_GRAPH }),
          ]),
          snapshot(CHILD, [markdown(CHILD_THING)], { diagram: true, secondDiagram: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-thing-graph-outside-diagram',
        spaceId: META,
        thingId: META_THING,
        targetSpaceId: CHILD,
        diagramId: DIAGRAM,
        graphId: SECOND_GRAPH,
      },
    ]);
  });

  it('uses the target default Diagram when only the Graph is explicit', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceThing(META_THING, CHILD, { graph: GRAPH })]),
          snapshot(CHILD, [markdown(CHILD_THING)], {
            diagram: true,
            secondDiagram: true,
            defaultDiagram: SECOND_DIAGRAM,
          }),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-thing-graph-outside-diagram',
        spaceId: META,
        thingId: META_THING,
        targetSpaceId: CHILD,
        diagramId: SECOND_DIAGRAM,
        graphId: GRAPH,
      },
    ]);
  });
});
