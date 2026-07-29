import {
  cardDocumentSchema,
  spaceDocumentSchema,
  spaceSnapshotSchema,
  uuidSchema,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { db } from '../prisma/db';
import type {
  RepositoryCommitResult,
  RepositoryImportResult,
  SpaceRepository,
  SpaceSummary,
  StoredSpace,
} from './space-repository';

type Orm = typeof db.orm;
type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

class SnapshotValidationError extends Error {}

class CardOwnershipError extends Error {}

class ImportConflictError extends Error {
  readonly spaceId: UUID;

  constructor(spaceId: UUID) {
    super(`Space ${spaceId} changed concurrently during import`);
    this.spaceId = spaceId;
  }
}

const isSpacePrimaryKeyConflict = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Record<string, unknown>;
  return (
    candidate['kind'] === 'sql_query' &&
    candidate['sqlState'] === '23505' &&
    candidate['table'] === 'spaces' &&
    candidate['constraint'] === 'spaces_pkey'
  );
};

const toRevision = (value: number | string | bigint): bigint => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError(`Database revision ${value} is not a safe integer`);
  }
  return typeof value === 'bigint' ? value : BigInt(value);
};

const toOptionalRevision = (value: number | string | bigint | null): bigint | null =>
  value === null ? null : toRevision(value);

/**
 * Prisma Next 0.16.0 emits `int8` inputs as `number`, although its codec passes
 * values through unchanged and node-postgres supports bigint parameters. Keep
 * the upstream type workaround isolated here so revisions are never narrowed.
 */
const toDatabaseRevision = (value: bigint): number => value as unknown as number;

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
  const parsed = spaceSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    throw new SnapshotValidationError(parsed.error.message);
  }

  const intake = loadSpaceSnapshot(parsed.data);
  if (!intake.ok) {
    throw new SnapshotValidationError(intake.errors.map(({ message }) => message).join('\n'));
  }

  return parsed.data;
};

const duplicateIdentity = (snapshots: readonly SpaceSnapshot[]): UUID | undefined => {
  const seen = new Set<UUID>();

  for (const snapshot of snapshots) {
    const identities = [
      snapshot.id,
      ...snapshot.cards.map(({ id }) => id),
      ...snapshot.document.routes.map(({ id }) => id),
      ...(snapshot.document.layouts ?? []).map(({ id }) => id),
    ];
    for (const id of identities) {
      if (seen.has(id)) return id;
      seen.add(id);
    }
  }

  return undefined;
};

const rejectInvalidSnapshot = (error: SnapshotValidationError) => ({
  kind: 'rejected' as const,
  code: 'invalid-snapshot' as const,
  message: error.message,
});

const validateIdentities = (snapshots: readonly SpaceSnapshot[]): void => {
  const duplicate = duplicateIdentity(snapshots);
  if (duplicate !== undefined) {
    throw new SnapshotValidationError(`Duplicate durable identity "${duplicate}"`);
  }
};

const loadStoredSpace = async (orm: Orm, id: UUID): Promise<StoredSpace | undefined> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const before = await orm.public.Space.first({ id });
    if (before === null) return undefined;

    const cards = await orm.public.Card.where({ spaceId: id })
      .orderBy((card) => card.id.asc())
      .all();
    const after = await orm.public.Space.first({ id });
    if (after === null) continue;
    if (toRevision(before.revision) !== toRevision(after.revision)) continue;

    const snapshot = parseSnapshot({
      id: after.id,
      document: spaceDocumentSchema.parse(after.document),
      cards: cards.map((card) => ({
        id: card.id,
        document: cardDocumentSchema.parse(card.document),
      })),
    });

    return {
      snapshot,
      revision: toRevision(after.revision),
      exportedRevision: toOptionalRevision(after.exportedRevision),
    };
  }

  throw new Error(`Space ${id} changed repeatedly while loading`);
};

const upsertCards = async (orm: Orm, snapshot: SpaceSnapshot): Promise<void> => {
  for (const card of snapshot.cards) {
    const stored = await orm.public.Card.upsert({
      create: {
        id: card.id,
        spaceId: snapshot.id,
        document: toJsonValue(card.document),
      },
      update: {
        document: toJsonValue(card.document),
      },
    });
    if (stored.spaceId !== snapshot.id) {
      throw new CardOwnershipError(
        `Card ${card.id} belongs to space ${stored.spaceId}, not ${snapshot.id}`,
      );
    }
  }
};

