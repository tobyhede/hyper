import {
  thingDocumentSchema,
  spaceDocumentSchema,
  uuidSchema,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceAggregate, loadSpaceSnapshot } from '@project/graph';
import {
  AggregateInvariantError,
  CANONICAL_DECIMAL,
  type AggregateLoadResult,
  type LoadedAggregate,
  type LoadedSpace,
  type RepositoryCommitResult,
  type SpaceCommit,
  type SpaceSummary,
} from '@project/persistence';
import type { SqliteDatabase } from '../sqlite/db';
import { classifyInitializedAggregate } from './aggregate-lifecycle';
import type {
  AggregateInput,
  InitializeAggregateResult,
  ReplaceAggregateResult,
  SpaceRepository,
} from './space-repository';

type Orm = SqliteDatabase['orm'];
type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

class SnapshotValidationError extends Error {}

class ThingOwnershipError extends Error {}

interface SqlPrimaryKeyConflictFields {
  readonly kind?: unknown;
  readonly sqlState?: unknown;
}

const isUniqueViolation = (error: unknown): error is SqlPrimaryKeyConflictFields => {
  if (typeof error !== 'object' || error === null) return false;
  // SAFETY: checked above — error is a non-null object, so probing named
  // fields on it (each still typed unknown until compared) cannot throw.
  const candidate = error as SqlPrimaryKeyConflictFields;
  return candidate.kind === 'sql_query' && candidate.sqlState === '23505';
};

const toRevision = (value: string): bigint => {
  if (!CANONICAL_DECIMAL.test(value)) {
    throw new RangeError(`Database revision ${value} is not a canonical non-negative decimal`);
  }
  return BigInt(value);
};

const toOptionalRevision = (value: string | null): bigint | null =>
  value === null ? null : toRevision(value);

const toDatabaseRevision = (value: bigint): string => {
  const encoded = value.toString();
  if (!CANONICAL_DECIMAL.test(encoded)) {
    throw new RangeError(`Revision ${encoded} is not a canonical non-negative decimal`);
  }
  return encoded;
};

/**
 * SQLite stores Json as TEXT. A full-row read goes through the json codec and
 * answers an object; an `include`/`select` of `document` answers the stored
 * string (`test/integration/sqlite-space-repository.test.ts` initialize/load).
 * Both are valid driver output, so the adapter parses a string here rather
 * than asking the rest of the host to accept two shapes.
 */
const storedJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  // SAFETY: JSON.parse is the stored-document boundary; schemas parse next.
  return JSON.parse(value) as unknown;
};

const toJsonValue = (value: unknown): JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON numbers must be finite');
    return value;
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === 'object') {
    const object: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) object[key] = toJsonValue(child);
    }
    return object;
  }
  throw new TypeError(`Value of type ${typeof value} is not JSON-compatible`);
};

const parseSnapshot = (input: unknown): SpaceSnapshot => {
  const intake = loadSpaceSnapshot(input);
  if (!intake.ok) {
    throw new SnapshotValidationError(intake.errors.map(({ message }) => message).join('\n'));
  }

  return intake.snapshot;
};

const loadStoredSpace = async (orm: Orm, id: UUID): Promise<LoadedSpace | undefined> => {
  const stored = await orm.Space.where({ id })
    .include('things', (things) =>
      things.select('id', 'document').orderBy((thing) => thing.id.asc()),
    )
    .first();
  if (stored === null) return undefined;

  const snapshot = parseSnapshot({
    id: stored.id,
    document: spaceDocumentSchema.parse(storedJson(stored.document)),
    things: stored.things.map((thing) => ({
      id: thing.id,
      document: thingDocumentSchema.parse(storedJson(thing.document)),
    })),
  });

  return {
    snapshot,
    revision: toRevision(stored.revision),
    exportedRevision: toOptionalRevision(stored.exportedRevision),
  };
};

const loadEverySpace = async (orm: Orm): Promise<readonly LoadedSpace[]> => {
  const stored = await orm.Space.orderBy((space) => space.id.asc())
    .include('things', (things) =>
      things.select('id', 'document').orderBy((thing) => thing.id.asc()),
    )
    .all();

  return stored.map((space) => {
    try {
      return {
        snapshot: parseSnapshot({
          id: space.id,
          document: storedJson(space.document),
          things: space.things.map((thing) => ({
            id: thing.id,
            document: storedJson(thing.document),
          })),
        }),
        revision: toRevision(space.revision),
        exportedRevision: toOptionalRevision(space.exportedRevision),
      };
    } catch (error) {
      if (!(error instanceof SnapshotValidationError)) throw error;
      throw new AggregateInvariantError(`Stored Space ${space.id} does not parse`, {
        cause: error,
      });
    }
  });
};

const lockMetaIdentity = async (orm: Orm): Promise<UUID | undefined> => {
  const state = await orm.RepositoryState.where({ singletonId: 1 }).first();
  if (state === null) return undefined;
  const metaSpaceId = uuidSchema.parse(state.metaSpaceId);
  const locked = await orm.RepositoryState.where({ singletonId: 1 }).update({ metaSpaceId });
  if (locked === null) throw new Error('Repository state disappeared while locking it');
  return metaSpaceId;
};

