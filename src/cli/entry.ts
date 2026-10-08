import { newUuid } from '@project/core';
import type { DatabaseTarget } from '../database/database-target';
import { cliArguments, processIo } from './process';
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
  targets: { postgres, sqlite },
});
