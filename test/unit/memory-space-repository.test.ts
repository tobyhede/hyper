import { uuidSchema, type ImportSpace, type UUID } from '@project/core';
import { describe, expect, it } from 'vitest';
import { MemorySpaceRepository } from '../support/memory-space-repository';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const CARD_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const OTHER_CARD_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');

const importSpace = (id: UUID, cardId: UUID, title: string): ImportSpace => ({
  id,
  document: { version: 2, title, routes: [] },
  cards: [
    {
      id: cardId,
      document: { title: `${title} card`, kind: 'markdown', body: '' },
    },
  ],
});

describe('MemorySpaceRepository', () => {
  it.each([
    {
      name: 'Space identity',
      batch: [
        importSpace(SPACE_ID, CARD_ID, 'First'),
        importSpace(SPACE_ID, OTHER_CARD_ID, 'Duplicate space'),
      ],
      code: 'duplicate-identity',
    },
    {
      name: 'Card ownership',
      batch: [
        importSpace(SPACE_ID, CARD_ID, 'First'),
        importSpace(OTHER_SPACE_ID, CARD_ID, 'Duplicate card'),
      ],
      code: 'card-ownership',
    },
  ] as const)('rejects conflicting $name atomically', async ({ batch, code }) => {
    const repository = new MemorySpaceRepository();

    const result = await repository.importSpaces(batch, 'insert');

    expect(result).toMatchObject({ kind: 'rejected', code });
    await expect(repository.listSpaces()).resolves.toEqual([]);
  });

  it('rejects an explicitly identified Space already in the repository atomically', async () => {
    const repository = new MemorySpaceRepository();
    const existing = importSpace(SPACE_ID, CARD_ID, 'Existing');
    await repository.importSpaces([existing], 'insert');
    const before = await repository.loadSpace(SPACE_ID);

    const result = await repository.importSpaces(
      [
        importSpace(OTHER_SPACE_ID, OTHER_CARD_ID, 'Must roll back'),
        importSpace(SPACE_ID, CARD_ID, 'Duplicate'),
      ],
      'insert',
    );

    expect(result).toEqual({
      kind: 'rejected',
      code: 'duplicate-identity',
      message: `Space ${SPACE_ID} already exists`,
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(before);
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toBeUndefined();
  });

  it('rejects a commit that claims a Card owned by another Space', async () => {
    const repository = new MemorySpaceRepository();
    await repository.importSpaces(
      [
        importSpace(SPACE_ID, CARD_ID, 'First'),
        importSpace(OTHER_SPACE_ID, OTHER_CARD_ID, 'Second'),
      ],
      'insert',
    );
    const before = await repository.loadSpace(OTHER_SPACE_ID);
    if (before === undefined) throw new Error('Expected the second Space to be stored');

    const result = await repository.commitSpace(
      {
        ...before.snapshot,
        cards: [
          {
            id: CARD_ID,
            document: { title: 'Claimed card', kind: 'markdown', body: '' },
          },
        ],
      },
      before.revision,
    );

    expect(result).toMatchObject({ kind: 'rejected', code: 'invalid-snapshot' });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(before);
  });
});
