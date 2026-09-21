import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { configuredSqlitePath } from '../../src/sqlite/db';

const source = readFileSync(
  fileURLToPath(new URL('../../src/sqlite/db.ts', import.meta.url)),
  'utf8',
);

const originalPath = process.env['SQLITE_PATH'];
let temporaryRoot: string | undefined;

const restoreConfiguredPath = (): void => {
  if (originalPath === undefined) delete process.env['SQLITE_PATH'];
  else process.env['SQLITE_PATH'] = originalPath;
};

describe('SQLite path policy', () => {
  afterEach(async () => {
    restoreConfiguredPath();
    if (temporaryRoot !== undefined) await rm(temporaryRoot, { recursive: true, force: true });
    temporaryRoot = undefined;
  });

  /*
   * The Windows half of this rule cannot be exhibited on POSIX: `isAbsolute`
   * there *is* a leading-separator test, so `C:\data\hyper.db` is rejected by
   * either spelling on this platform. What a POSIX run can hold is which
   * spelling the module uses, and that `path.win32.isAbsolute` — the branch a
   * Windows run takes — admits the drive-letter and UNC forms the character
   * test does not.
   */
  it('states the absolute-path rule with node:path rather than a leading-separator test', () => {
    expect(source).toMatch(/import \{[^}]*isAbsolute[^}]*\} from 'node:path'/);
    expect(source).toMatch(/isAbsolute\(selected\)/);
    expect(source).not.toMatch(/startsWith\('\//);
  });

  it('accepts a POSIX absolute path and refuses a relative one', async () => {
    delete process.env['SQLITE_PATH'];
    temporaryRoot = await mkdtemp(join(tmpdir(), 'hyper-sqlite-path-policy-'));
    const envPath = join(temporaryRoot, 'absolute.env');
    const databasePath = join(temporaryRoot, 'hyper.db');
    await writeFile(envPath, `SQLITE_PATH=${databasePath}\n`);

    expect(configuredSqlitePath({ envPath })).toBe(databasePath);

    const relativeEnvPath = join(temporaryRoot, 'relative.env');
    await writeFile(relativeEnvPath, 'SQLITE_PATH=relative/hyper.db\n');
    delete process.env['SQLITE_PATH'];

    expect(() => configuredSqlitePath({ envPath: relativeEnvPath })).toThrow(
      'SQLITE_PATH must be an absolute path: relative/hyper.db',
    );
  });

  it('resolves every call against the environment file that call names', async () => {
    delete process.env['SQLITE_PATH'];
    temporaryRoot = await mkdtemp(join(tmpdir(), 'hyper-sqlite-path-policy-'));
    const first = join(temporaryRoot, 'first/hyper.db');
    const second = join(temporaryRoot, 'second/hyper.db');
    await mkdir(dirname(first), { recursive: true });
    await mkdir(dirname(second), { recursive: true });
    const firstEnv = join(temporaryRoot, 'first.env');
    const secondEnv = join(temporaryRoot, 'second.env');
    await writeFile(firstEnv, `SQLITE_PATH=${first}\n`);
    await writeFile(secondEnv, `SQLITE_PATH=${second}\n`);

    expect(configuredSqlitePath({ envPath: firstEnv })).toBe(first);
    expect(configuredSqlitePath({ envPath: secondEnv })).toBe(second);
  });

  it('keeps a configured SQLITE_PATH ahead of the environment file', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'hyper-sqlite-path-policy-'));
    const fromFile = join(temporaryRoot, 'file/hyper.db');
    const exported = join(temporaryRoot, 'exported/hyper.db');
    await mkdir(dirname(fromFile), { recursive: true });
    await mkdir(dirname(exported), { recursive: true });
    const envPath = join(temporaryRoot, '.env');
    await writeFile(envPath, `SQLITE_PATH=${fromFile}\n`);
    process.env['SQLITE_PATH'] = exported;

    expect(configuredSqlitePath({ envPath })).toBe(exported);
  });
});
