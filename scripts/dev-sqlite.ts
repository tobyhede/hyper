import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { sqliteDevelopmentComposition } from '../src/sqlite/composition';
import { DEFAULT_SQLITE_PATH } from '../src/sqlite/db';

mkdirSync(dirname(DEFAULT_SQLITE_PATH), { recursive: true });
const { path } = sqliteDevelopmentComposition();
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
