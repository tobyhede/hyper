import { setTimeout as sleep } from 'node:timers/promises';
import { newUuid } from '@project/core';
import type { DatabaseTarget } from '../database/database-target';
import { establishMetaSpace, retryMetaSpaceEstablishment } from '../startup/database-startup';
import { createSpaceHost, type SpaceHostApplication } from './space-host';

const reportEstablishmentFailure = (cause: unknown): void => {
  console.error('Failed to establish the Meta Space at startup', cause);
};

const reportSafely = (report: (cause: unknown) => void, cause: unknown): void => {
  try {
    report(cause);
  } catch {
    // There is nowhere left to report the failure of a reporter.
  }
};

export interface DatabaseHttpRuntimeOptions {
  readonly wait?: (milliseconds: number) => Promise<void>;
  readonly report?: (cause: unknown) => void;
}

/**
 * The host application, plus the release of the database target it opened.
 * The Vite host calls `close` when its server closes — an in-process restart
 * opens the next target before it closes this host — so the handle does not
 * outlive the host that owns it.
 */
export type DatabaseHttpApplication = SpaceHostApplication & {
  close(): Promise<void>;
};

export const createDatabaseHttpApp = async (
  target: DatabaseTarget,
  {
    wait = (milliseconds) => sleep(milliseconds, undefined, { ref: false }),
    report = reportEstablishmentFailure,
  }: DatabaseHttpRuntimeOptions = {},
): Promise<DatabaseHttpApplication> => {
  const opened = await target.open();
  try {
    await establishMetaSpace(opened.repository, newUuid);
  } catch (error) {
    reportSafely(report, error);
    void retryMetaSpaceEstablishment(opened.repository, newUuid, { wait, report })
      .then((metaSpaceId) => {
        if (metaSpaceId !== undefined) return;
        reportSafely(
          report,
          new Error('Gave up establishing the Meta Space; restart the host once it is fixable'),
        );
      })
      .catch(() => undefined);
  }
  return Object.assign(createSpaceHost(opened.repository, newUuid), {
    close: () => opened.close(),
  });
};
