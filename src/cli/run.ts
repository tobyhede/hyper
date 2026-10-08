import { resolve } from 'node:path';
import { describeError } from './describe-error';
import type { UUID } from '@project/core';
import type { DatabaseTarget } from '../database/database-target';
import { HELP, USAGE, parseHyperArguments, type HyperStore, type RunCommand } from './arguments';
import type { CliIo } from './io';
import { shellWord } from './shell-word';

export interface HyperDependencies {
  readonly io: CliIo;
  readonly newId: () => UUID;
  /** What every relative `<dir>` is relative to: where the author invoked pnpm. */
  readonly workingDirectory: string;
  /**
   * One target per store. Only the target `--store` names is opened, and only
   * by a verb that reaches a database, so help, a usage error, `init` and
   * `run` open none.
   */
  readonly targets: Readonly<Record<HyperStore, DatabaseTarget>>;
  /** Serve an Aggregate directory until the author stops it, answering the exit code. */
  readonly launchRun: (command: RunCommand) => Promise<number>;
}

const init = async (
  directory: string,
  { io, newId }: Pick<HyperDependencies, 'io' | 'newId'>,
): Promise<number> => {
  let result;
  try {
    const { initAggregate } = await import('../run/run');
    result = await initAggregate(directory, newId);
  } catch (error) {
    const reason = describeError(error);
    io.stderr(`Could not init ${directory}: ${reason}\n`);
    return 1;
  }
  if (result.kind === 'not-empty') {
    io.stderr(`${directory} is not empty; init writes only to a missing or empty directory.\n`);
    return 1;
  }
  io.stdout(`Created a new aggregate; run it with: pnpm hyper run ${shellWord(directory)}\n`);
  return 0;
};

/** Run one `hyper` command line and answer its exit code. A usage error exits 2. */
export const runHyper = async (
  args: readonly string[],
  { io, newId, workingDirectory, targets, launchRun }: HyperDependencies,
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
  const directory = resolve(workingDirectory, command.directory);
  switch (command.verb) {
    case 'init':
      return init(directory, { io, newId });
    case 'run':
      return launchRun({ ...command, directory });
    case 'import':
    case 'export': {
      const { runDatabaseCli } = await import('./database-entry');
      return runDatabaseCli(targets[command.store], { ...command, directory }, { io, newId });
    }
  }
};
