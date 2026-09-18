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
import {
  commitIdentityRefusal,
  committedRevision,
  decideAggregateCommit,
  decideTopologyPreservingUpdate,
  topologyPreservingCandidate,
} from './commit-decision';
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

/**
 * A Space row moved between this transaction's conflict check and its write.
 *
 * Thrown rather than returned because the write loop has already replaced
 * earlier Spaces in the change set by the time it can be detected. Returning a
 * conflict from inside the transaction callback would commit those writes
 * beside it; escaping the callback is what rolls the whole change set back.
 */
class StaleSpaceRevisionError extends Error {
  readonly spaceId: UUID;

  constructor(spaceId: UUID) {
    super(`Space ${spaceId} changed during commit`);
    this.spaceId = spaceId;
  }
}

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

const storedMetaSpaceId = async (orm: Orm): Promise<UUID | undefined> => {
  const state = await orm.RepositoryState.where({ singletonId: 1 }).first();
  return state === null ? undefined : uuidSchema.parse(state.metaSpaceId);
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

/**
 * Truncation never decodes a stored document: a row read or returned whole goes
 * through the json codec, which throws on text that is not JSON, and ADR 0092
 * truncates whatever is stored, valid or not. So it reads ids and deletes by
 * count — neither touches a `document` column. `truncates a stored Space whose
 * document is not JSON` in `test/integration/sqlite-space-repository.test.ts` is
 * what holds it: written back the decoding way, it fails with the codec's own
 * `Cannot read properties of undefined (reading 'codecId')`.
 */
const truncateHyperContent = async (orm: Orm): Promise<void> => {
  await orm.RepositoryState.where({ singletonId: 1 }).delete();
  const spaces = await orm.Space.select('id').all();
  for (const space of spaces) {
    await orm.Thing.where({ spaceId: space.id }).deleteCount();
    await orm.Space.where({ id: space.id }).deleteCount();
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

const writeSpaceDocumentUnderLock = async (
  orm: Orm,
  snapshot: SpaceSnapshot,
): Promise<bigint | undefined> => {
  const locked = await orm.Space.where({ id: snapshot.id }).update({
    document: toJsonValue(snapshot.document),
  });
  return locked === null ? undefined : toRevision(locked.revision);
};

const upsertThings = async (orm: Orm, snapshot: SpaceSnapshot): Promise<void> => {
  for (const thing of snapshot.things) {
    const stored = await orm.Thing.upsert({
      create: {
        id: thing.id,
        spaceId: snapshot.id,
        document: toJsonValue(thing.document),
      },
      update: {
        document: toJsonValue(thing.document),
      },
    });
    if (stored.spaceId !== snapshot.id) {
      throw new ThingOwnershipError(
        `Thing ${thing.id} belongs to space ${stored.spaceId}, not ${snapshot.id}`,
      );
    }
  }
};

const replaceStoredSpace = async (
  orm: Orm,
  snapshot: SpaceSnapshot,
  expectedRevision: bigint,
  revision: bigint,
): Promise<void> => {
  const locked = await writeSpaceDocumentUnderLock(orm, snapshot);
  if (locked !== expectedRevision) throw new StaleSpaceRevisionError(snapshot.id);
  await orm.Space.where({ id: snapshot.id }).update({
    revision: toDatabaseRevision(revision),
  });
  await upsertThings(orm, snapshot);
  const ownedThings = orm.Thing.where({ spaceId: snapshot.id });
  if (snapshot.things.length === 0) await ownedThings.deleteAll();
  else {
    await ownedThings
      .where((thing) => thing.id.notIn(snapshot.things.map(({ id }) => id)))
      .deleteAll();
  }
};

const commitTopologyPreservingUpdate = async (
  orm: Orm,
  request: SpaceCommit,
): Promise<RepositoryCommitResult | undefined> => {
  const change = topologyPreservingCandidate(request);
  if (change === undefined) return undefined;
  const decision = decideTopologyPreservingUpdate(
    change,
    await loadStoredSpace(orm, change.spaceId),
  );
  if (decision.kind === 'aggregate-path') return undefined;
  if (decision.kind === 'answer') return decision.result;

  const locked = await writeSpaceDocumentUnderLock(orm, change.snapshot);
  if (locked !== change.expectedRevision) throw new StaleSpaceRevisionError(change.spaceId);
  await orm.Space.where({ id: change.spaceId }).update({
    revision: toDatabaseRevision(committedRevision(change)),
  });
  await upsertThings(orm, change.snapshot);
  return decision.result;
};

export class SqliteSpaceRepository implements SpaceRepository {
  readonly #database: SqliteDatabase;
  #queue: Promise<void> = Promise.resolve();

  constructor(database: SqliteDatabase) {
    this.#database = database;
  }

  /**
   * One in-process database operation at a time, reads included. The driver
   * opens a handle per operation, so overlapping transactions would both sit in
   * a deferred BEGIN, and an auto-commit read holding its statement open across
   * a promise turn makes an overlapping commit's COMMIT wait out the busy
   * timeout synchronously and fail (`test/integration/sqlite-space-repository.test.ts`
   * overlapping reads, initializations, different-Space commits, and reads
   * overlapping a commit).
   */
  #serialise<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(operation, operation);
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  listSpaces(): Promise<readonly SpaceSummary[]> {
    return this.#serialise(async () => {
      const spaces = await this.#database.orm.Space.orderBy((space) => space.id.asc()).all();

      return spaces.map((space) => ({
        id: uuidSchema.parse(space.id),
        title: spaceDocumentSchema.parse(storedJson(space.document)).title,
      }));
    });
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    return this.#serialise(() => loadStoredSpace(this.#database.orm, id));
  }

  loadAggregate(): Promise<AggregateLoadResult> {
    return this.#serialise(() => this.#loadAggregateUnserialised());
  }

  #loadAggregateUnserialised(): Promise<AggregateLoadResult> {
    return this.#database.transaction(async ({ orm }) => {
      const metaSpaceId = await lockMetaIdentity(orm);
      if (metaSpaceId === undefined) {
        if ((await loadEverySpace(orm)).length === 0) return { kind: 'uninitialized' };
        throw new AggregateInvariantError('Stored Spaces exist without a Meta Space');
      }
      return { kind: 'loaded', aggregate: await authoritativeAggregate(orm, metaSpaceId) };
    });
  }

  initializeAggregate(input: AggregateInput): Promise<InitializeAggregateResult> {
    return this.#serialise(() => this.#initializeUnserialised(input));
  }

  async #initializeUnserialised(input: AggregateInput): Promise<InitializeAggregateResult> {
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
      const result = await this.#loadAggregateUnserialised();
      if (result.kind === 'uninitialized') throw error;
      return classifyInitializedAggregate(input, result.aggregate);
    }
  }

  loadMetaSpaceId(): Promise<UUID | undefined> {
    return this.#serialise(() => storedMetaSpaceId(this.#database.orm));
  }

  replaceAggregate(
    input: AggregateInput,
    expectedMetaSpaceId: UUID | undefined,
  ): Promise<ReplaceAggregateResult> {
    return this.#serialise(() => this.#replaceUnserialised(input, expectedMetaSpaceId));
  }

  async #replaceUnserialised(
    input: AggregateInput,
    expectedMetaSpaceId: UUID | undefined,
  ): Promise<ReplaceAggregateResult> {
    const intake = loadSpaceAggregate({
      metaSpaceId: input.metaSpaceId,
      snapshots: input.spaces,
    });
    if (!intake.ok) return { kind: 'aggregate-refused', errors: intake.errors };
    return this.#database.transaction(async ({ orm }) => {
      // Read raw rather than through `loadEverySpace`: truncation replaces
      // stored state whether or not it parses (ADR 0094).
      const metaSpaceId = await lockMetaIdentity(orm);
      if (metaSpaceId === undefined && (await orm.Space.select('id').first()) === null) {
        return { kind: 'uninitialized' };
      }
      if (metaSpaceId !== expectedMetaSpaceId) {
        return { kind: 'conflict', currentMetaSpaceId: metaSpaceId };
      }
      return { kind: 'replaced', aggregate: await replaceAllSpaces(orm, input) };
    });
  }

  markExported(id: UUID, revision: bigint): Promise<void> {
    return this.#serialise(async () => {
      const updated = await this.#database.orm.Space.where({ id }).update({
        exportedRevision: toDatabaseRevision(revision),
      });
      if (updated === null) throw new Error(`Space ${id} does not exist`);
    });
  }

  commit(request: SpaceCommit): Promise<RepositoryCommitResult> {
    return this.#serialise(() => this.#commitUnserialised(request));
  }

  async #commitUnserialised(request: SpaceCommit): Promise<RepositoryCommitResult> {
    const refusal = commitIdentityRefusal(request);
    if (refusal !== undefined) return refusal;

    try {
      return await this.#commitInTransaction(request);
    } catch (error) {
      if (error instanceof ThingOwnershipError) {
        return { kind: 'rejected', code: 'invalid-commit', message: error.message };
      }
      if (error instanceof StaleSpaceRevisionError) {
        return {
          kind: 'conflict',
          conflicts: [
            {
              spaceId: error.spaceId,
              current: await loadStoredSpace(this.#database.orm, error.spaceId),
            },
          ],
        };
      }
      throw error;
    }
  }

  #commitInTransaction(request: SpaceCommit): Promise<RepositoryCommitResult> {
    return this.#database.transaction(async ({ orm }) => {
      const topologyPreserving = await commitTopologyPreservingUpdate(orm, request);
      if (topologyPreserving !== undefined) return topologyPreserving;
      const metaSpaceId = await lockMetaIdentity(orm);
      const decision = decideAggregateCommit(request, metaSpaceId, await loadEverySpace(orm));
      if (decision.kind === 'answer') return decision.result;

      for (const change of request.changes) {
        if (change.kind === 'delete') {
          await orm.Thing.where({ spaceId: change.spaceId }).deleteAll();
          const deleted = await orm.Space.where({ id: change.spaceId }).delete();
          if (deleted === null)
            throw new Error(`Space ${change.spaceId} disappeared during commit`);
        } else if (change.kind === 'create') {
          await createStoredSpace(orm, change.snapshot);
        } else {
          await replaceStoredSpace(
            orm,
            change.snapshot,
            change.expectedRevision,
            committedRevision(change),
          );
        }
      }
      return decision.result;
    });
  }
}
