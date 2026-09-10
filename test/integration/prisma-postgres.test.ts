import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../../src/prisma/db';

describe('Prisma Next PostgreSQL contract', () => {
  const spaces = db.orm.public.Space;
  const things = db.orm.public.Thing;

  afterAll(async () => {
    await db.close();
  });

  it('writes and reads a typed space document with its thing', async () => {
    const space = await spaces.create({
      document: { version: 1, title: 'Integration space', diagrams: [] },
      revision: 0,
    });

    try {
      const thing = await things.create({
        spaceId: space.id,
        document: { title: 'Typed thing', kind: 'markdown', body: 'Database-backed content' },
      });

      const stored = await things.first({ id: thing.id });

      expect(space.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(stored).toMatchObject({
        id: thing.id,
        spaceId: space.id,
        document: {
          title: 'Typed thing',
          kind: 'markdown',
          body: 'Database-backed content',
        },
      });
    } finally {
      await things.where({ spaceId: space.id }).delete();
      await spaces.where({ id: space.id }).delete();
    }
  });

  it('advances updatedAt when a space is updated', async () => {
    const space = await spaces.create({
      document: { version: 1, title: 'Before update', diagrams: [] },
      revision: 0,
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await spaces.where({ id: space.id }).update({
        document: { version: 1, title: 'After update', diagrams: [] },
        revision: 1,
      });

      expect(updated).not.toBeNull();
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(space.updatedAt.getTime());
    } finally {
      await spaces.where({ id: space.id }).delete();
    }
  });
});
