import { randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UUID } from '@project/core';
import { z } from 'zod';
import { isMissingFile } from '../aggregate-directory';
import { describeError } from '../cli/describe-error';
import { describeRunRefusal } from '../cli/run-refusal';
import { checkAggregate } from '../run/run';

const INSTRUCTIONS = `This server edits one InfinityCube Aggregate directory: a talk's Spaces, Maps, Graphs and Resources as JSON and Markdown files. The format is https://github.com/tobyhede/infinity-cube/blob/main/docs/aggregate-directory.md. Call check after editing; it Imports the directory as pnpm cube run does and answers what it refuses. A run serving this directory overwrites what you write, so edit only a directory no run is serving.`;

const answer = (text: string): CallToolResult => ({ content: [{ type: 'text', text }] });

const refuse = (text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
});

class PathRefusal extends Error {}

/**
 * The absolute path `path` names inside `root`, refusing an absolute path, one
 * that leaves `root`, one naming a dot-entry, which Import does not read, and
 * the directory itself.
 */
const lexicallyInside = (root: string, path: string): string => {
  if (isAbsolute(path))
    throw new PathRefusal(`${path} is absolute; name a path inside the directory.`);
  const target = resolve(root, path);
  const inside = relative(root, target);
  if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new PathRefusal(`${path} is not a file inside the directory.`);
  }
  if (inside.split(sep).some((segment) => segment.startsWith('.'))) {
    throw new PathRefusal(`${path} names a dot-entry, which this server does not touch.`);
  }
  return target;
};

/**
 * Refuse `target` when its nearest existing ancestor, or `target` itself when
 * it exists, resolves outside `root` through a symbolic link.
 */
const physicallyInside = async (root: string, target: string, path: string): Promise<void> => {
  const realRoot = await realpath(root);
  for (let candidate = target; ; candidate = dirname(candidate)) {
    let real: string;
    try {
      real = await realpath(candidate);
    } catch (error) {
      if (isMissingFile(error) && candidate !== root) continue;
      throw error;
    }
    const inside = relative(realRoot, real);
    if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
      throw new PathRefusal(`${path} leaves the directory through a symbolic link.`);
    }
    return;
  }
};

/** The file `path` names inside `root`, refused unless it is inside lexically and physically. */
const fileInside = async (root: string, path: string): Promise<string> => {
  const target = lexicallyInside(root, path);
  await physicallyInside(root, target, path);
  return target;
};

/** Every file under `root` by `/`-separated relative path, leaving out dot-entries and not following links. */
const filesUnder = async (root: string, prefix = ''): Promise<string[]> => {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await filesUnder(root, path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
};

/** Run one tool's work, answering a refused path or a failed read or write as a tool error. */
const attempt = async (work: () => Promise<CallToolResult>): Promise<CallToolResult> => {
  try {
    return await work();
  } catch (error) {
    return refuse(error instanceof PathRefusal ? error.message : describeError(error));
  }
};

/**
 * An MCP server whose tools list, read, write and delete the files of the
 * Aggregate directory `directory` and check it as `pnpm cube check` does.
 */
export const createAggregateMcpServer = (directory: string, newId: () => UUID): McpServer => {
  const server = new McpServer(
    { name: 'infinity-cube', version: '0.0.0' },
    { instructions: INSTRUCTIONS },
  );
  const path = z.string().describe('A file path relative to the Aggregate directory');

  server.registerTool(
    'list_files',
    {
      description: 'List every file in the Aggregate directory, by path relative to it',
      annotations: { readOnlyHint: true },
    },
    () => attempt(async () => answer((await filesUnder(directory)).sort().join('\n'))),
  );

  server.registerTool(
    'read_file',
    {
      description: "Read a file's text",
      inputSchema: { path },
      annotations: { readOnlyHint: true },
    },
    ({ path: file }) =>
      attempt(async () => answer(await readFile(await fileInside(directory, file), 'utf8'))),
  );

  server.registerTool(
    'write_file',
    {
      description: 'Create or replace a file, creating its parent directories',
      inputSchema: { path, content: z.string().describe("The file's complete new text") },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    ({ path: file, content }) =>
      attempt(async () => {
        const target = await fileInside(directory, file);
        await mkdir(dirname(target), { recursive: true });
        const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`;
        await writeFile(temporary, content);
        try {
          await rename(temporary, target);
        } catch (error) {
          await rm(temporary, { force: true });
          throw error;
        }
        return answer(`Wrote ${file}.`);
      }),
  );

  server.registerTool(
    'delete_file',
    {
      description: 'Delete one file',
      inputSchema: { path },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    ({ path: file }) =>
      attempt(async () => {
        const target = await fileInside(directory, file);
        if (!(await lstat(target)).isFile()) throw new PathRefusal(`${file} is not a file.`);
        await rm(target);
        return answer(`Deleted ${file}.`);
      }),
  );

  server.registerTool(
    'check',
    {
      description:
        'Import the Aggregate directory as pnpm cube run does, answering whether it is accepted and, if not, why',
      annotations: { readOnlyHint: true },
    },
    () =>
      attempt(async () => {
        const result = await checkAggregate(directory, newId);
        return answer(
          result.kind === 'valid'
            ? `${directory} is a valid aggregate.\n`
            : describeRunRefusal(result, directory),
        );
      }),
  );

  return server;
};
