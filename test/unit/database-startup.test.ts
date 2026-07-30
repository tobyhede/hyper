import { uuidSchema } from '@project/core';
import { describe, expect, it } from 'vitest';
import { resolveDatabaseStartup } from '../../src/startup/database-startup';
import { MemorySpaceRepository } from '../support/memory-space-repository';

describe('resolveDatabaseStartup', () => {
  it('creates and opens the normal new space when the database is empty', async () => {
    const repository = new MemorySpaceRepository();

    const result = await resolveDatabaseStartup(repository);

    expect(result.kind).toBe('opened');
    expect(uuidSchema.safeParse(result.space.snapshot.id).success).toBe(true);
    const cardId = result.space.snapshot.cards[0]?.id;
    expect(uuidSchema.safeParse(cardId).success).toBe(true);
    expect(result.space).toEqual({
      snapshot: {
        id: result.space.snapshot.id,
        document: { version: 2, title: 'New space', routes: [] },
        cards: [
          {
            id: cardId,
            document: { title: 'Start here', kind: 'markdown', body: '' },
          },
        ],
      },
      revision: 0n,
      exportedRevision: null,
    });
    await expect(repository.loadSpace(result.space.snapshot.id)).resolves.toEqual(result.space);
  });
});
