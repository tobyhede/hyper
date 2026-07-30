import { readImportBatch, readSingleSpace } from './read-single-space';
import type { ImportMode, SpaceRepository, StoredSpace } from '../persistence/space-repository';

type SingleSpaceImportErrorKind = 'identity' | 'domain-validation' | 'revision-conflict';

export class SingleSpaceImportError extends Error {
  readonly kind: SingleSpaceImportErrorKind;

  constructor(kind: SingleSpaceImportErrorKind, message: string) {
    super(message);
    this.name = 'SingleSpaceImportError';
    this.kind = kind;
  }
}

export const importSingleSpace = async (
  path: string,
  repository: SpaceRepository,
): Promise<StoredSpace> => {
  const input = await readSingleSpace(path);
  const result = await repository.importSpaces([input], 'upsert');
  if (result.kind === 'imported') {
    const [stored] = result.spaces;
    if (stored === undefined || result.spaces.length !== 1) {
      throw new Error(`Single-space import returned ${result.spaces.length} spaces`);
    }
    return stored;
  }

  if (result.kind === 'conflict') {
    throw new SingleSpaceImportError(
      'revision-conflict',
      `Revision conflict for space ${result.current.snapshot.id}`,
    );
  }

  throw new SingleSpaceImportError(
    result.code === 'invalid-snapshot' ? 'domain-validation' : 'identity',
    result.message,
  );
};

export const importSpaceBatch = async (
  path: string,
  repository: SpaceRepository,
  mode: ImportMode = 'upsert',
): Promise<readonly StoredSpace[]> => {
  const input = await readImportBatch(path);
  const result = await repository.importSpaces(input, mode);
  if (result.kind === 'imported') return result.spaces;

  if (result.kind === 'conflict') {
    throw new SingleSpaceImportError(
      'revision-conflict',
      `Revision conflict for space ${result.current.snapshot.id}`,
    );
  }

  throw new SingleSpaceImportError(
    result.code === 'invalid-snapshot' ? 'domain-validation' : 'identity',
    result.message,
  );
};
