import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema } from '@project/core';
import { imagePath, type LoadedSpace } from '@project/persistence';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportAggregate } from '../../src/export/export-aggregate';
import { MemorySpaceRepository } from '../../src/persistence/memory-space-repository';
import { admitted, pngBytes } from '../support/stored-images';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const RESOURCE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const PICTURE_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');

// SAFETY: `kind` starts `undefined` but is reassigned to 'backup'/'staging'
// later (per test) — the cast states the mutable field's real type up front
// rather than letting the initializer narrow it to the literal `undefined`.
const cleanupFailure = vi.hoisted(() => ({
  kind: undefined as 'backup' | 'staging' | undefined,
  replacementWrite: false,
  imageWrite: false,
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
      // A Space's file sits under its own id inside the staged aggregate, so
      // the aggregate file at the replacement root is already written by the time this
      // fires — which is the point: the failure lands part-way through staging,
      // where the destination has not been touched yet.
      typeof path === 'string' &&
      path.includes('.hyper-export-') &&
      ((cleanupFailure.replacementWrite && path.endsWith(`/replacement/${SPACE_ID}/space.json`)) ||
        (cleanupFailure.imageWrite && path.includes('/replacement/images/')))
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
    resources: [
      {
        id: RESOURCE_ID,
        document: { title: 'Stored resource', kind: 'markdown', body: 'Stored body.\n' },
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
  cleanupFailure.imageWrite = false;
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
      readFile(join(destination, SPACE_ID, 'resources', `${RESOURCE_ID}.md`), 'utf8'),
    ).resolves.toContain(`id: ${RESOURCE_ID}`);
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
      readFile(join(destination, SPACE_ID, 'resources', `${RESOURCE_ID}.md`), 'utf8'),
    ).resolves.toContain(`id: ${RESOURCE_ID}`);
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

  /*
   * Image bytes are staged with everything else, so a failure writing one
   * leaves the destination exactly as the previous export left it — its
   * pictures included — and records nothing.
   */
  it('leaves the previous destination whole when writing an image fails', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    await previouslyExported(destination);
    await mkdir(join(destination, 'images'));
    await writeFile(join(destination, 'images', 'previous.png'), 'previous image\n');
    const image = await admitted(pngBytes(1));
    const pictured: LoadedSpace = {
      ...storedSpace,
      snapshot: {
        ...storedSpace.snapshot,
        resources: [
          ...storedSpace.snapshot.resources,
          {
            id: PICTURE_ID,
            document: { title: 'Picture', kind: 'image', url: imagePath(image.id) },
          },
        ],
      },
    };
    const repository = new MemorySpaceRepository([pictured], SPACE_ID);
    await repository.storeImage(image);
    cleanupFailure.imageWrite = true;

    await expect(exportAggregate(repository, destination)).rejects.toMatchObject({
      code: 'ENOSPC',
    });

    await expect(readFile(join(destination, SPACE_ID, 'space.json'), 'utf8')).resolves.toBe(
      'previous space\n',
    );
    await expect(readFile(join(destination, 'images', 'previous.png'), 'utf8')).resolves.toBe(
      'previous image\n',
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });
});
