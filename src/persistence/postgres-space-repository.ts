import {
  cardDocumentSchema,
  importSpaceSchema,
  newUuid,
  spaceDocumentSchema,
  spaceSnapshotSchema,
  uuidSchema,
  type ImportSpace,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { db } from '../prisma/db';
import type {
  ImportMode,
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

class DuplicateIdentityError extends Error {}

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

const isCardPrimaryKeyConflict = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Record<string, unknown>;
  return (
    candidate['kind'] === 'sql_query' &&
    candidate['sqlState'] === '23505' &&
    candidate['table'] === 'cards' &&
    candidate['constraint'] === 'cards_pkey'
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

const parseSnapshotShape = (input: unknown): SpaceSnapshot => {
  const parsed = spaceSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    throw new SnapshotValidationError(parsed.error.message);
  }
  return parsed.data;
};

const parseImport = (input: unknown): ImportSpace => {
  const parsed = importSpaceSchema.safeParse(input);
  if (!parsed.success) {
    throw new SnapshotValidationError(parsed.error.message);
  }
  return parsed.data;
};

const duplicateIdentity = (spaces: readonly ImportSpace[]): UUID | undefined => {
  const seen = new Set<UUID>();

  for (const snapshot of spaces) {
    const identities = [
      snapshot.id,
      ...snapshot.cards.map(({ id }) => id),
      ...snapshot.document.routes.map(({ id }) => id),
      ...(snapshot.document.layouts ?? []).map(({ id }) => id),
    ];
    for (const id of identities) {
      if (id === undefined) continue;
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

const validateImportIdentities = (spaces: readonly ImportSpace[]): void => {
  const duplicate = duplicateIdentity(spaces);
  if (duplicate !== undefined) {
    throw new DuplicateIdentityError(`Duplicate durable identity "${duplicate}"`);
  }
};

const validateSnapshotIdentities = (snapshot: SpaceSnapshot): void => {
  const duplicate = duplicateIdentity([snapshot]);
  if (duplicate !== undefined) {
    throw new SnapshotValidationError(`Duplicate durable identity "${duplicate}"`);
  }
};

/**
 * Fill in every id the import input left out, producing the fully identified
 * aggregate that domain intake and the writes below both require.
 *
 * Ids are minted in process by `newUuid`. Only the space id comes from
 * PostgreSQL, and by the ordinary route: the `spaces.id` column default fires
 * when `Space.create` omits it, and the created row hands the value back as
 * `reservedSpaceId`. Routes and layouts are not rows at all — they live inside
 * the space document (ADR 0030) — so no column default can reach them, and
 * cards are minted here too, so the whole snapshot can be validated before the
 * first card is written.
 */
const resolveImport = (input: ImportSpace, reservedSpaceId: UUID): SpaceSnapshot => {
  const layouts = input.document.layouts?.map((layout) => ({
    ...layout,
    id: layout.id ?? newUuid(),
  }));

  return parseSnapshotShape({
    id: input.id ?? reservedSpaceId,
    document: {
      ...input.document,
      routes: input.document.routes.map((route) => ({ ...route, id: route.id ?? newUuid() })),
      ...(layouts === undefined ? {} : { layouts }),
    },
    cards: input.cards.map((card) => ({ ...card, id: card.id ?? newUuid() })),
  });
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

const importCards = async (orm: Orm, snapshot: SpaceSnapshot): Promise<void> => {
  for (const card of snapshot.cards) {
    try {
      await orm.public.Card.create({
        id: card.id,
        spaceId: snapshot.id,
        document: toJsonValue(card.document),
      });
    } catch (error) {
      if (isCardPrimaryKeyConflict(error)) {
        throw new CardOwnershipError(`Card ${card.id} already belongs to another space`);
      }
      throw error;
    }
  }
};

const truncateHyperContent = async (orm: Orm): Promise<void> => {
  const spaces = await orm.public.Space.all();
  for (const space of spaces) {
    await orm.public.Card.where({ spaceId: space.id }).deleteAll();
    await orm.public.Space.where({ id: space.id }).delete();
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
      validateSnapshotIdentities(accepted);
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

  async importSpaces(
    input: readonly ImportSpace[],
    mode: ImportMode = 'insert',
  ): Promise<RepositoryImportResult> {
    let accepted: ImportSpace[];
    try {
      accepted = input.map(parseImport);
      validateImportIdentities(accepted);
    } catch (error) {
      if (error instanceof SnapshotValidationError) {
        return rejectInvalidSnapshot(error);
      }
      if (error instanceof DuplicateIdentityError) {
        return {
          kind: 'rejected',
          code: 'duplicate-identity',
          message: error.message,
        };
      }
      throw error;
    }

    try {
      return await this.#database.transaction(async ({ orm }) => {
        const imported: StoredSpace[] = [];

        if (mode === 'truncate') await truncateHyperContent(orm);

        for (const importInput of accepted) {
          let space;
          try {
            space = await orm.public.Space.create({
              ...(importInput.id === undefined ? {} : { id: importInput.id }),
              document: toJsonValue({
                version: 2,
                title: importInput.document.title,
                routes: [],
              }),
              revision: 0,
            });
          } catch (error) {
            if (isSpacePrimaryKeyConflict(error)) {
              if (importInput.id === undefined) throw error;
              throw new ImportConflictError(importInput.id);
            }
            throw error;
          }

          const reservedSpaceId = uuidSchema.parse(space.id);
          const snapshot = resolveImport(importInput, reservedSpaceId);
          const intake = loadSpaceSnapshot(snapshot);
          if (!intake.ok) {
            throw new SnapshotValidationError(
              intake.errors.map(({ message }) => message).join('\n'),
            );
          }

          space = await orm.public.Space.where({ id: snapshot.id })
            .where({ revision: 0 })
            .update({ document: toJsonValue(snapshot.document) });
          if (space === null) {
            throw new Error(`Newly inserted space ${snapshot.id} disappeared during import`);
          }

          await importCards(orm, snapshot);

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
          code: 'card-ownership',
          message: error.message,
        };
      }
      if (error instanceof SnapshotValidationError) {
        return rejectInvalidSnapshot(error);
      }
      throw error;
    }
  }
}