const importThings = async (orm: Orm, snapshot: SpaceSnapshot): Promise<void> => {
  for (const thing of snapshot.things) {
    try {
      await orm.Thing.create({
        id: thing.id,
        spaceId: snapshot.id,
        document: toJsonValue(thing.document),
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ThingOwnershipError(`Thing ${thing.id} already belongs to another space`);
      }
      throw error;
    }
  }
};

const createStoredSpace = async (orm: Orm, snapshot: SpaceSnapshot): Promise<void> => {
  await orm.Space.create({
    id: snapshot.id,
    document: toJsonValue(snapshot.document),
    revision: toDatabaseRevision(0n),
  });
  await importThings(orm, snapshot);
};

const truncateHyperContent = async (orm: Orm): Promise<void> => {
  await orm.RepositoryState.where({ singletonId: 1 }).delete();
  const spaces = await orm.Space.all();
  for (const space of spaces) {
    await orm.Thing.where({ spaceId: space.id }).deleteAll();
    await orm.Space.where({ id: space.id }).delete();
  }
};

const authoritativeAggregate = async (orm: Orm, metaSpaceId: UUID): Promise<LoadedAggregate> => {
  const spaces = await loadEverySpace(orm);
  const intake = loadSpaceAggregate({
    metaSpaceId,
    snapshots: spaces.map(({ snapshot }) => snapshot),
  });
  if (!intake.ok) throw new AggregateInvariantError('Stored aggregate violates Meta invariants');
  return { metaSpaceId, spaces };
};

const ascendingSnapshotId = (left: SpaceSnapshot, right: SpaceSnapshot): number => {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
};

const replaceAllSpaces = async (orm: Orm, input: AggregateInput): Promise<LoadedAggregate> => {
  await truncateHyperContent(orm);
  for (const snapshot of [...input.spaces].sort(ascendingSnapshotId)) {
    await createStoredSpace(orm, snapshot);
  }
  await orm.RepositoryState.create({ singletonId: 1, metaSpaceId: input.metaSpaceId });
  return authoritativeAggregate(orm, input.metaSpaceId);
};

export class SqliteSpaceRepository implements SpaceRepository {
  readonly #database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.#database = database;
  }

  async listSpaces(): Promise<readonly SpaceSummary[]> {
    const spaces = await this.#database.orm.Space.orderBy((space) => space.id.asc()).all();

    return spaces.map((space) => ({
      id: uuidSchema.parse(space.id),
      title: spaceDocumentSchema.parse(storedJson(space.document)).title,
    }));
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    return loadStoredSpace(this.#database.orm, id);
  }

  loadAggregate(): Promise<AggregateLoadResult> {
    return this.#database.transaction(async ({ orm }) => {
      const metaSpaceId = await lockMetaIdentity(orm);
      if (metaSpaceId === undefined) {
        if ((await loadEverySpace(orm)).length === 0) return { kind: 'uninitialized' };
        throw new AggregateInvariantError('Stored Spaces exist without a Meta Space');
      }
      return { kind: 'loaded', aggregate: await authoritativeAggregate(orm, metaSpaceId) };
    });
  }

  async initializeAggregate(input: AggregateInput): Promise<InitializeAggregateResult> {
    const intake = loadSpaceAggregate({
      metaSpaceId: input.metaSpaceId,
      snapshots: input.spaces,
    });
    if (!intake.ok) return { kind: 'aggregate-refused', errors: intake.errors };
    try {
      return await this.#database.transaction(async ({ orm }) => {
        const metaSpaceId = await lockMetaIdentity(orm);
        if (metaSpaceId !== undefined) {
          return classifyInitializedAggregate(
            input,
            await authoritativeAggregate(orm, metaSpaceId),
          );
        }
        if ((await loadEverySpace(orm)).length > 0) {
          throw new AggregateInvariantError('Stored Spaces exist without a Meta Space');
        }
        return { kind: 'initialized', aggregate: await replaceAllSpaces(orm, input) };
      });
    } catch (error) {
      if (!(error instanceof ThingOwnershipError) && !isUniqueViolation(error)) {
        throw error;
      }
      const result = await this.loadAggregate();
      if (result.kind === 'uninitialized') throw error;
      return classifyInitializedAggregate(input, result.aggregate);
    }
  }

  replaceAggregate(
    _input: AggregateInput,
    _expectedMetaSpaceId: UUID,
  ): Promise<ReplaceAggregateResult> {
    return Promise.reject(new Error('SQLite replaceAggregate is not implemented'));
  }

  markExported(_id: UUID, _revision: bigint): Promise<void> {
    return Promise.reject(new Error('SQLite markExported is not implemented'));
  }

  commit(_request: SpaceCommit): Promise<RepositoryCommitResult> {
    return Promise.resolve({
      kind: 'rejected',
      code: 'invalid-commit',
      message: 'SQLite writes are not implemented',
    });
  }
}
