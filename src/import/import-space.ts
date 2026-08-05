import type { LoadedSpace } from '@project/persistence';
import type {
  ImportMode,
  RepositoryImportResult,
  SpaceRepository,
} from '../persistence/space-repository';
import { readImportBatch, readSingleSpace } from './read-single-space';

type SpaceImportErrorKind = 'identity' | 'domain-validation';

export class SpaceImportError extends Error {
  readonly kind: SpaceImportErrorKind;

  constructor(kind: SpaceImportErrorKind, message: string) {
    super(message);
    this.name = 'SpaceImportError';
    this.kind = kind;
  }
}

export const requireImportedSpaces = (result: RepositoryImportResult): readonly LoadedSpace[] => {
  if (result.kind === 'imported') return result.spaces;

  throw new SpaceImportError(
    result.code === 'invalid-snapshot' ? 'domain-validation' : 'identity',
    result.message,
  );
};

export const importSingleSpace = async (
  path: string,
  repository: SpaceRepository,
): Promise<LoadedSpace> => {
  const input = await readSingleSpace(path);
  const storedSpaces = requireImportedSpaces(await repository.importSpaces([input], 'insert'));
  const [stored] = storedSpaces;
  if (stored === undefined || storedSpaces.length !== 1) {
    throw new Error(`Single-space import returned ${storedSpaces.length} spaces`);
  }
  return stored;
};

export const importSpaceBatch = async (
  path: string,
  repository: SpaceRepository,
  mode: ImportMode = 'insert',
): Promise<readonly LoadedSpace[]> => {
  const input = await readImportBatch(path);
  return requireImportedSpaces(await repository.importSpaces(input, mode));
};
