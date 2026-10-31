import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

/** What a tool call answered: its text content, joined, and whether it reported an error. */
export interface ToolAnswer {
  readonly text: string;
  readonly isError: boolean;
}

/** Call one tool, parsing its answer as the protocol's tool result. */
export const callTool = async (
  client: Client,
  name: string,
  args: Readonly<Record<string, string>> = {},
): Promise<ToolAnswer> => {
  const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));
  const text = result.content.map((item) => (item.type === 'text' ? item.text : '')).join('');
  return { text, isError: result.isError === true };
};
