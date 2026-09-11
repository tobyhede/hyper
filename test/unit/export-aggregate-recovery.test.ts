import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportAggregate } from '../../src/export/export-aggregate';
import { MemorySpaceRepository } from '../support/memory-space-repository';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const THING_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');

// SAFETY: `kind` starts `undefined` but is reassigned to 'backup'/'staging'
// later (per test) — the cast states the mutable field's real type up front
// rather than letting the initializer narrow it to the literal `undefined`.
const cleanupFailure = vi.hoisted(() => ({
  kind: undefined as 'backup' | 'staging' | undefined,
  replacementWrite: false,
}));

/**
 * Recovery and staging directories are implementation details, not deliverables.
 * Failing to remove either is a housekeeping problem: it must neither report a
 * completed export as failed nor replace the primary error from an incomplete
 * export.
 */
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    writeFile: (
      path: Parameters<typeof actual.writeFile>[0],
      data: Parameters<typeof actual.writeFile>[1],
      options?: Parameters<typeof actual.writeFile>[2],
    ) =>
      // A Space's file now sits under its own id inside the staged aggregate, so
      // the manifest at the replacement root is already written by the time this
      // fires — which is the point: the failure lands part-way through staging,
      // where the destination has not been touched yet.
      cleanupFailure.replacementWrite &&
      typeof path === 'string' &&
      path.includes('.hyper-export-') &&
      path.endsWith(`/replacement/${SPACE_ID}/space.json`)
        ? Promise.reject(
            Object.assign(new Error(`ENOSPC: no space left on device, write '${path}'`), {
              code: 'ENOSPC',
            }),
          )
        : actual.writeFile(path, data, options),
    rm: (path: Parameters<typeof actual.rm>[0], options?: Parameters<typeof actual.rm>[1]) =>
      typeof path === 'string' &&
      ((cleanupFailure.kind === 'backup' && path.includes('.hyper-export-backup-')) ||
        (cleanupFailure.kind === 'staging' &&
          path.includes('.hyper-export-') &&
          !path.includes('.hyper-export-backup-') &&
          !path.includes('/replacement/')))
        ? Promise.reject(
            Object.assign(new Error(`EPERM: operation not permitted, rm '${path}'`), {
              code: 'EPERM',
            }),
          )
        : actual.rm(path, options),
  };
});

/**
 * One Space, and it is Meta: what is under test is the destination swap, and a
 * second Space would add directories to copy without adding a way for the swap
 * to fail. The whole-aggregate shapes belong to `aggregate-round-trip.test.ts`.
 */
const storedSpace: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 1, title: 'Stored talk' },
    things: [
      {
        id: THING_ID,
        document: { title: 'Stored thing', kind: 'markdown', body: 'Stored body.\n' },
      },
    ],
  },
  revision: 7n,
  exportedRevision: null,
};

const temporaryDirectories = new Set<string>();

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-export-cleanup-'));
  temporaryDirectories.add(directory);
  return directory;
};

/**
 * A destination a previous export left behind, in the shape this one will find
 * it: the Space's file inside the directory named for its id. Its content is
 * recognizable rather than canonical, so a test can tell "still the old bytes"
 * from "rewritten" without parsing anything.
 */
const previouslyExported = async (destination: string): Promise<void> => {
  await mkdir(join(destination, SPACE_ID), { recursive: true });
  await writeFile(join(destination, SPACE_ID, 'space.json'), 'previous space\n');
};

afterEach(async () => {
  cleanupFailure.kind = undefined;
  cleanupFailure.replacementWrite = false;
  for (const directory of temporaryDirectories) {
    await rm(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
});

describe('canonical export recovery cleanup', () => {
  it('reports a completed export when the recovery copy cannot be removed after the swap', async () => {
    cleanupFailure.kind = 'backup';
    const destination = join(await makeTemporaryDirectory(), 'exported');
    await previouslyExported(destination);
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);

    await expect(exportAggregate(repository, destination)).resolves.toMatchObject({
      kind: 'exported',
    });

    await expect(
      readFile(join(destination, SPACE_ID, 'things', `${THING_ID}.md`), 'utf8'),
    ).resolves.toContain(`id: ${THING_ID}`);
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: 7n,
    });
  });

  it('reports a completed export when its staging directory cannot be removed afterward', async () => {
    cleanupFailure.kind = 'staging';
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);

    await expect(exportAggregate(repository, destination)).resolves.toMatchObject({
      kind: 'exported',
    });

    await expect(
      readFile(join(destination, SPACE_ID, 'things', `${THING_ID}.md`), 'utf8'),
    ).resolves.toContain(`id: ${THING_ID}`);
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: 7n,
    });
  });

  it('preserves the export failure when staging cleanup also fails', async () => {
    cleanupFailure.kind = 'staging';
    const destination = join(await makeTemporaryDirectory(), 'exported');
    await previouslyExported(destination);
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    cleanupFailure.replacementWrite = true;

    await expect(exportAggregate(repository, destination)).rejects.toMatchObject({
      code: 'ENOSPC',
    });

    await expect(readFile(join(destination, SPACE_ID, 'space.json'), 'utf8')).resolves.toBe(
      'previous space\n',
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });
});
