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
  //
  // Failing to establish it is not fatal to composition, though. The host this
  // returns is awaited once and memoized for the life of the process
  // (`packages/app/vite-space-http-plugin.ts`), so a rejection here is
  // permanent: every later request, on every path, would be handed to
  // `next(error)` and get the host's generic error page rather than the answer
  // the application has for it — and a database that was merely down at boot
  // would never be served again once it came back. The root address establishes
  // too and reports a failure as an answer, so this reports and continues.
  try {
    await establishMetaSpace(repository, newUuid);
  } catch (error) {
    console.error('Failed to establish the Meta Space at startup', error);
  }
  return createSpaceHost(repository, newUuid);
};
