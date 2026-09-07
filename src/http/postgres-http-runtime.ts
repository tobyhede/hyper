import { setTimeout as sleep } from 'node:timers/promises';
import { newUuid } from '@project/core';
import { PostgresSpaceRepository } from '../persistence/postgres-space-repository';
import { db } from '../prisma/db';
import { establishMetaSpace, retryMetaSpaceEstablishment } from '../startup/database-startup';
import { createSpaceHost, type SpaceHostApplication } from './space-host';

const reportEstablishmentFailure = (cause: unknown): void => {
  console.error('Failed to establish the Meta Space at startup', cause);
};

/**
 * Compose the normal database runtime before exposing browser-safe HTTP
 * resources.
 *
 * `wait` and `report` are the two ambient things this composition names — a
 * timer and stderr — and they are arguments so a test can compose the runtime
 * without either (ADR 0016, ADR 0081). Their defaults are the composition, not
 * a fallback a caller may forget to override: the Vite plugin calls this with
 * whatever `runtimeOptions` holds, which for this runtime is nothing.
 */
export const createApp = async (
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    sleep(milliseconds, undefined, { ref: false }),
  report: (cause: unknown) => void = reportEstablishmentFailure,
): Promise<SpaceHostApplication> => {
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
    report(error);
    // What a database that came back used to be repaired by was the root
    // address, which established the Meta Space for whichever request arrived
    // first — a safe method creating durable authored state. The repair belongs
    // here instead, to the one place that already owns the failure.
    //
    // This failure's type is deliberately not consulted. It is tempting: an
    // `AggregateInvariantError` names stored state no waiting cures. But one of
    // those is also what a healthy repository shows for an instant under
    // `loadAggregate`'s two READ COMMITTED reads, so skipping the retry on it
    // would abort over a race the very next read settles. Which is why the loop
    // requires two consecutive ones, and why the first one is the loop's to
    // count rather than this line's to act on.
    //
    // Not awaited, and that is the point: composition waits for the first
    // attempt and no more, so a host over a database that is down still starts
    // and still serves every answer the application has, including the root
    // address's `503`. The default `wait` keeps a pending retry from holding
    // the process open.
    //
    // `catch` because nothing is awaiting this. The loop reports rather than
    // rethrows, but reporting is itself a call that can throw — `console.error`
    // onto closed or broken stderr does — and a rejection nothing listens for
    // is what Node answers by killing the process. There is nowhere left to
    // report the failure of a reporter, so it stops here, the way
    // `packages/app/vite-space-http-plugin.ts` marks its memoized host handled.
    void retryMetaSpaceEstablishment(repository, newUuid, wait, report).catch(() => undefined);
  }
  return createSpaceHost(repository, newUuid);
};
