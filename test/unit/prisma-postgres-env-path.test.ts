import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { repositoryEnvPath } from '../../src/prisma/db';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The directory `packages/app/http-server-build.config.ts` writes the bundled
 * PostgreSQL runtime into, and the directory `packages/app/database-vite-config
 * .ts` names as `previewModule` — so it is where `import.meta.url` points when
 * `pnpm preview` imports that artifact.
 */
const BUNDLE_DIRECTORY = 'packages/app/dist-http';

/** Where this module's own source sits, which is where `tsx` runs it from. */
const SOURCE_DIRECTORY = 'src/prisma';

let temporaryRoot: string | undefined;

describe('PostgreSQL environment resolution', () => {
  afterEach(async () => {
    if (temporaryRoot !== undefined) await rm(temporaryRoot, { recursive: true, force: true });
    temporaryRoot = undefined;
  });

  it('names the root .env from the bundled runtime and from the source alike', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'hyper-postgres-env-'));
    await mkdir(join(temporaryRoot, BUNDLE_DIRECTORY), { recursive: true });
    await mkdir(join(temporaryRoot, SOURCE_DIRECTORY), { recursive: true });
    const rootEnv = join(temporaryRoot, '.env');
    await writeFile(rootEnv, 'DATABASE_URL=postgresql://hyper:hyper@127.0.0.1:5432/hyper\n');

    // A fixed `../../` offset is the root for one of these and `packages/` for
    // the other, which is the whole of what this holds.
    expect(repositoryEnvPath(join(temporaryRoot, BUNDLE_DIRECTORY))).toBe(rootEnv);
    expect(repositoryEnvPath(join(temporaryRoot, SOURCE_DIRECTORY))).toBe(rootEnv);
  });

  it('prefers the nearest .env above the starting directory', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'hyper-postgres-env-'));
    await mkdir(join(temporaryRoot, BUNDLE_DIRECTORY), { recursive: true });
    await writeFile(join(temporaryRoot, '.env'), 'DATABASE_URL=root\n');
    const nearerEnv = join(temporaryRoot, 'packages/app/.env');
    await writeFile(nearerEnv, 'DATABASE_URL=nearer\n');

    expect(repositoryEnvPath(join(temporaryRoot, BUNDLE_DIRECTORY))).toBe(nearerEnv);
  });

  it('answers undefined rather than a path no file sits at', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'hyper-postgres-env-'));
    const isolated = join(temporaryRoot, BUNDLE_DIRECTORY);
    await mkdir(isolated, { recursive: true });

    // `mkdtemp` is under the system temporary directory, so the walk this makes
    // runs to the filesystem root. It terminates there rather than looping, and
    // an absent `.env` is not an error: the driver's own default answers for it,
    // which is what `createPostgresDatabase` does with `undefined`.
    expect(repositoryEnvPath(isolated)).toBeUndefined();
  });

  it('starts from this module’s own directory when given no starting point', () => {
    // Pinned as an equality rather than a literal path, because whether the
    // developer or the CI runner has a `.env` at the repository root is not
    // this test's to decide — only where the search begins is.
    expect(repositoryEnvPath()).toBe(repositoryEnvPath(join(repositoryRoot, SOURCE_DIRECTORY)));
  });
});
