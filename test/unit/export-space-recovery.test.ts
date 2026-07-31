import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema } from '@project/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportSpace } from '../../src/export/export-space';
import type { StoredSpace } from '../../src/persistence/space-repository';
import { MemorySpaceRepository } from '../support/memory-space-repository';

/**
 * The recovery copy is an implementation detail of the swap, not a deliverable.
 * Failing to remove it once both renames have landed is a housekeeping problem
 * on a completed export, so it must not be reported as a failed export — and it
 * must not skip `markExported`, which would leave the projected revision behind
 * the bytes actually on disk.
 */
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    rm: (path: Parameters<typeof actual.rm>[0], options?: Parameters<typeof actual.rm>[1]) =>
      typeof path === 'string' && path.includes('.hyper-export-backup-')
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

const storedSpace: StoredSpace = {
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
  for (const directory of temporaryDirectories) {
    await rm(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
});

describe('canonical export recovery cleanup', () => {
  it('reports a completed export when the recovery copy cannot be removed after the swap', async () => {
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
});
