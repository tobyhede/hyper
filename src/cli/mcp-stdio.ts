import type { Readable, Writable } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { UUID } from '@project/core';
import { createAggregateMcpServer } from '../mcp/aggregate-mcp-server';

/**
 * Serve the MCP server for `directory` on `input` and `output` until the
 * client closes them, or `output` fails because the client has gone. `output`
 * carries the protocol alone, so nothing else here writes to it.
 */
export const serveMcpOverStdio = async (
  directory: string,
  newId: () => UUID,
  input: Readable,
  output: Writable,
): Promise<number> => {
  const server = createAggregateMcpServer(directory, newId);
  const closed = new Promise<void>((resolve) => {
    server.server.onclose = resolve;
    input.once('end', resolve);
    output.once('error', () => resolve());
  });
  await server.connect(new StdioServerTransport(input, output));
  await closed;
  await server.close();
  return 0;
};
