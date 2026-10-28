/** The two streams every `cube` verb reports through. */
export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}
