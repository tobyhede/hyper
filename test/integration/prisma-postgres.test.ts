import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../../src/prisma/db';

describe('Prisma Next PostgreSQL contract', () => {
  const spaces = db.orm.public.Space;
  const resources = db.orm.public.Resource;

  afterAll(async () => {
    await db.close();
  });

  it('writes and reads a typed space document with its resource', async () => {
    const space = await spaces.create({
      document: { version: 1, title: 'Integration space', maps: [] },
      revision: '0',
    });

    try {
      const resource = await resources.create({
        spaceId: space.id,
        document: { title: 'Typed resource', kind: 'markdown', body: 'Database-backed content' },
      });

      const stored = await resources.first({ id: resource.id });

      expect(space.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(stored).toMatchObject({
        id: resource.id,
        spaceId: space.id,
        document: {
          title: 'Typed resource',
          kind: 'markdown',
          body: 'Database-backed content',
        },
      });
    } finally {
      await resources.where({ spaceId: space.id }).delete();
      await spaces.where({ id: space.id }).delete();
    }
  });

  it('advances updatedAt when a space is updated', async () => {
    const space = await spaces.create({
      document: { version: 1, title: 'Before update', maps: [] },
      revision: '0',
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await spaces.where({ id: space.id }).update({
        document: { version: 1, title: 'After update', maps: [] },
        revision: '1',
      });

      expect(updated).not.toBeNull();
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(space.updatedAt.getTime());
    } finally {
      await spaces.where({ id: space.id }).delete();
    }
  });
});
