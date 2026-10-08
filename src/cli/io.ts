/** The two streams every `hyper` verb reports through. */
export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}
