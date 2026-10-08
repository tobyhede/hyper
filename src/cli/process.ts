import type { CliIo } from './io';

/** The process's own streams, which only an entry module may name. */
export const processIo: CliIo = {
  stdout: (message: string) => process.stdout.write(message),
  stderr: (message: string) => process.stderr.write(message),
};

/** The command's arguments, without the `--` pnpm forwards before them. */
export const cliArguments = (): readonly string[] => {
  const processArgs = process.argv.slice(2);
  return processArgs[0] === '--' ? processArgs.slice(1) : processArgs;
};

/**
 * Where the author invoked the command, which every relative `<dir>` is
 * relative to. pnpm runs a script from the repository root and records where
 * it was invoked in `INIT_CWD`, but a process an outer script started inherits
 * that script's `INIT_CWD`, so it is read only under the `hyper` script itself.
 */
export const invocationDirectory = (): string => {
  const invoked = process.env['INIT_CWD'];
  return process.env['npm_lifecycle_event'] === 'hyper' && invoked !== undefined
    ? invoked
    : process.cwd();
};
