import { lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UUID } from '@project/core';
import { z } from 'zod';
import { rejectSymbolicLinks, replaceFile } from '../aggregate-directory/write-in-place';
import { describeCheckFailure, describeError } from '../cli/describe-error';
import { describeCheck } from '../cli/run-refusal';

const INSTRUCTIONS = `This server edits one InfinityCube Aggregate directory: a talk's Spaces, Maps, Graphs and Resources as JSON and Markdown files. The format is https://github.com/tobyhede/infinity-cube/blob/main/docs/aggregate-directory.md. Call check after editing; it Imports the directory as pnpm cube run does and answers what it refuses. A run serving this directory overwrites what you write, so edit only a directory no run is serving. Paths are relative to the directory; dot-entries and symbolic links are refused.`;

const answer = (text: string, isError = false): CallToolResult => ({
  content: [{ type: 'text', text }],
  isError,
});

class PathRefusal extends Error {}

/**
 * The absolute path `path` names inside `root`, refusing an absolute path, one
 * that leaves `root`, one naming a dot-entry, which Import does not read, and
 * the directory itself.
 */
const lexicallyInside = (root: string, path: string): string => {
  if (isAbsolute(path)) {
    throw new PathRefusal(`${path} is absolute; name a path inside the directory.`);
  }
  const target = resolve(root, path);
  const inside = relative(root, target);
  if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`)) {
    throw new PathRefusal(`${path} is not a file inside the directory.`);
  }
  if (inside.split(sep).some((segment) => segment.startsWith('.'))) {
    throw new PathRefusal(`${path} names a dot-entry, which this server does not touch.`);
  }
  return target;
};

/** The file `path` names inside `root`, refused unless it is inside and reached through no link. */
const fileInside = async (root: string, path: string): Promise<string> => {
  const target = lexicallyInside(root, path);
  await rejectSymbolicLinks(
    root,
    [relative(root, target)],
    () =>
      new PathRefusal(`${path} passes through a symbolic link, which this server does not follow.`),
  );
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
    return answer(error instanceof PathRefusal ? error.message : describeError(error), true);
  }
};

/**
 * An MCP server whose tools list, read, write and delete the files of the
 * Aggregate directory `directory` and check it as `pnpm cube check` does.
 */
export const createAggregateMcpServer = (given: string, newId: () => UUID): McpServer => {
  const directory = resolve(given);
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
        await replaceFile(target, new TextEncoder().encode(content));
        return answer(`Wrote ${file}.`);
      }),
  );

  server.registerTool(
    'delete_file',
    {
      description: 'Delete one file',
      inputSchema: { path },
      annotations: { destructiveHint: true },
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
    async () => {
      try {
        const { checkAggregate } = await import('../run/run');
        const { accepted, text } = describeCheck(await checkAggregate(directory, newId), directory);
        return answer(text, !accepted);
      } catch (error) {
        return answer(describeCheckFailure(directory, error), true);
      }
    },
  );

  return server;
};
