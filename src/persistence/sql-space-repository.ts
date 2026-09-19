import {
  spaceDocumentSchema,
  thingDocumentSchema,
  uuidSchema,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceAggregate, loadSpaceSnapshot } from '@project/graph';
import {
  AggregateInvariantError,
  decodeStoredRevision,
  encodeStoredRevision,
  RevisionCodecError,
  type AggregateLoadResult,
  type LoadedAggregate,
  type LoadedSpace,
  type SpaceSummary,
} from '@project/persistence';
import { classifyInitializedAggregate } from './aggregate-lifecycle';
import type {
  AggregateInput,
  InitializeAggregateResult,
  ReplaceAggregateResult,
} from './space-repository';
import type { SqlStore, SqlTables } from './sql-store';

class SnapshotValidationError extends Error {}

class ThingOwnershipError extends Error {}

/**
 * A Space row moved between `replaceAggregate`'s conflict check and its
 * write.
 *
 * Thrown rather than returned because the write loop has already replaced
 * earlier Spaces in the change set by the time it can be detected. Returning
 * a conflict from inside the transaction callback would commit those writes
 * beside it; escaping the callback is what rolls the whole change set back.
 */
class StaleSpaceRevisionError extends Error {
  readonly spaceId: UUID;

  constructor(spaceId: UUID) {
    super(`Space ${spaceId} changed during commit`);
    this.spaceId = spaceId;
  }
}

const parseSnapshot = (input: unknown): SpaceSnapshot => {
  const intake = loadSpaceSnapshot(input);
  if (!intake.ok) {
    throw new SnapshotValidationError(intake.errors.map(({ message }) => message).join('\n'));
  }
  return intake.snapshot;
};

const ascendingSnapshotId = (left: SpaceSnapshot, right: SpaceSnapshot): number => {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
};

/**
 * The one SQL Space repository (ADR 0095), serving `listSpaces` and
 * `loadSpace` (ticket 22) plus the Meta lifecycle -- `loadAggregate`,
 * `initializeAggregate`, `loadMetaSpaceId`, `replaceAggregate` and
 * `markExported` (ticket 23) -- for both databases through a database's own
 * `SqlStore` (`src/prisma/sql-store.ts`, `src/sqlite/sql-store.ts`). `commit`
 * stays on `PostgresSpaceRepository`/`SqliteSpaceRepository` until ticket 24
 * moves it here and deletes those two adapters.
 *
 * `Handle` and `Order` come from the `SqlStore` passed to the constructor —
 * whichever database it was built for — so this class itself names no
 * database-specific type.
 */
export class SqlSpaceRepository<Handle, Order> {
  readonly #store: SqlStore<Handle, Order>;

  constructor(store: SqlStore<Handle, Order>) {
    this.#store = store;
  }

  listSpaces(): Promise<readonly SpaceSummary[]> {
    return this.#store.serialise(async () => {
      const tables = this.#store.tables(this.#store.orm);
      const spaces = await tables.Space.orderBy((space) => space.id.asc()).all();

      return spaces.map((space) => ({
        id: uuidSchema.parse(space.id),
        title: spaceDocumentSchema.parse(this.#store.readDocument(space.document)).title,
      }));
    });
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    return this.#store.serialise(async () => {
      const tables = this.#store.tables(this.#store.orm);
      const stored = await tables.Space.loadWithThings(id);
      if (stored === null) return undefined;

