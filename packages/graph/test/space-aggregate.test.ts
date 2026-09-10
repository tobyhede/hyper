import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { loadSpaceAggregate, type SpaceAggregateError } from '../src/index';

const uuid = (value: string): UUID => uuidSchema.parse(value);
const META = uuid('00000000-0000-4000-8000-000000000101');
const CHILD = uuid('00000000-0000-4000-8000-000000000102');
const OTHER = uuid('00000000-0000-4000-8000-000000000103');
const META_CARD = uuid('00000000-0000-4000-8000-000000000201');
const SECOND_META_CARD = uuid('00000000-0000-4000-8000-000000000202');
const CHILD_CARD = uuid('00000000-0000-4000-8000-000000000203');
const DIAGRAM = uuid('00000000-0000-4000-8000-000000000301');
const SECOND_DIAGRAM = uuid('00000000-0000-4000-8000-000000000302');
const GRAPH = uuid('00000000-0000-4000-8000-000000000401');
const SECOND_GRAPH = uuid('00000000-0000-4000-8000-000000000402');

type StoredCard = SpaceSnapshot['cards'][number];

const markdown = (id: UUID, title = id): StoredCard => ({
  id,
  document: { title, kind: 'markdown', body: '' },
});

const spaceCard = (
  id: UUID,
  target: UUID,
  selection: { readonly diagram?: UUID; readonly graph?: UUID } = {},
): StoredCard => ({
  id,
  document: { title: id, kind: 'space', spaceId: target, ...selection },
});

const snapshot = (
  id: UUID,
  cards: readonly StoredCard[],
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
                  cards.map(({ id: cardId }, index) => [
                    cardId,
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
                  cards.map(({ id: cardId }, index) => [
                    cardId,
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
    cards,
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
        snapshots: [snapshot(META, []), { id: CHILD, document: { version: 1 }, cards: [] }],
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
            spaceCard(META_CARD, CHILD, { diagram: DIAGRAM, graph: GRAPH }),
            spaceCard(SECOND_META_CARD, CHILD),
          ],
          { diagram: true },
        ),
        snapshot(CHILD, [markdown(CHILD_CARD)], { diagram: true }),
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

  it('refuses duplicate Card ids across Spaces while allowing Diagram and Graph id reuse', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceCard(META_CARD, CHILD), markdown(CHILD_CARD)], { diagram: true }),
          snapshot(CHILD, [markdown(CHILD_CARD)], { diagram: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      { kind: 'duplicate-card-id', cardId: CHILD_CARD, spaceIds: [META, CHILD] },
    ]);
  });

  it('refuses an aggregate without its configured Meta Space', () => {
    const errors = errorsOf(
      loadSpaceAggregate({ metaSpaceId: META, snapshots: [snapshot(CHILD, [])] }),
    );

    expect(errors).toEqual([{ kind: 'meta-space-missing', metaSpaceId: META }]);
  });

  it('locates a Space Card whose target is absent', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [snapshot(META, [spaceCard(META_CARD, CHILD)])],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-card-target-missing',
        spaceId: META,
        cardId: META_CARD,
        targetSpaceId: CHILD,
      },
    ]);
  });

  it('refuses a multi-Space reference cycle at the closing Card', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceCard(META_CARD, CHILD)]),
          snapshot(CHILD, [spaceCard(CHILD_CARD, META)]),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-card-reference-cycle',
        spaceId: CHILD,
        cardId: CHILD_CARD,
        targetSpaceId: META,
      },
    ]);
  });

  it('refuses every ordinary Space with no inbound Space Card', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [snapshot(META, []), snapshot(CHILD, [markdown(CHILD_CARD)])],
      }),
    );

    expect(errors).toEqual([{ kind: 'ordinary-space-unreferenced', spaceId: CHILD }]);
  });

  it('locates an explicit Diagram that the target does not supply', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceCard(META_CARD, CHILD, { diagram: OTHER })]),
          snapshot(CHILD, [markdown(CHILD_CARD)], { diagram: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-card-diagram-missing',
        spaceId: META,
        cardId: META_CARD,
        targetSpaceId: CHILD,
        diagramId: OTHER,
      },
    ]);
  });

  it('cannot report a missing Diagram without naming the Diagram it looked for', () => {
    type DiagramMissing = Extract<
      SpaceAggregateError,
      { readonly kind: 'space-card-diagram-missing' }
    >;
    // The only producer resolves `card.diagram ?? target.defaultDiagram` and
    // continues when that is absent, so the refusal always names a Diagram.
    expectTypeOf<DiagramMissing['diagramId']>().toEqualTypeOf<UUID>();
  });

  it('locates an explicit Graph that the target does not hold', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceCard(META_CARD, CHILD, { graph: OTHER })]),
          snapshot(CHILD, [markdown(CHILD_CARD)], { diagram: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-card-graph-missing',
        spaceId: META,
        cardId: META_CARD,
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
        snapshot(META, [spaceCard(META_CARD, CHILD, selection)]),
        snapshot(CHILD, [markdown(CHILD_CARD)], target),
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('refuses a Graph outside the explicit Diagram', () => {
    const errors = errorsOf(
      loadSpaceAggregate({
        metaSpaceId: META,
        snapshots: [
          snapshot(META, [spaceCard(META_CARD, CHILD, { diagram: DIAGRAM, graph: SECOND_GRAPH })]),
          snapshot(CHILD, [markdown(CHILD_CARD)], { diagram: true, secondDiagram: true }),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-card-graph-outside-diagram',
        spaceId: META,
        cardId: META_CARD,
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
          snapshot(META, [spaceCard(META_CARD, CHILD, { graph: GRAPH })]),
          snapshot(CHILD, [markdown(CHILD_CARD)], {
            diagram: true,
            secondDiagram: true,
            defaultDiagram: SECOND_DIAGRAM,
          }),
        ],
      }),
    );

    expect(errors).toEqual([
      {
        kind: 'space-card-graph-outside-diagram',
        spaceId: META,
        cardId: META_CARD,
        targetSpaceId: CHILD,
        diagramId: SECOND_DIAGRAM,
        graphId: GRAPH,
      },
    ]);
  });
});
