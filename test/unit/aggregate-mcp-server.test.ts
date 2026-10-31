import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { newUuid, uuidSchema } from '@project/core';
import { AGGREGATE_FILE_NAME } from '@project/aggregate';
import { afterEach, describe, expect, it } from 'vitest';
import { describeRunRefusal } from '../../src/cli/run-refusal';
import { createAggregateMcpServer } from '../../src/mcp/aggregate-mcp-server';
import { checkAggregate } from '../../src/run/run';
import { markdownResourceFiles, writeAggregateInto } from '../support/aggregate-directory';
import { callTool } from '../support/mcp-tool-answer';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OPENING_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');

const temporaryDirectories: string[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'infinity-cube-mcp-unit-'));
  temporaryDirectories.push(directory);
  return directory;
};

const writeTalk = async (root?: string): Promise<string> =>
  writeAggregateInto(root ?? (await makeTemporaryDirectory()), SPACE_ID, [
    {
      name: SPACE_ID,
      spaceFile: JSON.stringify({ version: 1, id: SPACE_ID, title: 'Talk' }),
      resources: markdownResourceFiles(OPENING_ID, 'Opening', 'Hello.\n'),
    },
  ]);

/** Every file under `directory`, by relative path, with its contents. */
const filesUnder = async (directory: string): Promise<Record<string, string>> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files: Record<string, string> = {};
  for (const entry of entries.filter((candidate) => candidate.isFile())) {
    const path = join(entry.parentPath, entry.name);
    files[relative(directory, path)] = await readFile(path, 'base64');
  }
  return files;
};

/** A client connected in memory to the server for `directory`, as a local MCP client connects. */
const connect = async (directory: string): Promise<Client> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createAggregateMcpServer(directory, newUuid).connect(serverTransport);
  const client = new Client({ name: 'aggregate-mcp-server-test', version: '0.0.0' });
  await client.connect(clientTransport);
  clients.push(client);
  return client;
};

describe('the Aggregate directory MCP server', () => {
  it('offers exactly the file tools and check', async () => {
    const client = await connect(await writeTalk());

    const { tools } = await client.listTools();

    expect(tools.map(({ name }) => name).sort()).toEqual([
      'check',
      'delete_file',
      'list_files',
      'read_file',
      'write_file',
    ]);
  });

  it('lists every file by its path relative to the directory, leaving out dot-entries', async () => {
    const directory = await writeTalk();
    await mkdir(join(directory, '.git'));
    await writeFile(join(directory, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await writeFile(join(directory, SPACE_ID, '.DS_Store'), '');
    const client = await connect(directory);

    const answer = await callTool(client, 'list_files');

    expect(answer.isError).toBe(false);
    expect(answer.text.split('\n')).toEqual([
      `${SPACE_ID}/resources/${OPENING_ID}.json`,
      `${SPACE_ID}/resources/${OPENING_ID}.md`,
      `${SPACE_ID}/space.json`,
      AGGREGATE_FILE_NAME,
    ]);
  });

  it("reads a file's text", async () => {
    const client = await connect(await writeTalk());

    const answer = await callTool(client, 'read_file', {
      path: `${SPACE_ID}/resources/${OPENING_ID}.md`,
    });

    expect(answer).toEqual({ text: 'Hello.\n', isError: false });
  });

  it('writes a new file, creating its parent directories, and replaces an existing one', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);
    const sidecar = `${SPACE_ID}/resources/${OPENING_ID}.md`;

    const created = await callTool(client, 'write_file', {
      path: 'notes/draft/outline.md',
      content: '# Outline\n',
    });
    const replaced = await callTool(client, 'write_file', { path: sidecar, content: 'Goodbye.\n' });

    expect(created.isError).toBe(false);
    expect(replaced.isError).toBe(false);
    await expect(readFile(join(directory, 'notes/draft/outline.md'), 'utf8')).resolves.toBe(
      '# Outline\n',
    );
    await expect(readFile(join(directory, sidecar), 'utf8')).resolves.toBe('Goodbye.\n');
    expect(Object.keys(await filesUnder(directory)).sort()).toEqual(
      [
        AGGREGATE_FILE_NAME,
        'notes/draft/outline.md',
        `${SPACE_ID}/resources/${OPENING_ID}.json`,
        sidecar,
        `${SPACE_ID}/space.json`,
      ].sort(),
    );
  });

  it('deletes one file', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);

    const answer = await callTool(client, 'delete_file', {
      path: `${SPACE_ID}/resources/${OPENING_ID}.md`,
    });

    expect(answer.isError).toBe(false);
    expect(Object.keys(await filesUnder(directory))).not.toContain(
      `${SPACE_ID}/resources/${OPENING_ID}.md`,
    );
  });

  it('checks an accepted directory as cube check does', async () => {
    const directory = await writeTalk();
    const client = await connect(directory);

    const answer = await callTool(client, 'check');

    expect(answer).toEqual({ text: `${directory} is a valid aggregate.\n`, isError: false });
  });

  it('checks a refused directory with the problems cube check prints', async () => {
    const directory = await writeTalk();
    await rm(join(directory, SPACE_ID, 'resources', `${OPENING_ID}.md`));
    const refused = await checkAggregate(directory, newUuid);
    if (refused.kind === 'valid') throw new Error('Import accepted a missing sidecar');
    const client = await connect(directory);

    const answer = await callTool(client, 'check');

    expect(answer).toEqual({ text: describeRunRefusal(refused, directory), isError: false });
    expect(answer.text).toContain(OPENING_ID);
  });

  it.each([
    { tool: 'read_file', path: '/etc/passwd' },
    { tool: 'read_file', path: '../outside.txt' },
    { tool: 'read_file', path: `${SPACE_ID}/../../outside.txt` },
    { tool: 'read_file', path: '.git/HEAD' },
    { tool: 'read_file', path: `${SPACE_ID}/.hidden` },
    { tool: 'read_file', path: '' },
    { tool: 'read_file', path: 'linked/secret.txt' },
    { tool: 'write_file', path: '../outside.txt' },
    { tool: 'write_file', path: '.git/config' },
    { tool: 'write_file', path: 'linked/secret.txt' },
    { tool: 'write_file', path: 'linked/new/file.txt' },
    { tool: 'write_file', path: '.' },
    { tool: 'delete_file', path: '../outside.txt' },
    { tool: 'delete_file', path: '.git/HEAD' },
    { tool: 'delete_file', path: 'linked/secret.txt' },
  ])('refuses $tool on $path, touching nothing', async ({ tool, path }) => {
    const outside = await makeTemporaryDirectory();
    await writeFile(join(outside, 'secret.txt'), 'secret\n');
    const parent = await makeTemporaryDirectory();
    await writeFile(join(parent, 'outside.txt'), 'outside\n');
    const directory = join(parent, 'talk');
    await mkdir(directory);
    await writeTalk(directory);
    await mkdir(join(directory, '.git'));
    await writeFile(join(directory, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await symlink(outside, join(directory, 'linked'));
    const before = await filesUnder(parent);
    const outsideBefore = await filesUnder(outside);
    const client = await connect(directory);

    const answer = await callTool(client, tool, { path, content: 'overwritten\n' });

    expect(answer.isError).toBe(true);
    expect(answer.text).toMatch(/absolute|not a file inside|dot-entry|symbolic link/);
    expect(answer.text).not.toMatch(/secret\n|outside\n|ref: refs/);
    expect(await filesUnder(parent)).toEqual(before);
    expect(await filesUnder(outside)).toEqual(outsideBefore);
  });
});
