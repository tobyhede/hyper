import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema, type UUID } from '@project/core';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import { db } from '../../src/prisma/db';
import { readSingleSpace } from '../../src/import/read-single-space';

const IMPORTED_SPACE_ID = uuidSchema.parse('d1111111-1111-4111-8111-111111111111');
const MALFORMED_SPACE_ID = uuidSchema.parse('d2222222-2222-4222-8222-222222222222');
const UNRELATED_SPACE_ID = uuidSchema.parse('d3333333-3333-4333-8333-333333333333');
const EXACT_IMPORTED_SPACE_ID = uuidSchema.parse('d4444444-4444-4444-8444-444444444444');
const FIRST_BATCH_SPACE_ID = uuidSchema.parse('d5555555-5555-4555-8555-555555555555');
const SECOND_BATCH_SPACE_ID = uuidSchema.parse('d6666666-6666-4666-8666-666666666666');
const EXPORTED_CARD_ID = uuidSchema.parse('d7777777-7777-4777-8777-777777777777');

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

const CLI_PROCESS_TIMEOUT_MS = 10_000;

const runHyperCommand = (args: readonly string[]): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['--silent', 'hyper', '--', ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    const settle = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdout.removeListener('data', captureStdout);
      child.stderr.removeListener('data', captureStderr);
      child.removeListener('error', handleError);
      child.removeListener('close', handleClose);
      complete();
    };
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeoutError = new Error(`hyper CLI command timed out after ${CLI_PROCESS_TIMEOUT_MS}ms`);
    const captureStdout = (chunk: string): void => {
      stdout += chunk;
    };
    const captureStderr = (chunk: string): void => {
      stderr += chunk;
    };
    const handleError = (error: Error): void => {
      settle(() => reject(timedOut ? timeoutError : error));
    };
    const handleClose = (status: number | null): void => {
      settle(() => {
        if (timedOut) reject(timeoutError);
        else resolve({ status, stdout, stderr });
      });
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', captureStdout);
    child.stderr.on('data', captureStderr);
    child.once('error', handleError);
    child.once('close', handleClose);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, CLI_PROCESS_TIMEOUT_MS);
  });

