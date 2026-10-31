/** The message a CLI prints for a thrown value, whatever was thrown. */
export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** What `cube check` and the MCP `check` tool say when a check could not run. */
export const describeCheckFailure = (directory: string, error: unknown): string =>
  `Could not check ${directory}: ${describeError(error)}\n`;
