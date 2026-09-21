import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { SQLITE_ENV_PATH } from '../../src/sqlite/db';
import { runCommand } from '../support/hyper-command';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const appRoot = join(repositoryRoot, 'packages/app');
const moduleUrl = pathToFileURL(join(repositoryRoot, 'src/sqlite/composition.ts')).href;
const originalPath = process.env['SQLITE_PATH'];
let temporaryRoot: string | undefined;

describe('SQLite root environment composition', () => {
  afterEach(async () => {
    if (originalPath === undefined) delete process.env['SQLITE_PATH'];
    else process.env['SQLITE_PATH'] = originalPath;
    if (temporaryRoot !== undefined) await rm(temporaryRoot, { recursive: true, force: true });
    temporaryRoot = undefined;
  });

  it('gives the real migration, host, CLI and development compositions one root .env path', async () => {
    expect(SQLITE_ENV_PATH).toBe(join(repositoryRoot, '.env'));
    delete process.env['SQLITE_PATH'];
    temporaryRoot = await mkdtemp(join(tmpdir(), 'hyper-sqlite-root-env-'));
    const envPath = join(temporaryRoot, '.env');
    const databasePath = join(temporaryRoot, 'sqlite/hyper.db');
    await mkdir(join(temporaryRoot, 'sqlite'), { recursive: true });
    await writeFile(envPath, `SQLITE_PATH=${databasePath}\n`);
    await writeFile(databasePath, '');

    for (const composition of [
      'sqliteMigrationComposition',
      'sqliteHostComposition',
      'sqliteCliComposition',
      'sqliteDevelopmentComposition',
    ]) {
      const result = await runCommand(
        'node',
        [
          '--import',
          'tsx',
          '--disable-warning=DEP0205',
          '--input-type=module',
          '--eval',
          `import { ${composition} } from '${moduleUrl}'; console.log(${composition}('${envPath}').path)`,
        ],
        { cwd: appRoot, timeoutLabel: composition },
      );
      expect(result).toEqual({ status: 0, stdout: `${databasePath}\n`, stderr: '' });
    }
  }, 15_000);
});
