import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportSpace } from '../../src/export/export-space';
import { MemorySpaceRepository } from '../support/memory-space-repository';

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
      cleanupFailure.replacementWrite &&
      typeof path === 'string' &&
      path.includes('.hyper-export-') &&
      path.endsWith('/replacement/space.json')
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

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const CARD_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');

const storedSpace: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 2, title: 'Stored talk', routes: [] },
    cards: [
      {
        id: CARD_ID,
        document: { title: 'Stored card', kind: 'markdown', body: 'Stored body.\n' },
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
    await mkdir(destination);
    await writeFile(join(destination, 'space.json'), 'previous space\n');
    const repository = new MemorySpaceRepository([storedSpace]);

    await expect(exportSpace(repository, SPACE_ID, destination)).resolves.toMatchObject({
      revision: 7n,
    });

    await expect(readFile(join(destination, 'cards', `${CARD_ID}.md`), 'utf8')).resolves.toContain(
      `id: ${CARD_ID}`,
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: 7n,
    });
  });

  it('reports a completed export when its staging directory cannot be removed afterward', async () => {
    cleanupFailure.kind = 'staging';
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const repository = new MemorySpaceRepository([storedSpace]);

    await expect(exportSpace(repository, SPACE_ID, destination)).resolves.toMatchObject({
      revision: 7n,
    });

    await expect(readFile(join(destination, 'cards', `${CARD_ID}.md`), 'utf8')).resolves.toContain(
      `id: ${CARD_ID}`,
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: 7n,
    });
  });

  it('preserves the export failure when staging cleanup also fails', async () => {
    cleanupFailure.kind = 'staging';
    const destination = join(await makeTemporaryDirectory(), 'exported');
    await mkdir(destination);
    await writeFile(join(destination, 'space.json'), 'previous space\n');
    const repository = new MemorySpaceRepository([storedSpace]);
    cleanupFailure.replacementWrite = true;

    await expect(exportSpace(repository, SPACE_ID, destination)).rejects.toMatchObject({
      code: 'ENOSPC',
    });

    await expect(readFile(join(destination, 'space.json'), 'utf8')).resolves.toBe(
      'previous space\n',
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });
});
