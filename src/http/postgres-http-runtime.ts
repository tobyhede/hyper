import { createSpaceHttpApp, type SpaceHttpApp } from '@project/http';
import { PostgresSpaceRepository } from '../persistence/postgres-space-repository';
import { db } from '../prisma/db';
import { resolveDatabaseStartup } from '../startup/database-startup';

/** Compose the normal database runtime before exposing browser-safe HTTP resources. */
export const createApp = async (): Promise<SpaceHttpApp> => {
  const repository = new PostgresSpaceRepository(db);
  await resolveDatabaseStartup(repository);
  return createSpaceHttpApp(repository);
};
