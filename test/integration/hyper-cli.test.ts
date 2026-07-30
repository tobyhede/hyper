import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema, type UUID } from '@project/core';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import { db } from '../../src/prisma/db';

const IMPORTED_SPACE_ID = uuidSchema.parse('d1111111-1111-4111-8111-111111111111');
const MALFORMED_SPACE_ID = uuidSchema.parse('d2222222-2222-4222-8222-222222222222');

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

const COMMAND_TIMEOUT_MS = 30_000;

const runHyperCommand = (path: string): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['--silent', 'hyper', '--', path], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    const settle = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      complete();
    };
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', (error) => {
      settle(() => {
        child.kill('SIGKILL');
        reject(error);
      });
    });
    child.once('close', (status) => {
      settle(() => resolve({ status, stdout, stderr }));
    });
    const timeout = setTimeout(() => {
      settle(() => {
        child.kill('SIGKILL');
        reject(new Error(`hyper CLI command timed out after ${COMMAND_TIMEOUT_MS}ms`));
      });
    }, COMMAND_TIMEOUT_MS);
  });

describe('hyper CLI', () => {
  const repository = new PostgresSpaceRepository(db);
  const createdSpaceIds = new Set<UUID>();
  const temporaryDirectories = new Set<string>();

  const makeSpaceDirectory = async (spaceId: UUID): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), 'hyper-cli-integration-'));
    temporaryDirectories.add(directory);
    createdSpaceIds.add(spaceId);
    await mkdir(join(directory, 'cards'));
    await writeFile(
      join(directory, 'space.json'),
      JSON.stringify({ version: 2, id: spaceId, title: 'CLI imported talk', routes: [] }),
    );
    return directory;
  };

  afterEach(async () => {
    for (const spaceId of createdSpaceIds) {
      await db.orm.public.Card.where({ spaceId }).delete();
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

    const result = await runHyperCommand(directory);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`Imported space ${IMPORTED_SPACE_ID} at revision 0\n`);
    expect(result.stderr).toBe('');
    const stored = await repository.loadSpace(IMPORTED_SPACE_ID);
    expect(stored?.revision).toBe(0n);
    expect(stored?.snapshot.document).toEqual({
      version: 2,
      title: 'CLI imported talk',
      routes: [],
    });
    expect(stored?.snapshot.cards).toHaveLength(1);
    expect(uuidSchema.safeParse(stored?.snapshot.cards[0]?.id).success).toBe(true);
    expect(stored?.snapshot.cards[0]?.document).toEqual({
      title: 'Opening',
      kind: 'markdown',
      body: 'Durable CLI body.\n',
    });
  });

  it('reports a malformed card path and stores no partial space', async () => {
    const directory = await makeSpaceDirectory(MALFORMED_SPACE_ID);
    const cardPath = join(directory, 'cards', 'broken.md');
    await writeFile(cardPath, 'Missing frontmatter.\n');

    const result = await runHyperCommand(directory);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(cardPath);
    await expect(repository.loadSpace(MALFORMED_SPACE_ID)).resolves.toBeUndefined();
  });
});
