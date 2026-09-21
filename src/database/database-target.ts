import type { SpaceRepository } from '../persistence/space-repository';

export interface OpenedDatabaseTarget {
  readonly repository: SpaceRepository;
  close(): Promise<void>;
}

export interface DatabaseTarget {
  open(): Promise<OpenedDatabaseTarget>;
}

/** A composition error whose message is already the complete operator-facing diagnostic. */
export class DatabaseTargetConfigurationError extends Error {}
