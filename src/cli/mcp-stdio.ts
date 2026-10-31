import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { UUID } from '@project/core';
import { createAggregateMcpServer } from '../mcp/aggregate-mcp-server';

/**
 * Serve the MCP server for `directory` on the process's own standard input and
 * output until the client closes them. Standard output carries the protocol
 * alone, so nothing else here writes to it.
 */
export const serveMcpOverStdio = async (directory: string, newId: () => UUID): Promise<number> => {
  const server = createAggregateMcpServer(directory, newId);
  const closed = new Promise<void>((resolve) => {
    server.server.onclose = resolve;
    process.stdin.once('end', resolve);
  });
  await server.connect(new StdioServerTransport(process.stdin, process.stdout));
  await closed;
  await server.close();
  return 0;
};
