import { newUuid } from '@project/core';
import { PostgresSpaceRepository } from '../persistence/postgres-space-repository';
import { db } from '../prisma/db';
import { establishMetaSpace } from '../startup/database-startup';
import { createSpaceHost, type SpaceHostApplication } from './space-host';

/** Compose the normal database runtime before exposing browser-safe HTTP resources. */
export const createApp = async (): Promise<SpaceHostApplication> => {
  const repository = new PostgresSpaceRepository(db);
  // The browser cannot initialize a repository, so the server does it before
  // any document is served: `uninitialized` reaching `packages/app` is broken
  // repository state and fails there loudly.
  await establishMetaSpace(repository, newUuid);
  return createSpaceHost(repository, newUuid);
};
