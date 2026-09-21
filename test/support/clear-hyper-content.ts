import { postgresTestDatabase as db } from './postgres-database';
import { clearSqlContent } from './clear-sql-content';

/** Delete every Hyper row from the integration database. */
export const clearHyperContent = async (): Promise<void> => {
  await clearSqlContent({
    deleteMetaIdentity: async () => {
      await db.orm.public.RepositoryState.where({ singletonId: 1 }).delete();
    },
    listSpaceIds: async () => db.orm.public.Space.select('id').all(),
    deleteResources: async (spaceId) =>
      db.orm.public.Resource.where({ spaceId })
        .deleteCount()
        .then(() => undefined),
    deleteSpace: async (spaceId) =>
      db.orm.public.Space.where({ id: spaceId })
        .deleteCount()
        .then(() => undefined),
  });
};
