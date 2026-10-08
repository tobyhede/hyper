import type { UUID } from '@project/core';
import type { DatabaseTarget } from '../database/database-target';
import { HELP, USAGE, parseHyperArguments, type HyperStore } from './arguments';
import type { CliIo } from './database-command';
import { runDatabaseCli } from './database-entry';

export interface HyperDependencies {
  readonly io: CliIo;
  readonly newId: () => UUID;
  /**
   * One target per store. Only the target `--store` names is opened, and only
   * by a verb that reaches a database, so help and a usage error open none.
   */
  readonly targets: Readonly<Record<HyperStore, DatabaseTarget>>;
}

/** Run one `hyper` command line and answer its exit code. A usage error exits 2. */
export const runHyper = async (
  args: readonly string[],
  { io, newId, targets }: HyperDependencies,
): Promise<number> => {
  const command = parseHyperArguments(args);
  if (command === undefined) {
    io.stderr(USAGE);
    return 2;
  }
  if (command.verb === 'help') {
    io.stdout(HELP);
    return 0;
  }
  return runDatabaseCli(targets[command.store], command, io, newId);
};
