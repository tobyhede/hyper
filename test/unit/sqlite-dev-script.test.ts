import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCommand } from '../support/hyper-command';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const missingParent = '/no-such-hyper-sqlite-parent/hyper.db';

/*
 * The shell `dev:sqlite` this script replaced printed one line and exited 1 for
 * a `SQLITE_PATH` it would not accept. The resolution now happens in the
 * script, so the script owns that diagnostic; an unresolvable path must not
 * reach the migration or the Vite host either, which is what the empty stdout
 * holds.
 */
describe('pnpm dev:sqlite', () => {
  it.each([
    ['is relative', 'relative/hyper.db', 'SQLITE_PATH must be an absolute path: relative/hyper.db'],
    [
      'names a missing parent',
      missingParent,
      'SQLite parent directory is missing or unwritable: /no-such-hyper-sqlite-parent',
    ],
  ])(
    'reports as one line, and starts nothing, when SQLITE_PATH %s',
    async (_, configured, message) => {
      const result = await runCommand(
        'node',
        [
          '--import',
          'tsx',
          '--disable-warning=DEP0205',
          join(repositoryRoot, 'scripts/dev-sqlite.ts'),
        ],
        {
          cwd: repositoryRoot,
          env: { SQLITE_PATH: configured },
          timeoutMs: 20_000,
          timeoutLabel: 'dev:sqlite',
        },
      );

      expect(result).toEqual({ status: 1, stdout: '', stderr: `${message}\n` });
    },
    30_000,
  );
});
