import { newUuid } from '@project/core';
import type { DatabaseTarget } from '../database/database-target';
import { cliArguments, processIo } from './process';
import { launchRun } from './run-launcher';
import { runHyper } from './run';

/**
 * Each store's modules load only when its target opens, so a command that
 * reaches no database loads no driver.
 */
const postgres: DatabaseTarget = {
  open: async () => (await import('../prisma/target')).postgresTarget.open(),
};

const sqlite: DatabaseTarget = {
  open: async () => (await import('../sqlite/composition')).sqliteCliComposition().target.open(),
};

process.exitCode = await runHyper(cliArguments(), {
  io: processIo,
  newId: newUuid,
  // pnpm runs a script from the repository root and records where it was
  // invoked in `INIT_CWD`, which is what a relative directory is relative to.
  workingDirectory: process.env['INIT_CWD'] ?? process.cwd(),
  targets: { postgres, sqlite },
  launchRun,
});
