import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseTargetConfigurationError } from '../src/database/database-target';
import { sqliteDevelopmentComposition } from '../src/sqlite/composition';
import { DEFAULT_SQLITE_PATH } from '../src/sqlite/db';

/**
 * The one path this script hands to migration and to the Vite host.
 *
 * Only the default's parent is made; a `SQLITE_PATH` naming anywhere else is
 * the operator's to prepare. A path the one policy refuses is an operator
 * mistake rather than a defect, so it is reported as one line and nothing is
 * started (`test/unit/sqlite-dev-script.test.ts`).
 */
const developmentPath = (): string => {
  mkdirSync(dirname(DEFAULT_SQLITE_PATH), { recursive: true });
  try {
    return sqliteDevelopmentComposition().path;
  } catch (error) {
    if (!(error instanceof DatabaseTargetConfigurationError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
};

const path = developmentPath();
const env = { ...process.env, SQLITE_PATH: path };
const migration = spawnSync('pnpm', ['db:migrate:sqlite'], { env, stdio: 'inherit' });
if (migration.status !== 0) process.exit(migration.status ?? 1);

const host = spawn('pnpm', ['--filter', '@project/app', 'dev:sqlite'], {
  env,
  stdio: 'inherit',
});
host.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
host.once('exit', (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
