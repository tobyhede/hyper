import { readImportBatch, readSingleSpace } from './read-single-space';
import type {
  ImportMode,
  RepositoryImportResult,
  SpaceRepository,
  StoredSpace,
} from '../persistence/space-repository';

type SpaceImportErrorKind = 'identity' | 'domain-validation' | 'revision-conflict';

export class SpaceImportError extends Error {
  readonly kind: SpaceImportErrorKind;

  constructor(kind: SpaceImportErrorKind, message: string) {
    super(message);
    this.name = 'SpaceImportError';
    this.kind = kind;
  }
}

const requireImportedSpaces = (result: RepositoryImportResult): readonly StoredSpace[] => {
  if (result.kind === 'imported') return result.spaces;

  if (result.kind === 'conflict') {
    throw new SpaceImportError(
      'revision-conflict',
      `Revision conflict for space ${result.current.snapshot.id}`,
    );
  }

  throw new SpaceImportError(
    result.code === 'invalid-snapshot' ? 'domain-validation' : 'identity',
    result.message,
  );
};

export const importSingleSpace = async (
  path: string,
  repository: SpaceRepository,
): Promise<StoredSpace> => {
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
): Promise<readonly StoredSpace[]> => {
  const input = await readImportBatch(path);
  return requireImportedSpaces(await repository.importSpaces(input, mode));
};