describe('hyper CLI', () => {
  const repository = new PostgresSpaceRepository(db);
  const createdSpaceIds = new Set<UUID>();
  const temporaryDirectories = new Set<string>();

  const makeSpaceDirectory = async (
    spaceId: UUID,
    title = 'CLI imported talk',
  ): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), 'hyper-cli-integration-'));
    temporaryDirectories.add(directory);
    createdSpaceIds.add(spaceId);
    await mkdir(join(directory, 'cards'));
    await writeFile(
      join(directory, 'space.json'),
      JSON.stringify({ version: 1, id: spaceId, title }),
    );
    return directory;
  };

  const seedSpace = async (spaceId: UUID, title: string): Promise<void> => {
    const result = await repository.importSpaces(
      [{ id: spaceId, document: { version: 1, title }, cards: [] }],
      'insert',
    );
    if (result.kind !== 'imported') throw new Error(`Could not seed space ${spaceId}`);
    createdSpaceIds.add(spaceId);
  };

  const writeSpaceDirectory = async (
    directory: string,
    spaceId: UUID,
    title: string,
  ): Promise<void> => {
    createdSpaceIds.add(spaceId);
    await mkdir(directory);
    await writeFile(
      join(directory, 'space.json'),
      JSON.stringify({ version: 1, id: spaceId, title }),
    );
  };

  afterEach(async () => {
    await db.orm.public.RepositoryState.where({ singletonId: 1 }).delete();
    for (const spaceId of createdSpaceIds) {
      await db.orm.public.Card.where({ spaceId }).deleteAll();
      await db.orm.public.Space.where({ id: spaceId }).delete();
    }
    createdSpaceIds.clear();
    await Promise.all(
      [...temporaryDirectories].map((directory) => rm(directory, { recursive: true })),
    );
    temporaryDirectories.clear();
  });

  afterAll(async () => {
    await db.close();
  });

  it('imports through the real command and durably reports the stored space', async () => {
    const directory = await makeSpaceDirectory(IMPORTED_SPACE_ID);
    await writeFile(
      join(directory, 'cards', 'opening.md'),
      '---\ntitle: Opening\n---\nDurable CLI body.\n',
    );

    const result = await runHyperCommand([directory]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`Imported space ${IMPORTED_SPACE_ID} at revision 0\n`);
    expect(result.stderr).toBe('');
    const stored = await repository.loadSpace(IMPORTED_SPACE_ID);
    expect(stored?.revision).toBe(0n);
    expect(stored?.snapshot.document).toEqual({
      version: 1,
      title: 'CLI imported talk',
    });
    expect(stored?.snapshot.cards).toHaveLength(1);
    expect(uuidSchema.safeParse(stored?.snapshot.cards[0]?.id).success).toBe(true);
    expect(stored?.snapshot.cards[0]?.document).toEqual({
      title: 'Opening',
      kind: 'markdown',
      body: 'Durable CLI body.\n',
    });

    const selected = await runHyperCommand(['entry', IMPORTED_SPACE_ID]);
    expect(selected).toEqual({
      status: 0,
      stdout: `Selected Entry Space ${IMPORTED_SPACE_ID}\n`,
      stderr: '',
    });
    await expect(repository.entrySpaceId()).resolves.toBe(IMPORTED_SPACE_ID);
  });

  it('exports through the real command and records the projected PostgreSQL revision', async () => {
    const snapshot = {
      id: IMPORTED_SPACE_ID,
      document: { version: 1 as const, title: 'CLI exported talk' },
      cards: [
        {
          id: EXPORTED_CARD_ID,
          document: {
            title: 'Exported card',
            kind: 'markdown' as const,
            body: 'Canonical export.\n',
          },
        },
      ],
    };
    const imported = await repository.importSpaces([snapshot]);
    if (imported.kind !== 'imported') throw new Error(imported.message);
    createdSpaceIds.add(IMPORTED_SPACE_ID);
    const destination = await mkdtemp(join(tmpdir(), 'hyper-cli-export-'));
    temporaryDirectories.add(destination);

    const result = await runHyperCommand(['export', IMPORTED_SPACE_ID, destination]);

    expect(result).toEqual({
      status: 0,
      stdout: `Exported space ${IMPORTED_SPACE_ID} at revision 0 to ${destination}\n`,
      stderr: '',
    });
    await expect(readSingleSpace(destination)).resolves.toEqual({
      id: snapshot.id,
      document: snapshot.document,
      cards: snapshot.cards,
    });
    await expect(
      readFile(join(destination, 'cards', `${EXPORTED_CARD_ID}.md`), 'utf8'),
    ).resolves.toContain(`id: ${EXPORTED_CARD_ID}`);
    await expect(repository.loadSpace(IMPORTED_SPACE_ID)).resolves.toEqual({
      snapshot,
      revision: 0n,
      exportedRevision: 0n,
    });
  });

  it('creates and opens a fully identified new space when the database is empty', async () => {
    const result = await runHyperCommand([]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const catalog = await repository.listSpaces();
    expect(catalog).toHaveLength(1);
    const created = catalog[0];
    if (created === undefined) throw new Error('Expected the new space in the catalog');
    createdSpaceIds.add(created.id);
    expect(result.stdout).toBe(`Opened space ${created.id} at revision 0\n`);
    expect(created.title).toBe('New space');
    const stored = await repository.loadSpace(created.id);
    // A new Space begins complete: its Card is already placed in an authored
    // default Layout with one empty Active Graph (ADR 0079, ADR 0080). Every id
    // in it is minted, so the shape is asserted against the ones that arrived.
    const layout = stored?.snapshot.document.layouts?.[0];
    if (layout === undefined) throw new Error('Expected the new space to arrive with its Layout');
    const graph = layout.graphs[0];
    if (graph === undefined) throw new Error('Expected the new Layout to arrive with its Graph');
    const cardId = stored?.snapshot.cards[0]?.id;
    if (cardId === undefined) throw new Error('Expected the new space to arrive with its Card');
    expect(stored).toEqual({
      snapshot: {
        id: created.id,
        document: {
          version: 1,
          title: 'New space',
          layouts: [
            {
              id: layout.id,
              title: 'Layout 1',
              kind: 'positioned',
              positions: { [cardId]: { x: 0, y: 0, open: false } },
              graphs: [{ id: graph.id, title: 'Graph 1', edges: [] }],
              activeGraph: graph.id,
            },
          ],
          defaultLayout: layout.id,
        },
        cards: [
          {
            id: cardId,
            document: { title: 'Card 1', kind: 'markdown', body: '' },
          },
        ],
      },
      revision: 0n,
      exportedRevision: null,
    });
    for (const id of [cardId, layout.id, graph.id]) {
      expect(uuidSchema.safeParse(id).success).toBe(true);
    }
  });

  it('reopens the sole stored space without duplicating it', async () => {
    const firstResult = await runHyperCommand([]);
    expect(firstResult.status).toBe(0);
    const firstCatalog = await repository.listSpaces();
    const created = firstCatalog[0];
    if (created === undefined) throw new Error('Expected the first command to create a space');
    createdSpaceIds.add(created.id);
    const firstStored = await repository.loadSpace(created.id);
    expect(firstResult).toEqual({
      status: 0,
      stdout: `Opened space ${created.id} at revision 0\n`,
      stderr: '',
    });
    expect(firstStored?.revision).toBe(0n);

    const secondResult = await runHyperCommand([]);

    expect(secondResult).toEqual({
      status: 0,
      stdout: `Opened space ${created.id} at revision 0\n`,
      stderr: '',
    });
    await expect(repository.listSpaces()).resolves.toEqual([created]);
    await expect(repository.loadSpace(created.id)).resolves.toEqual(firstStored);
  });

  it('imports the exact Space without changing Entry Space', async () => {
    await seedSpace(UNRELATED_SPACE_ID, 'Unrelated talk');
    const directory = await makeSpaceDirectory(EXACT_IMPORTED_SPACE_ID, 'Fresh imported talk');

    const result = await runHyperCommand([directory]);

    expect(result).toEqual({
      status: 0,
      stdout: `Imported space ${EXACT_IMPORTED_SPACE_ID} at revision 0\n`,
      stderr: '',
    });
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: UNRELATED_SPACE_ID, title: 'Unrelated talk' },
      { id: EXACT_IMPORTED_SPACE_ID, title: 'Fresh imported talk' },
    ]);
    await expect(repository.loadSpace(EXACT_IMPORTED_SPACE_ID)).resolves.toMatchObject({
      snapshot: {
        id: EXACT_IMPORTED_SPACE_ID,
        document: { title: 'Fresh imported talk' },
      },
      revision: 0n,
    });
  });

  it('imports multiple spaces without inferring an Entry Space', async () => {
    await seedSpace(UNRELATED_SPACE_ID, 'Unrelated talk');
    const collection = await mkdtemp(join(tmpdir(), 'hyper-cli-collection-'));
    temporaryDirectories.add(collection);
    await writeSpaceDirectory(join(collection, 'first'), FIRST_BATCH_SPACE_ID, 'First imported');
    await writeSpaceDirectory(join(collection, 'second'), SECOND_BATCH_SPACE_ID, 'Second imported');

    const result = await runHyperCommand([collection]);

    expect(result).toEqual({
      status: 0,
      stdout:
        `Imported space ${FIRST_BATCH_SPACE_ID} at revision 0\n` +
        `Imported space ${SECOND_BATCH_SPACE_ID} at revision 0\n`,
      stderr: '',
    });
    expect(result.stderr).not.toContain(collection);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: UNRELATED_SPACE_ID, title: 'Unrelated talk' },
      { id: FIRST_BATCH_SPACE_ID, title: 'First imported' },
      { id: SECOND_BATCH_SPACE_ID, title: 'Second imported' },
    ]);
    await expect(repository.loadSpace(FIRST_BATCH_SPACE_ID)).resolves.toMatchObject({
      snapshot: { id: FIRST_BATCH_SPACE_ID },
      revision: 0n,
    });
    await expect(repository.loadSpace(SECOND_BATCH_SPACE_ID)).resolves.toMatchObject({
      snapshot: { id: SECOND_BATCH_SPACE_ID },
      revision: 0n,
    });
  });

  it('reports a malformed card path and stores no partial space', async () => {
    const directory = await makeSpaceDirectory(MALFORMED_SPACE_ID);
    const cardPath = join(directory, 'cards', 'broken.md');
    await writeFile(cardPath, 'Missing frontmatter.\n');

    const result = await runHyperCommand([directory]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(cardPath);
    await expect(repository.loadSpace(MALFORMED_SPACE_ID)).resolves.toBeUndefined();
  });
});
