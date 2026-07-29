import { describe, expect, it } from 'vitest';
import { importSpaceFileSchema, importSpaceSchema, spaceSnapshotSchema } from '../src/index';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const CARD_A = '00000000-0000-4000-8000-000000000002';
const CARD_B = '00000000-0000-4000-8000-000000000003';
const ROUTE_ID = '00000000-0000-4000-8000-000000000004';
const LAYOUT_ID = '00000000-0000-4000-8000-000000000005';

const identified = {
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Test space',
    routes: [{ id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] }],
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Working',
        kind: 'positioned' as const,
        positions: { [CARD_A]: { x: 0, y: 0 } },
      },
    ],
    defaultView: LAYOUT_ID,
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown' as const, body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown' as const, body: 'B' } },
  ],
};

describe('import space schema', () => {
  it('keeps references UUID-only when import entity ids are absent', () => {
    const parsed = importSpaceFileSchema.parse({
      version: 2,
      title: 'Import input',
      routes: [
        {
          title: 'Generated route',
          edges: [{ from: CARD_A, to: CARD_B }],
        },
      ],
      layouts: [
        {
          title: 'Generated layout',
          positions: { [CARD_A]: { x: 0, y: 0 } },
        },
      ],
    });

    expect(parsed.id).toBeUndefined();
    expect(parsed.routes[0]?.id).toBeUndefined();
    expect(parsed.layouts?.[0]?.id).toBeUndefined();
    expect(
      importSpaceFileSchema.safeParse({
        ...parsed,
        routes: [{ ...parsed.routes[0], edges: [{ from: 'card-a', to: CARD_B }] }],
      }).success,
    ).toBe(false);
  });

  it('allows only entity ids to be absent before identity resolution', () => {
    const input = {
      document: {
        ...identified.document,
        routes: [{ ...identified.document.routes[0], id: undefined }],
        layouts: [
          {
            title: 'Working',
            positions: { [CARD_A]: { x: 0, y: 0 } },
          },
        ],
      },
      cards: [...identified.cards, { document: { title: 'New', kind: 'markdown', body: '' } }],
    };

    const parsed = importSpaceSchema.parse(input);
    expect(parsed.document.layouts?.[0]?.kind).toBe('positioned');
    expect(parsed.id).toBeUndefined();
    expect(parsed.document.routes[0]?.id).toBeUndefined();
    expect(parsed.cards.at(-1)?.id).toBeUndefined();
  });

  it('rejects a non-UUID whenever an import entity id is explicit', () => {
    for (const input of [
      { ...identified, id: 'space' },
      {
        ...identified,
        document: {
          ...identified.document,
          routes: [{ ...identified.document.routes[0], id: 'main' }],
        },
      },
      {
        ...identified,
        document: {
          ...identified.document,
          layouts: [{ ...identified.document.layouts[0], id: 'working' }],
        },
      },
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
      spaceSnapshotSchema.safeParse({
        ...identified,
        document: {
          ...identified.document,
          routes: [{ ...identified.document.routes[0], id: undefined }],
        },
      }).success,
    ).toBe(false);
    expect(
      spaceSnapshotSchema.safeParse({
        ...identified,
        cards: [{ ...identified.cards[0], id: undefined }],
      }).success,
    ).toBe(false);
  });
});
