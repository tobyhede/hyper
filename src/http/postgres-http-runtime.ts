import { setTimeout as sleep } from 'node:timers/promises';
import { newUuid } from '@project/core';
import { PostgresSpaceRepository } from '../persistence/postgres-space-repository';
import { db } from '../prisma/db';
import { establishMetaSpace, retryMetaSpaceEstablishment } from '../startup/database-startup';
import { createSpaceHost, type SpaceHostApplication } from './space-host';

const reportEstablishmentFailure = (cause: unknown): void => {
  console.error('Failed to establish the Meta Space at startup', cause);
};

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
  // would never be served again once it came back. So this reports and
  // continues.
  try {
    await establishMetaSpace(repository, newUuid);
  } catch (error) {
    reportEstablishmentFailure(error);
    // What a database that came back used to be repaired by was the root
    // address, which established the Meta Space for whichever request arrived
    // first — a safe method creating durable authored state. The repair belongs
    // here instead, to the one place that already owns the failure.
    //
    // Not awaited, and that is the point: composition waits for the first
    // attempt and no more, so a host over a database that is down still starts
    // and still serves every answer the application has, including the root
    // address's `503`. `ref: false` keeps a pending retry from holding the
    // process open, and the retry reports rather than rejects, so nothing is
    // left for Node to call an unhandled rejection.
    void retryMetaSpaceEstablishment(
      repository,
      newUuid,
      (milliseconds) => sleep(milliseconds, undefined, { ref: false }),
      reportEstablishmentFailure,
    );
  }
  return createSpaceHost(repository, newUuid);
};