      const snapshot = parseSnapshot({
        id: stored.id,
        document: spaceDocumentSchema.parse(this.#store.readDocument(stored.document)),
        things: stored.things.map((thing) => ({
          id: thing.id,
          document: thingDocumentSchema.parse(this.#store.readDocument(thing.document)),
        })),
      });

      return {
        snapshot,
        revision: decodeStoredRevision(stored.revision),
        exportedRevision:
          stored.exportedRevision === null ? null : decodeStoredRevision(stored.exportedRevision),
      };
    });
  }

  loadAggregate(): Promise<AggregateLoadResult> {
    return this.#store.serialise(() => this.#loadAggregateUnserialised());
  }

  async initializeAggregate(input: AggregateInput): Promise<InitializeAggregateResult> {
    return this.#store.serialise(() => this.#initializeUnserialised(input));
  }

  loadMetaSpaceId(): Promise<UUID | undefined> {
    return this.#store.serialise(() => this.#loadMetaSpaceIdUnserialised());
  }

  async replaceAggregate(
    input: AggregateInput,
    expectedMetaSpaceId: UUID | undefined,
  ): Promise<ReplaceAggregateResult> {
    return this.#store.serialise(() => this.#replaceUnserialised(input, expectedMetaSpaceId));
  }

  markExported(id: UUID, revision: bigint): Promise<void> {
    return this.#store.serialise(async () => {
      const tables = this.#store.tables(this.#store.orm);
      const updated = await tables.Space.setExportedRevision(id, encodeStoredRevision(revision));
      if (!updated) throw new Error(`Space ${id} does not exist`);
    });
  }

  /**
   * Take the singleton row's write lock, and answer `undefined` when there is
   * no row to take.
   *
   * A repository that has only been migrated has no Meta Space, and there is
   * then nothing to serialize integrity-affecting transactions on and no
   * aggregate to validate. That is not a reason to fail a commit outright:
   * identity and revision conflicts are answerable without Meta, and
   * `MemorySpaceRepository` answers them first.
   *
   * The self-update can find the row gone: a concurrent replacement deleted
   * and rewrote it between the read above and this update. `retryAfterReplacement`
   * re-reads and re-locks once for exactly that case, and answers with **the
   * identity the retry itself locks** -- the one now actually stored -- never
   * the one this call read before the replacement. Ticket 23's race test on
   * the (then two-adapter) PostgreSQL repository settled this
   * (`test/integration/postgres-space-repository.test.ts`, "conflicts a
   * replacement authorized against an identity a concurrent replacement
   * retired" and "judges a complete-aggregate commit against an identity a
   * concurrent replacement retired"): answering with the pre-replacement
   * identity lets a stale `replaceAggregate` caller's expected identity match
   * it and silently overwrite the concurrent replacement, and lets a commit's
   * `decideCommit` validate the *current* stored Spaces against an identity no
   * longer among them, refusing a valid aggregate as broken.
   */
  async #lockMetaIdentity(
    tables: SqlTables<Order>,
    retryAfterReplacement = true,
  ): Promise<UUID | undefined> {
    const state = await tables.RepositoryState.read();
    if (state === null) return undefined;
    const metaSpaceId = uuidSchema.parse(state.metaSpaceId);
    const stillPresent = await tables.RepositoryState.relock(metaSpaceId);
    if (!stillPresent) {
      if (retryAfterReplacement) return this.#lockMetaIdentity(tables, false);
      throw new Error('Repository state disappeared while locking it');
    }
    return metaSpaceId;
  }

  /**
   * Every stored Space, parsed.
   *
   * A row that fails intake or a revision that fails the shared codec raises
   * `AggregateInvariantError` rather than the private `SnapshotValidationError`
   * a bare `parseSnapshot` would, the codec's own `RevisionCodecError`, or (on
   * SQLite, whose stored document may not even be JSON) a `SyntaxError` from
   * `readDocument`'s `JSON.parse`. All are stored state no aggregate can be
   * read from, and every caller of this method is an aggregate-level read
   * whose failure a reader classifies (`docs/agents/editing-and-persistence.md`).
   * Nothing inside the `try` performs I/O -- `tables.Space.loadEvery()` above
   * already has, on both databases -- so nothing here can misclassify a
   * connection failure as broken stored state.
   *
   * `loadSpace`/`listSpaces` keep the narrower, unclassified error
   * deliberately: one Space failing intake is that resource's answer to give,
   * not evidence the aggregate cannot be read.
   */
  async #loadEverySpace(tables: SqlTables<Order>): Promise<readonly LoadedSpace[]> {
    const stored = await tables.Space.loadEvery();

    return stored.map((space) => {
      try {
        return {
          snapshot: parseSnapshot({
            id: space.id,
            document: this.#store.readDocument(space.document),
            things: space.things.map((thing) => ({
              id: thing.id,
              document: this.#store.readDocument(thing.document),
            })),
          }),
          revision: decodeStoredRevision(space.revision),
          exportedRevision:
            space.exportedRevision === null ? null : decodeStoredRevision(space.exportedRevision),
        };
      } catch (error) {
        if (
          !(error instanceof SnapshotValidationError) &&
          !(error instanceof RevisionCodecError) &&
          !(error instanceof SyntaxError)
        ) {
          throw error;
        }
        throw new AggregateInvariantError(`Stored Space ${space.id} does not parse`, {
          cause: error,
        });
      }
    });
  }

  async #authoritativeAggregate(
    tables: SqlTables<Order>,
    metaSpaceId: UUID,
  ): Promise<LoadedAggregate> {
    const spaces = await this.#loadEverySpace(tables);
    const intake = loadSpaceAggregate({
      metaSpaceId,
      snapshots: spaces.map(({ snapshot }) => snapshot),
    });
    if (!intake.ok) throw new AggregateInvariantError('Stored aggregate violates Meta invariants');
    return { metaSpaceId, spaces };
  }

  async #importThings(tables: SqlTables<Order>, snapshot: SpaceSnapshot): Promise<void> {
    for (const thing of snapshot.things) {
      try {
        await tables.Thing.create({ id: thing.id, spaceId: snapshot.id, document: thing.document });
      } catch (error) {
        if (this.#store.isDuplicateKey(error, 'things')) {
          throw new ThingOwnershipError(`Thing ${thing.id} already belongs to another space`);
        }
        throw error;
      }
    }
  }

  async #createStoredSpace(tables: SqlTables<Order>, snapshot: SpaceSnapshot): Promise<void> {
    await tables.Space.create({
      id: snapshot.id,
      document: snapshot.document,
      revision: encodeStoredRevision(0n),
    });
    await this.#importThings(tables, snapshot);
  }

  async #truncateHyperContent(tables: SqlTables<Order>): Promise<void> {
    // Repository state restricts deletion of its Meta Space, so clear the
    // Meta identity row before deleting any Space rows.
    await tables.RepositoryState.delete();
    for (const id of await tables.Space.listIds()) {
      await tables.Thing.deleteAllForSpace(id);
      await tables.Space.deleteById(id);
    }
  }

  async #replaceAllSpaces(
    tables: SqlTables<Order>,
    input: AggregateInput,
  ): Promise<LoadedAggregate> {
    await this.#truncateHyperContent(tables);
    for (const snapshot of [...input.spaces].sort(ascendingSnapshotId)) {
      await this.#createStoredSpace(tables, snapshot);
    }
    await tables.RepositoryState.create(input.metaSpaceId);
    return this.#authoritativeAggregate(tables, input.metaSpaceId);
  }

  async #loadAggregateUnserialised(): Promise<AggregateLoadResult> {
    return this.#store.transaction(async (handle) => {
      const tables = this.#store.tables(handle);
      const metaSpaceId = await this.#lockMetaIdentity(tables);
      if (metaSpaceId === undefined) {
        if ((await this.#loadEverySpace(tables)).length === 0) return { kind: 'uninitialized' };
        throw new AggregateInvariantError('Stored Spaces exist without a Meta Space');
      }
      return { kind: 'loaded', aggregate: await this.#authoritativeAggregate(tables, metaSpaceId) };
    });
  }

  async #loadMetaSpaceIdUnserialised(): Promise<UUID | undefined> {
    const tables = this.#store.tables(this.#store.orm);
    const state = await tables.RepositoryState.read();
    return state === null ? undefined : uuidSchema.parse(state.metaSpaceId);
  }

  async #initializeUnserialised(input: AggregateInput): Promise<InitializeAggregateResult> {
    const intake = loadSpaceAggregate({
      metaSpaceId: input.metaSpaceId,
      snapshots: input.spaces,
    });
    if (!intake.ok) return { kind: 'aggregate-refused', errors: intake.errors };
    try {
      return await this.#store.transaction(async (handle) => {
        const tables = this.#store.tables(handle);
        const metaSpaceId = await this.#lockMetaIdentity(tables);
        if (metaSpaceId !== undefined) {
          return classifyInitializedAggregate(
            input,
            await this.#authoritativeAggregate(tables, metaSpaceId),
          );
        }
        if ((await this.#loadEverySpace(tables)).length > 0) {
          throw new AggregateInvariantError('Stored Spaces exist without a Meta Space');
        }
        return { kind: 'initialized', aggregate: await this.#replaceAllSpaces(tables, input) };
      });
    } catch (error) {
      // Identical and different first proposals race on the first durable
      // Space identity. The loser reads the winner after its transaction
      // rolls back and classifies authored meaning, rather than exposing SQL
      // timing.
      if (
        !(error instanceof ThingOwnershipError) &&
        !this.#store.isDuplicateKey(error, 'spaces') &&
        !this.#store.isDuplicateKey(error, 'repository_state')
      ) {
        throw error;
      }
      const result = await this.#loadAggregateUnserialised();
      if (result.kind === 'uninitialized') throw error;
      return classifyInitializedAggregate(input, result.aggregate);
    }
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
    try {
      return await this.#store.transaction(async (handle) => {
        const tables = this.#store.tables(handle);
        const metaSpaceId = await this.#lockMetaIdentity(tables);
        // Rows are read raw rather than through `#loadEverySpace`: truncation
        // replaces stored state whether or not it parses (ADR 0094). In id
        // order, so two overlapping replacements take the row locks below in
        // the same order: the later waits on the earlier rather than
        // deadlocking with it. Where no Meta row exists to lock, those row
        // locks are all that serialises them.
        const storedRows = await tables.Space.loadAllForReplacement();
        if (metaSpaceId === undefined && storedRows.length === 0) {
          return { kind: 'uninitialized' };
        }
        if (metaSpaceId !== expectedMetaSpaceId) {
          return { kind: 'conflict', currentMetaSpaceId: metaSpaceId };
        }
        // The baseline read is lock-free so topology-preserving commits
        // retain their fast path. Re-lock each row and compare its revision
        // again -- a row that does not parse locks too, since `relock` never
        // reads `document` -- so a commit that won in between must conflict
        // rather than be overwritten.
        for (const row of storedRows) {
          const currentRevision = await tables.Space.relock(row.id);
          if (currentRevision === undefined || currentRevision !== row.revision) {
            throw new StaleSpaceRevisionError(uuidSchema.parse(row.id));
          }
        }
        return { kind: 'replaced', aggregate: await this.#replaceAllSpaces(tables, input) };
      });
    } catch (error) {
      if (!(error instanceof StaleSpaceRevisionError)) throw error;
      // A stored Space moved, not necessarily the Meta identity, so this id is
      // usually the one the caller expected. The CLI words the conflict to
      // hold either way (`test/unit/hyper-cli.test.ts`, "does not claim the
      // Meta identity moved ...").
      return { kind: 'conflict', currentMetaSpaceId: await this.#loadMetaSpaceIdUnserialised() };
    }
  }
}
