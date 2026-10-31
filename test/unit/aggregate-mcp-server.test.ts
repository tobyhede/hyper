import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { newUuid, uuidSchema } from '@project/core';
import { AGGREGATE_FILE_NAME } from '@project/aggregate';
import { afterEach, describe, expect, it } from 'vitest';
import { serveMcpOverStdio } from '../../src/cli/mcp-stdio';
import { describeRunRefusal } from '../../src/cli/run-refusal';
import { createAggregateMcpServer } from '../../src/mcp/aggregate-mcp-server';
import { checkAggregate } from '../../src/run/run';
import {
  filesUnder,
  markdownResourceFiles,
  writeAggregateInto,
} from '../support/aggregate-directory';
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

  it("carries a binary file's bytes unchanged as base64", async () => {
    const directory = await writeTalk();
    const client = await connect(directory);
    const bytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe,
    ]);
    const image = 'images/picture.png';

    const written = await callTool(client, 'write_file', {
      path: image,
      content: Buffer.from(bytes).toString('base64'),
      encoding: 'base64',
    });
    const read = await callTool(client, 'read_file', { path: image, encoding: 'base64' });

    expect(written.isError).toBe(false);
    expect(new Uint8Array(await readFile(join(directory, image)))).toEqual(bytes);
    expect(read).toEqual({ text: Buffer.from(bytes).toString('base64'), isError: false });
  });

  it('refuses to read a file that is not UTF-8 as text, naming base64', async () => {
    const directory = await writeTalk();
    await mkdir(join(directory, 'images'));
    await writeFile(join(directory, 'images', 'picture.png'), Uint8Array.from([0x89, 0xff, 0x00]));
    const client = await connect(directory);

    const answer = await callTool(client, 'read_file', { path: 'images/picture.png' });

    expect(answer.isError).toBe(true);
    expect(answer.text).toContain('base64');
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

    expect(answer).toEqual({ text: describeRunRefusal(refused, directory), isError: true });
    expect(answer.text).toContain(OPENING_ID);
  });

  it('checks an empty directory by saying what to write, naming no command', async () => {
    const directory = await makeTemporaryDirectory();
    const client = await connect(directory);

    const answer = await callTool(client, 'check');

    expect(answer.isError).toBe(true);
    expect(answer.text).toContain(AGGREGATE_FILE_NAME);
    expect(answer.text).not.toContain('pnpm');
  });

  it.each([
    { tool: 'read_file', path: '/etc/passwd' },
    { tool: 'read_file', path: '../outside.txt' },
    { tool: 'read_file', path: `${SPACE_ID}/../../outside.txt` },
    { tool: 'read_file', path: '.git/HEAD' },
    { tool: 'read_file', path: `${SPACE_ID}/.hidden` },
    { tool: 'read_file', path: '' },
    { tool: 'read_file', path: 'linked/secret.txt' },
    { tool: 'write_file', path: '/tmp/written-by-the-mcp-server.txt' },
    { tool: 'write_file', path: '../outside.txt' },
    { tool: 'write_file', path: '.git/config' },
    { tool: 'write_file', path: 'linked/secret.txt' },
    { tool: 'write_file', path: 'linked/new/file.txt' },
    { tool: 'write_file', path: '.' },
    { tool: 'write_file', path: 'dangling/file.txt' },
    { tool: 'write_file', path: `inner/space.json` },
    { tool: 'read_file', path: `inner/space.json` },
    { tool: 'delete_file', path: '/etc/hostname' },
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
    await symlink(join(outside, 'missing'), join(directory, 'dangling'));
    await symlink(join(directory, SPACE_ID), join(directory, 'inner'));
    const before = await filesUnder(parent);
    const outsideBefore = await filesUnder(outside);
    const client = await connect(directory);

    const answer = await callTool(client, tool, { path, content: 'overwritten\n' });

    expect(answer.isError).toBe(true);
    expect(answer.text).toMatch(/absolute|not a file inside|dot-entry|symbolic link/);
    await expect(readFile('/tmp/written-by-the-mcp-server.txt')).rejects.toThrow();
    expect(answer.text).not.toMatch(/secret\n|outside\n|ref: refs/);
    expect(await filesUnder(parent)).toEqual(before);
    expect(await filesUnder(outside)).toEqual(outsideBefore);
  });

  it('serves over a pair of streams until the client ends its input', async () => {
    const directory = await writeTalk();
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: string[] = [];
    output.on('data', (chunk: Buffer) => lines.push(...chunk.toString('utf8').split('\n')));

    const served = serveMcpOverStdio(directory, newUuid, input, output);
    input.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'streams', version: '0.0.0' } } })}\n`,
    );
    input.end();

    await expect(served).resolves.toBe(0);
    const responses = lines.filter((line) => line !== '');
    expect(responses).toHaveLength(1);
    expect(responses[0]).toContain('"serverInfo":{"name":"infinity-cube"');
    expect(responses[0]).toContain('"id":1}');
  });
});
