/** The database an `import` or `export` reaches; connection details come from the environment. */
export type HyperStore = 'postgres' | 'sqlite';

export type DatabaseCommand =
  | {
      readonly verb: 'import';
      readonly directory: string;
      readonly store: HyperStore;
      readonly replace: boolean;
    }
  | { readonly verb: 'export'; readonly directory: string; readonly store: HyperStore };

export type HyperCommand = { readonly verb: 'help' } | DatabaseCommand;

interface VerbLine {
  readonly synopsis: string;
  readonly summary: string;
}

/** Every verb, the author's before the developer's (ADR 0124). */
const VERB_LINES: readonly VerbLine[] = [
  { synopsis: 'init <dir>', summary: 'Create a new aggregate in a missing or empty directory' },
  {
    synopsis: 'run <dir> [--port <port>] [--no-open]',
    summary: 'Serve an Aggregate directory, writing edits back to it',
  },
  {
    synopsis: 'import <dir> [--store postgres|sqlite] [--dangerous-replace]',
    summary: 'Import an aggregate into a database (default postgres)',
  },
  {
    synopsis: 'export <dir> [--store postgres|sqlite]',
    summary: "Export a database's aggregate to a directory (default postgres)",
  },
  { synopsis: 'help', summary: 'List every verb' },
];

export const USAGE = 'Usage: hyper <init|run|import|export|help> [arguments]\n';

const synopsisWidth = Math.max(...VERB_LINES.map(({ synopsis }) => synopsis.length));

export const HELP = `Usage: hyper <verb> [arguments]\n\n${VERB_LINES.map(
  ({ synopsis, summary }) => `  hyper ${synopsis.padEnd(synopsisWidth)}  ${summary}\n`,
).join('')}`;

const parseStore = (value: string | undefined): HyperStore | undefined => {
  switch (value) {
    case 'postgres':
      return 'postgres';
    case 'sqlite':
      return 'sqlite';
    case undefined:
    default:
      return undefined;
  }
};

interface DatabaseArguments {
  readonly directory: string;
  readonly store: HyperStore;
  readonly replace: boolean;
}

/**
 * One directory, at most one `--store <store>`, and — where the verb allows it
 * — at most one `--dangerous-replace`. An option is never a directory, and
 * neither is the empty string, which would resolve to the working directory.
 */
const parseDatabaseArguments = (
  args: readonly string[],
  allowReplace: boolean,
): DatabaseArguments | undefined => {
  let directory: string | undefined;
  let store: HyperStore | undefined;
  let replace = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--store') {
      if (store !== undefined) return undefined;
      index += 1;
      store = parseStore(args[index]);
      if (store === undefined) return undefined;
    } else if (argument === '--dangerous-replace') {
      if (!allowReplace || replace) return undefined;
      replace = true;
    } else if (
      argument === undefined ||
      argument === '' ||
      argument.startsWith('-') ||
      directory !== undefined
    ) {
      return undefined;
    } else {
      directory = argument;
    }
  }
  if (directory === undefined) return undefined;
  return { directory, store: store ?? 'postgres', replace };
};

/** The command a command line names, or `undefined` for a usage error. */
export const parseHyperArguments = (args: readonly string[]): HyperCommand | undefined => {
  const [verb, ...rest] = args;
  switch (verb) {
    case 'help':
    case '--help':
      return rest.length === 0 ? { verb: 'help' } : undefined;
    case 'import': {
      const parsed = parseDatabaseArguments(rest, true);
      return parsed === undefined ? undefined : { verb: 'import', ...parsed };
    }
    case 'export': {
      const parsed = parseDatabaseArguments(rest, false);
      return parsed === undefined
        ? undefined
        : { verb: 'export', directory: parsed.directory, store: parsed.store };
    }
    case undefined:
    default:
      return undefined;
  }
};
