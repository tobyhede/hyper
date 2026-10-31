import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describeCheckFailure, describeError } from './describe-error';
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
  /** Serve the MCP server for an Aggregate directory until its client disconnects, answering the exit code. */
  readonly serveMcp: (directory: string) => Promise<number>;
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
  try {
    const [{ checkAggregate }, { describeCheck }] = await Promise.all([
      import('../run/run'),
      import('./run-refusal'),
    ]);
    const { accepted, text } = describeCheck(await checkAggregate(directory, newId), directory);
    if (!accepted) {
      io.stderr(text);
      return 1;
    }
    io.stdout(text);
    return 0;
  } catch (error) {
    io.stderr(describeCheckFailure(directory, error));
    return 1;
  }
};

/**
 * Serve an existing directory, empty or not, since the client may write an
 * aggregate into it; a missing one is refused, so a mistyped path is not
 * written as a new talk (ADR 0124).
 */
const mcp = async (
  directory: string,
  { io, serveMcp }: Pick<InfinityCubeDependencies, 'io' | 'serveMcp'>,
): Promise<number> => {
  let isDirectory: boolean;
  try {
    isDirectory = (await stat(directory)).isDirectory();
  } catch (error) {
    const { isMissingFile } = await import('../aggregate-directory/space-directory');
    if (isMissingFile(error)) {
      io.stderr(
        `${directory} does not exist. To create an aggregate there: pnpm cube init ${shellWord(directory)}\n`,
      );
    } else {
      io.stderr(`Could not serve ${directory}: ${describeError(error)}\n`);
    }
    return 1;
  }
  if (!isDirectory) {
    io.stderr(`${directory} is not a directory.\n`);
    return 1;
  }
  return serveMcp(directory);
};

/** Run one `cube` command line and answer its exit code. A usage error exits 2. */
export const runInfinityCube = async (
  args: readonly string[],
  { io, newId, workingDirectory, targets, launchRun, serveMcp }: InfinityCubeDependencies,
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
    case 'mcp':
      return mcp(directory, { io, serveMcp });
    case 'run':
      return launchRun({ ...command, directory });
    case 'import':
    case 'export': {
      const { runDatabaseCli } = await import('./database-entry');
      return runDatabaseCli(targets[command.store], { ...command, directory }, { io, newId });
    }
  }
};
