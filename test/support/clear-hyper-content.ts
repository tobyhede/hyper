import { db } from '../../src/prisma/db';

/** Delete every Hyper row from the integration database. */
export const clearHyperContent = async (): Promise<void> => {
  await db.orm.public.RepositoryState.where({ singletonId: 1 }).delete();
  for (const space of await db.orm.public.Space.all()) {
    await db.orm.public.Card.where({ spaceId: space.id }).deleteAll();
    await db.orm.public.Space.where({ id: space.id }).delete();
  }
};
