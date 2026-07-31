import { PostgresSpaceRepository } from '../persistence/postgres-space-repository';
import { db } from '../prisma/db';
import { resolveDatabaseStartup } from '../startup/database-startup';
import { createSpaceHttpHandler, type SpaceHttpHandler } from './space-http-handler';

/** Compose the normal database runtime before exposing browser-safe HTTP resources. */
export const createHandler = async (): Promise<SpaceHttpHandler> => {
  const repository = new PostgresSpaceRepository(db);
  await resolveDatabaseStartup(repository);
  return createSpaceHttpHandler(repository);
};
