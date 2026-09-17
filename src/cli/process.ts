import type { CliIo } from './run';

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
