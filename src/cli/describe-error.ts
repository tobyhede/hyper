/** The message a CLI prints for a thrown value, whatever was thrown. */
export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
