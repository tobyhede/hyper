import { describe, expect, it } from 'vitest';
import { importSpaceFileSchema, importSpaceSchema, spaceSnapshotSchema } from '../src/index';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const CARD_A = '00000000-0000-4000-8000-000000000002';
const CARD_B = '00000000-0000-4000-8000-000000000003';
const GRAPH_ID = '00000000-0000-4000-8000-000000000004';
const DIAGRAM_ID = '00000000-0000-4000-8000-000000000005';

const identified = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Test space',
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Working',
        kind: 'positioned' as const,
        positions: {
          [CARD_A]: { x: 0, y: 0, open: false },
          [CARD_B]: { x: 320, y: 0, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] }],
      },
    ],
    defaultDiagram: DIAGRAM_ID,
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown' as const, body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown' as const, body: 'B' } },
  ],
};

/** The one diagram, and the one graph it owns. */
const diagram = identified.document.diagrams[0]!;
const graph = diagram.graphs[0]!;

/** The same aggregate with its one diagram replaced. */
const withDiagram = (next: unknown) => ({
  ...identified,
  document: { ...identified.document, diagrams: [next] },
});

describe('import space schema', () => {
  it('keeps references UUID-only when import entity ids are absent', () => {
    const parsed = importSpaceFileSchema.parse({
      version: 1,
      title: 'Import input',
      diagrams: [
        {
          title: 'Generated diagram',
          positions: { [CARD_A]: { x: 0, y: 0, open: false } },
          graphs: [{ title: 'Generated graph', edges: [{ from: CARD_A, to: CARD_B }] }],
        },
      ],
    });

    expect(parsed.id).toBeUndefined();
    expect(parsed.diagrams?.[0]?.id).toBeUndefined();
    expect(parsed.diagrams?.[0]?.graphs[0]?.id).toBeUndefined();
    expect(
      importSpaceFileSchema.safeParse({
        ...parsed,
        diagrams: [
          {
            ...parsed.diagrams?.[0],
            graphs: [{ title: 'Generated graph', edges: [{ from: 'card-a', to: CARD_B }] }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('allows only entity ids to be absent before identity resolution', () => {
    const input = {
      document: {
        ...identified.document,
        diagrams: [
          {
            title: 'Working',
            positions: { [CARD_A]: { x: 0, y: 0, open: false } },
            graphs: [{ ...graph, id: undefined }],
          },
        ],
      },
      cards: [...identified.cards, { document: { title: 'New', kind: 'markdown', body: '' } }],
    };

    const parsed = importSpaceSchema.parse(input);
    expect(parsed.document.diagrams?.[0]?.kind).toBe('positioned');
    expect(parsed.id).toBeUndefined();
    expect(parsed.document.diagrams?.[0]?.id).toBeUndefined();
    expect(parsed.document.diagrams?.[0]?.graphs[0]?.id).toBeUndefined();
    expect(parsed.cards.at(-1)?.id).toBeUndefined();
  });

  /**
   * The import shape relaxes identity and nothing else. Ownership is not
   * relaxed: a diagram that names graph *ids* — the version 2 filter, which
   * shares this key — cannot enter through the CLI what the space file rejects,
   * and neither can one owning none.
   */
  it('rejects an imported diagram whose graphs are ids rather than owned values', () => {
    expect(
      importSpaceSchema.safeParse(withDiagram({ ...diagram, graphs: [GRAPH_ID] })).success,
    ).toBe(false);
  });

  it('rejects an imported diagram that owns no graphs', () => {
    expect(importSpaceSchema.safeParse(withDiagram({ ...diagram, graphs: [] })).success).toBe(
      false,
    );
  });

  it('rejects a version 2 document, whose graphs sat beside its diagrams', () => {
    expect(
      importSpaceSchema.safeParse({
        ...identified,
        document: { ...identified.document, version: 2 },
      }).success,
    ).toBe(false);
  });

  it('rejects a non-UUID whenever an import entity id is explicit', () => {
    for (const input of [
      { ...identified, id: 'space' },
      withDiagram({ ...diagram, graphs: [{ ...graph, id: 'main' }] }),
      withDiagram({ ...diagram, id: 'working' }),
      { ...identified, cards: [{ ...identified.cards[0], id: 'a' }] },
    ]) {
      expect(importSpaceSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe('space snapshot schema', () => {
  it('requires every entity to be fully identified', () => {
    expect(spaceSnapshotSchema.parse(identified)).toEqual(identified);
    expect(spaceSnapshotSchema.safeParse({ ...identified, id: undefined }).success).toBe(false);
    expect(
      spaceSnapshotSchema.safeParse(
        withDiagram({ ...diagram, graphs: [{ ...graph, id: undefined }] }),
      ).success,
    ).toBe(false);
    expect(spaceSnapshotSchema.safeParse(withDiagram({ ...diagram, id: undefined })).success).toBe(
      false,
    );
    expect(
      spaceSnapshotSchema.safeParse({
        ...identified,
        cards: [{ ...identified.cards[0], id: undefined }],
      }).success,
    ).toBe(false);
  });
});
