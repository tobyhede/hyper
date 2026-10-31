import { resolve } from 'node:path';
import { describeError } from './describe-error';
import type { UUID } from '@project/core';
import type { DatabaseTarget } from '../database/database-target';
import {
  HELP,
  USAGE,
  parseInfinityCubeArguments,
  type InfinityCubeStore,
  type RunCommand,
} from './arguments';
import type { CliIo } from './io';
import { shellWord } from './shell-word';

export interface InfinityCubeDependencies {
  readonly io: CliIo;
  readonly newId: () => UUID;
  /** What every relative `<dir>` is relative to: where the author invoked pnpm. */
  readonly workingDirectory: string;
  /**
   * One target per store. Only the target `--store` names is opened, and only
   * by a verb that reaches a database, so help, a usage error, `init`,
   * `run` and `check` open none.
   */
  readonly targets: Readonly<Record<InfinityCubeStore, DatabaseTarget>>;
  /** Serve an Aggregate directory until the author stops it, answering the exit code. */
  readonly launchRun: (command: RunCommand) => Promise<number>;
}

const init = async (
  directory: string,
  { io, newId }: Pick<InfinityCubeDependencies, 'io' | 'newId'>,
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
  io.stdout(`Created a new aggregate; run it with: pnpm cube run ${shellWord(directory)}\n`);
  return 0;
};

const check = async (
  directory: string,
  { io, newId }: Pick<InfinityCubeDependencies, 'io' | 'newId'>,
): Promise<number> => {
  let result;
  try {
    const { checkAggregate } = await import('../run/run');
    result = await checkAggregate(directory, newId);
  } catch (error) {
    io.stderr(`Could not check ${directory}: ${describeError(error)}\n`);
    return 1;
  }
  if (result.kind !== 'valid') {
    const { describeRunRefusal } = await import('./run-process');
    io.stderr(describeRunRefusal(result, directory));
    return 1;
  }
  io.stdout(`${directory} is a valid aggregate.\n`);
  return 0;
};

/** Run one `cube` command line and answer its exit code. A usage error exits 2. */
export const runInfinityCube = async (
  args: readonly string[],
  { io, newId, workingDirectory, targets, launchRun }: InfinityCubeDependencies,
): Promise<number> => {
  const command = parseInfinityCubeArguments(args);
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
    case 'check':
      return check(directory, { io, newId });
    case 'run':
      return launchRun({ ...command, directory });
    case 'import':
    case 'export': {
      const { runDatabaseCli } = await import('./database-entry');
      return runDatabaseCli(targets[command.store], { ...command, directory }, { io, newId });
    }
  }
};
