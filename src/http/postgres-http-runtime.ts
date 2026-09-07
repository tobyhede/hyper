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
 * What this runtime can be handed instead of the two ambient things it
 * otherwise names, a timer and stderr (ADR 0016, ADR 0081).
 *
 * Both are optional and both defaults are the composition rather than a
 * fallback: omitting one is how every real caller composes this, and a test
 * supplies one to compose the runtime without a process behind it.
 */
export interface PostgresHttpRuntimeOptions {
  wait?: (milliseconds: number) => Promise<void>;
  report?: (cause: unknown) => void;
}

/**
 * Compose the normal database runtime before exposing browser-safe HTTP
 * resources.
 *
 * One options object rather than two positional arguments, because the first
 * position is not this module's to spend: the Vite host hands whichever runtime
 * module it loaded exactly one argument, its configured `runtimeOptions`
 * (`packages/app/vite-space-http-plugin.ts`), so that position belongs to the
 * contract both runtimes implement. Taking it for a collaborator of this one
 * left the two runtimes disagreeing about what the same argument means, with
 * nothing to typecheck the disagreement — harmless only while every path that
 * reaches this module happens to configure no options at all.
 */
export const createApp = async ({
  wait = (milliseconds) => sleep(milliseconds, undefined, { ref: false }),
  report = reportEstablishmentFailure,
}: PostgresHttpRuntimeOptions = {}): Promise<SpaceHostApplication> => {
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