export class PostgresSpaceRepository implements SpaceRepository {
  readonly #database: typeof db;

  constructor(database: typeof db = db) {
    this.#database = database;
  }

  async listSpaces(): Promise<readonly SpaceSummary[]> {
    const spaces = await this.#database.orm.public.Space.orderBy((space) => space.id.asc()).all();

    return spaces.map((space) => ({
      id: uuidSchema.parse(space.id),
      title: spaceDocumentSchema.parse(space.document).title,
    }));
  }

  loadSpace(id: UUID): Promise<StoredSpace | undefined> {
    return loadStoredSpace(this.#database.orm, id);
  }

  async commitSpace(
    snapshot: SpaceSnapshot,
    expectedRevision: bigint,
  ): Promise<RepositoryCommitResult> {
    let accepted: SpaceSnapshot;
    try {
      accepted = parseSnapshot(snapshot);
      validateIdentities([accepted]);
    } catch (error) {
      if (error instanceof SnapshotValidationError) {
        return rejectInvalidSnapshot(error);
      }
      throw error;
    }
    const databaseExpectedRevision = toDatabaseRevision(expectedRevision);
    const revision = expectedRevision + 1n;
    const databaseRevision = toDatabaseRevision(revision);

    try {
      return await this.#database.transaction(async ({ orm }) => {
        const updated = await orm.public.Space.where({ id: accepted.id })
          .where({ revision: databaseExpectedRevision })
          .update({
            document: toJsonValue(accepted.document),
            revision: databaseRevision,
          });
        if (updated === null) {
          const current = await loadStoredSpace(orm, accepted.id);
          if (current === undefined) {
            return {
              kind: 'rejected',
              code: 'not-found',
              message: `Space ${accepted.id} does not exist`,
            };
          }
          return { kind: 'conflict', current };
        }

        await upsertCards(orm, accepted);

        const ownedCards = orm.public.Card.where({ spaceId: accepted.id });
        if (accepted.cards.length === 0) {
          await ownedCards.delete();
        } else {
          await ownedCards
            .where((card) => card.id.notIn(accepted.cards.map(({ id }) => id)))
            .delete();
        }

        return { kind: 'committed', revision };
      });
    } catch (error) {
      if (error instanceof CardOwnershipError) {
        return {
          kind: 'rejected',
          code: 'invalid-snapshot',
          message: error.message,
        };
      }
      throw error;
    }
  }

  async importSpaces(snapshots: readonly SpaceSnapshot[]): Promise<RepositoryImportResult> {
    let accepted: SpaceSnapshot[];
    try {
      accepted = snapshots.map(parseSnapshot);
      validateIdentities(accepted);
    } catch (error) {
      if (error instanceof SnapshotValidationError) {
        return rejectInvalidSnapshot(error);
      }
      throw error;
    }

    try {
      return await this.#database.transaction(async ({ orm }) => {
        const imported: StoredSpace[] = [];

        for (const snapshot of accepted) {
          const current = await orm.public.Space.first({ id: snapshot.id });
          let space;
          if (current === null) {
            try {
              space = await orm.public.Space.create({
                id: snapshot.id,
                document: toJsonValue(snapshot.document),
                revision: 0,
              });
            } catch (error) {
              if (isSpacePrimaryKeyConflict(error)) {
                throw new ImportConflictError(snapshot.id);
              }
              throw error;
            }
          } else {
            space = await orm.public.Space.where({ id: snapshot.id })
              .where({ revision: current.revision })
              .update({
                document: toJsonValue(snapshot.document),
                revision: toDatabaseRevision(toRevision(current.revision) + 1n),
              });
          }
          if (space === null) {
            throw new ImportConflictError(snapshot.id);
          }

          await upsertCards(orm, snapshot);

          const stored = await loadStoredSpace(orm, snapshot.id);
          if (stored === undefined) {
            throw new Error(`Space ${snapshot.id} disappeared during import`);
          }
          imported.push(stored);
        }

        return { kind: 'imported', spaces: imported };
      });
    } catch (error) {
      if (error instanceof ImportConflictError) {
        const current = await loadStoredSpace(this.#database.orm, error.spaceId);
        if (current === undefined) {
          throw new Error(`Space ${error.spaceId} disappeared after an import conflict`, {
            cause: error,
          });
        }
        return { kind: 'conflict', current };
      }
      if (error instanceof CardOwnershipError) {
        return {
          kind: 'rejected',
          code: 'invalid-snapshot',
          message: error.message,
        };
      }
      throw error;
    }
  }
}
