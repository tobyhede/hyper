import { PostgresSpaceRepository } from '../persistence/postgres-space-repository';
import { db } from '../prisma/db';
import { bootstrapEmptyDatabase } from '../startup/database-startup';
import { createSpaceHost, type SpaceHostApplication } from './space-host';

/** Compose the normal database runtime before exposing browser-safe HTTP resources. */
export const createApp = async (): Promise<SpaceHostApplication> => {
  const repository = new PostgresSpaceRepository(db);
  await bootstrapEmptyDatabase(repository);
  return createSpaceHost(repository);
};
