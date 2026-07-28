import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../../src/prisma/db';

describe('Prisma Next PostgreSQL contract', () => {
  const spaces = db.orm.public.Space;
  const cards = db.orm.public.Card;

  afterAll(async () => {
    await db.close();
  });

  it('writes and reads a typed space document with its card', async () => {
    const space = await spaces.create({
      document: { version: 2, title: 'Integration space', routes: [], layouts: [] },
      revision: 0,
    });

    try {
      const card = await cards.create({
        spaceId: space.id,
        document: { title: 'Typed card', kind: 'markdown', body: 'Database-backed content' },
      });

      const stored = await cards.first({ id: card.id });

      expect(space.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(stored).toMatchObject({
        id: card.id,
        spaceId: space.id,
        document: {
          title: 'Typed card',
          kind: 'markdown',
          body: 'Database-backed content',
        },
      });
    } finally {
      await cards.where({ spaceId: space.id }).delete();
      await spaces.where({ id: space.id }).delete();
    }
  });
});
