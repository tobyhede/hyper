import {
  cardDocumentSchema,
  importSpaceSchema,
  newUuid,
  SPACE_FILE_VERSION,
  spaceDocumentSchema,
  spaceSnapshotSchema,
  uuidSchema,
  type ImportSpace,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceAggregate as validateSpaceAggregate, loadSpaceSnapshot } from '@project/graph';
import type {
  LoadedAggregate,
  LoadedSpace,
  RepositoryCommitResult,
  SpaceCommit,
  SpaceConflict,
  SpaceSummary,
} from '@project/persistence';
import { db } from '../prisma/db';
import type { ImportMode, RepositoryImportResult, SpaceRepository } from './space-repository';

type Orm = typeof db.orm;
type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
type SpaceCreateInput = Parameters<Orm['public']['Space']['create']>[0];

class SnapshotValidationError extends Error {}

class DuplicateIdentityError extends Error {}

class CardOwnershipError extends Error {}

interface SqlPrimaryKeyConflictFields {
  readonly kind?: unknown;
  readonly sqlState?: unknown;
  readonly table?: unknown;
  readonly constraint?: unknown;
}

const isPrimaryKeyConflict = (
  error: unknown,
  table: string,
  constraint: string,
): error is SqlPrimaryKeyConflictFields => {
  if (typeof error !== 'object' || error === null) return false;
  // SAFETY: checked above — error is a non-null object, so probing named
  // fields on it (each still typed unknown until compared) cannot throw.
  const candidate = error as SqlPrimaryKeyConflictFields;
  return (
    candidate.kind === 'sql_query' &&
    candidate.sqlState === '23505' &&
    candidate.table === table &&
    candidate.constraint === constraint
  );
};

const isSpacePrimaryKeyConflict = (error: unknown): error is SqlPrimaryKeyConflictFields =>
  isPrimaryKeyConflict(error, 'spaces', 'spaces_pkey');

const isCardPrimaryKeyConflict = (error: unknown): error is SqlPrimaryKeyConflictFields =>
  isPrimaryKeyConflict(error, 'cards', 'cards_pkey');

const toRevision = (value: number | string | bigint): bigint => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError(`Database revision ${value} is not a safe integer`);
  }
  return typeof value === 'bigint' ? value : BigInt(value);
};

const toOptionalRevision = (value: number | string | bigint | null): bigint | null =>
  value === null ? null : toRevision(value);

/**
 * SAFETY: Prisma Next 0.16.0 declares `int8` inputs as `number`, although its
 * codec passes values through unchanged at runtime and node-postgres accepts
 * bigint parameters directly — this relabels the type without converting the
 * value, so no precision is lost the way a real `Number(value)` call could
 * lose it above `Number.MAX_SAFE_INTEGER`. `bigint` and `number` have no
 * direct assertion path in TypeScript, hence the `unknown` bridge. Keep the
 * upstream type workaround isolated here so revisions are never narrowed.
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
  const intake = loadSpaceSnapshot(input);
  if (!intake.ok) {
    throw new SnapshotValidationError(intake.errors.map(({ message }) => message).join('\n'));
  }

  return intake.snapshot;
};

interface SchemaIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/**
 * Zod serializes its entire issue array into `Error.message`, and both callers
 * below hand that to `rejectInvalidSnapshot`, which puts it in the
 * `{ message: string }` error contract — a JSON document nested inside a field
 * the CLI prints and clients render as a sentence. `parseSnapshot` above already
 * throws located intake prose; these two were the last raw dumps on the import
 * path.
 *
 * The same answer `decodeSnapshot` gives in `@project/persistence`'s wire codec
 * (`packages/persistence/src/http-protocol.ts`): the first three failing paths
 * and their reasons, then a count of the rest. Restated here rather than shared,
 * because sharing it means exporting a string-formatting helper from a
 * browser-safe package for one server-side caller. What the two owe each other
 * is the behaviour — prose, not Zod — and that format is the whole of the debt,
 * so neither moves alone: one failure should not read one way at the CLI and
 * another on the wire. `postgres-import-decoding.test.ts` holds them to it.
 *
 * The fold to lower case is checked rather than incidental. Zod capitalises a
 * sentence that stands alone; here it is a clause after a path, so it reads as
 * one — but only while no message carries a word whose case is information.
 * None does: Zod 3 writes `Invalid uuid`, no reachable message echoes the input
 * back, and every literal `@project/core` declares is already lower case, so the
 * kinds a discriminator quotes survive intact. It costs exactly one thing, the
 * capital on the second sentence of that discriminator message. The test scans
 * real failures from both schemas for an acronym or a capitalised quoted
 * identifier, so the day Zod or a literal grows one, this stops being safe out
 * loud rather than quietly.
 *
 * `issues` is never empty. A failed `safeParse` goes through Zod's
 * `handleResult`, which throws `Validation failed but no issues detected.`
 * rather than returning a zero-issue error, so the summary always names a path
 * and `remaining` never counts below zero.
 */
const describeSchemaFailure = (issues: readonly SchemaIssue[], label: string): string => {
  const described = issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'space'} ${issue.message.toLowerCase()}`)
    .join('; ');
  const remaining = issues.length - 3;
  return `${label} is invalid: ${described}${remaining > 0 ? ` (and ${remaining} more)` : ''}`;
};

const parseSnapshotSchema = (input: unknown): SpaceSnapshot => {
  const parsed = spaceSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    throw new SnapshotValidationError(
      describeSchemaFailure(parsed.error.issues, 'identified space'),
    );
  }
  return parsed.data;
};

const parseImport = (input: unknown): ImportSpace => {
  const parsed = importSpaceSchema.safeParse(input);
  if (!parsed.success) {
    throw new SnapshotValidationError(describeSchemaFailure(parsed.error.issues, 'import space'));
  }
  return parsed.data;
};

/**
 * The identities a batch may not repeat: space ids among spaces, card ids among
 * cards. Both are rows, so both must stay unique across the database.
 *
 * Per kind, and no wider. An earlier version pooled space, card, graph and
 * layout ids into one set spanning the whole batch, which rejected two things
 * the model allows (ADR 0030): a graph id reused in a second Space, and one UUID
 * naming entities of different kinds. It also made acceptance depend on how a
 * batch was split — importing two such Spaces separately succeeded while
 * importing them together failed, for identical stored results.
 *
 * Graph and layout ids are absent here deliberately. They resolve only inside
 * the space document that carries them, and normal domain intake already rejects
 * duplicates of each kind within a Space (`duplicate-graph-id`,
 * `duplicate-layout-id`). Checking them here would either duplicate that or
 * exceed it.
 */
const duplicateIdentity = (
  spaces: readonly ImportSpace[],
): { readonly kind: string; readonly id: UUID } | undefined => {
  const spaceIds = new Set<UUID>();
  const cardIds = new Set<UUID>();

  for (const space of spaces) {
    if (space.id !== undefined) {
      if (spaceIds.has(space.id)) return { kind: 'space', id: space.id };
      spaceIds.add(space.id);
    }
    for (const { id } of space.cards) {
      if (id === undefined) continue;
      if (cardIds.has(id)) return { kind: 'card', id };
      cardIds.add(id);
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
    throw new DuplicateIdentityError(`Duplicate ${duplicate.kind} identity "${duplicate.id}"`);
  }
};

/**
 * Fill in every id the import input left out, producing the fully identified
 * aggregate that domain intake and the writes below both require.
 *
 * Ids are minted in process by `newUuid`. Only the space id comes from
 * PostgreSQL, and by the ordinary path: the `spaces.id` column default fires
 * when `Space.create` omits it, and the created row hands the value back as
 * `reservedSpaceId`. Graphs and layouts are not rows at all — they live inside
 * the space document (ADR 0030) — so no column default can reach them, and
 * cards are minted here too, so the whole snapshot can be validated before the
 * first card is written.
 *
 * A layout's id and the ids of the graphs it owns are minted in the **same
 * pass**, because under version 1 a graph is reached only through its owner
 * (ADR 0040): there is no space-level collection to walk beside the layouts.
 * That the pass runs before `parseSnapshotSchema` and before the first card write
 * is what keeps a rejection rolling the complete batch back.
 */
const resolveImport = (input: ImportSpace, reservedSpaceId: UUID): SpaceSnapshot => {
  const layouts = input.document.layouts?.map((layout) => ({
    ...layout,
    id: layout.id ?? newUuid(),
    graphs: layout.graphs.map((graph) => ({ ...graph, id: graph.id ?? newUuid() })),
  }));

  const document = layouts === undefined ? { ...input.document } : { ...input.document, layouts };

  return parseSnapshotSchema({
    id: input.id ?? reservedSpaceId,
    document,
    cards: input.cards.map((card) => ({ ...card, id: card.id ?? newUuid() })),
  });
};

/**
 * One statement, so one snapshot: PostgreSQL fixes it at statement start, and
 * `include` compiles the child rows into a correlated aggregate rather than a
 * second round trip. Other transactions still commit while this runs — they are
 * simply not in the snapshot it reads from, so the document and its cards
 * cannot come from either side of one. There is no torn read to detect and no
 * revision comparison to make.
 */
const loadSpaceAggregate = async (orm: Orm, id: UUID): Promise<LoadedSpace | undefined> => {
  const stored = await orm.public.Space.where({ id })
    .include('cards', (cards) => cards.select('id', 'document').orderBy((card) => card.id.asc()))
    .first();
  if (stored === null) return undefined;

  const snapshot = parseSnapshot({
    id: stored.id,
    document: spaceDocumentSchema.parse(stored.document),
    cards: stored.cards.map((card) => ({
      id: card.id,
      document: cardDocumentSchema.parse(card.document),
    })),
  });

  return {
    snapshot,
    revision: toRevision(stored.revision),
    exportedRevision: toOptionalRevision(stored.exportedRevision),
  };
};

const loadEverySpace = async (orm: Orm): Promise<readonly LoadedSpace[]> => {
  const stored = await orm.public.Space.orderBy((space) => space.id.asc())
    .include('cards', (cards) => cards.select('id', 'document').orderBy((card) => card.id.asc()))
    .all();

  return stored.map((space) => ({
    snapshot: parseSnapshot({
      id: space.id,
      document: space.document,
      cards: space.cards.map((card) => ({ id: card.id, document: card.document })),
    }),
    revision: toRevision(space.revision),
    exportedRevision: toOptionalRevision(space.exportedRevision),
  }));
};

/**
 * Take the singleton row's write lock, and answer `undefined` when there is no
 * row to take.
 *
 * A repository that has only been migrated has no Meta Space, and there is then
 * nothing to serialize integrity-affecting transactions on and no aggregate to
 * validate. That is not a reason to fail a commit outright: identity and
 * revision conflicts are answerable without Meta, and `MemorySpaceRepository`
 * answers them first. Requiring Meta here instead made a commit against an
 * unbootstrapped database throw, which the HTTP host reports as a retryable
 * 503.
 */
const lockRepositoryState = async (orm: Orm): Promise<UUID | undefined> => {
  const state = await orm.public.RepositoryState.where({ singletonId: 1 }).first();
  if (state === null) return undefined;
  const metaSpaceId = uuidSchema.parse(state.metaSpaceId);
  const locked = await orm.public.RepositoryState.where({ singletonId: 1 }).update({ metaSpaceId });
  if (locked === null) throw new Error('Repository state disappeared while locking it');
  return metaSpaceId;
};

const replaceStoredSpace = async (
  orm: Orm,
  snapshot: SpaceSnapshot,
  revision: bigint,
): Promise<void> => {
  const updated = await orm.public.Space.where({ id: snapshot.id }).update({
    document: toJsonValue(snapshot.document),
    revision: toDatabaseRevision(revision),
  });
  if (updated === null) throw new Error(`Space ${snapshot.id} disappeared during commit`);
  await upsertCards(orm, snapshot);
  const ownedCards = orm.public.Card.where({ spaceId: snapshot.id });
  if (snapshot.cards.length === 0) await ownedCards.delete();
  else {
    await ownedCards.where((card) => card.id.notIn(snapshot.cards.map(({ id }) => id))).delete();
  }
};

const createStoredSpace = async (orm: Orm, snapshot: SpaceSnapshot): Promise<void> => {
  await orm.public.Space.create({
    id: snapshot.id,
    document: toJsonValue(snapshot.document),
    revision: 0,
  });
  await importCards(orm, snapshot);
};

const commitIdentityRefusal = (request: SpaceCommit): string | undefined => {
  const ids = new Set<UUID>();
  for (const change of request.changes) {
    if (ids.has(change.spaceId)) return `Space ${change.spaceId} is named more than once`;
    ids.add(change.spaceId);
    if (change.kind !== 'delete' && change.snapshot.id !== change.spaceId) {
      return `Change Space id ${change.spaceId} does not match its snapshot`;
    }
  }
  return undefined;
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
  // Meta state names a Space, so it cannot outlive the Spaces. Leaving the row
  // behind makes every later commit fail complete intake with
  // `meta-space-missing`, naming a Space nothing can restore.
  await orm.public.RepositoryState.where({ singletonId: 1 }).delete();
};

/**
 * Establish Meta state when the repository has none, and leave it alone
 * otherwise.
 *
 * The singleton row is what `commit` and `loadAggregate` lock and read, and the
 * migration deliberately creates the table empty — a migration has no Space to
 * name. So the paths that first put a Space in the repository are what
 * establish it: bootstrap and administrative import both go through these, the
 * way `MemorySpaceRepository` does. Choosing the Meta Space properly, and
 * retiring the Entry flag it stands in for here, is `v1-release/01`.
 */
const establishMetaSpace = async (orm: Orm, candidate: UUID | undefined): Promise<void> => {
  if (candidate === undefined) return;
  const existing = await orm.public.RepositoryState.where({ singletonId: 1 }).first();
  if (existing !== null) return;
  await orm.public.RepositoryState.create({ singletonId: 1, metaSpaceId: candidate });
};

export class PostgresSpaceRepository implements SpaceRepository {
  readonly #database: typeof db;

  constructor(database: typeof db = db) {
    this.#database = database;
  }

  async entrySpaceId(): Promise<UUID | undefined> {
    const entry = await this.#database.orm.public.Space.where({ entry: true }).first();
    return entry === null ? undefined : uuidSchema.parse(entry.id);
  }

  async setEntrySpace(id: UUID): Promise<void> {
    await this.#database.transaction(async ({ orm }) => {
      const selected = await orm.public.Space.where({ id }).first();
      if (selected === null) throw new Error(`Space ${id} does not exist`);
      if (selected.entry === true) return;

      const previous = await orm.public.Space.where({ entry: true }).first();
      if (previous !== null) {
        await orm.public.Space.where({ id: previous.id }).update({ entry: null });
      }
      const updated = await orm.public.Space.where({ id }).update({ entry: true });
      if (updated === null) throw new Error(`Space ${id} disappeared while becoming Entry Space`);
      await establishMetaSpace(orm, id);
    });
  }

  async listSpaces(): Promise<readonly SpaceSummary[]> {
    const spaces = await this.#database.orm.public.Space.orderBy((space) => space.id.asc()).all();

    return spaces.map((space) => ({
      id: uuidSchema.parse(space.id),
      title: spaceDocumentSchema.parse(space.document).title,
    }));
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    return loadSpaceAggregate(this.#database.orm, id);
  }

  loadAggregate(): Promise<LoadedAggregate> {
    return this.#database.transaction(async ({ orm }) => {
      const metaSpaceId = await lockRepositoryState(orm);
      // A complete read has no answer without Meta, unlike a commit, which can
      // still name a conflict. Nothing establishes it but the paths that put a
      // Space in the repository, so reaching here without one is a broken
      // invariant rather than a request the caller got wrong.
      if (metaSpaceId === undefined) throw new Error('Repository state has not been bootstrapped');
      return { metaSpaceId, spaces: await loadEverySpace(orm) };
    });
  }

  async markExported(id: UUID, revision: bigint): Promise<void> {
    const updated = await this.#database.orm.public.Space.where({ id }).update({
      exportedRevision: toDatabaseRevision(revision),
    });
    if (updated === null) throw new Error(`Space ${id} does not exist`);
  }

  async commit(request: SpaceCommit): Promise<RepositoryCommitResult> {
    const refusal = commitIdentityRefusal(request);
    if (refusal !== undefined)
      return { kind: 'rejected', code: 'invalid-commit', message: refusal };

    try {
      return await this.#commitInTransaction(request);
    } catch (error) {
      // A Card the commit writes is still owned by a Space the same commit did
      // not release. Complete intake cannot see it — the candidate aggregate is
      // consistent and the collision only exists in the stored rows the write
      // loop meets in request order. It is permanent, so it has to leave here
      // as a rejection: escaping instead becomes 503 `persistence-unavailable`,
      // which the client retries forever. `importSpaces` answers the same
      // error the same way.
      if (error instanceof CardOwnershipError) {
        return { kind: 'rejected', code: 'invalid-commit', message: error.message };
      }
      throw error;
    }
  }

  #commitInTransaction(request: SpaceCommit): Promise<RepositoryCommitResult> {
    return this.#database.transaction(async ({ orm }) => {
      const metaSpaceId = await lockRepositoryState(orm);
      const stored = await loadEverySpace(orm);
      const byId = new Map(stored.map((space) => [space.snapshot.id, space]));
      const conflicts: SpaceConflict[] = [];
      for (const change of request.changes) {
        const current = byId.get(change.spaceId);
        const stale =
          change.kind === 'create'
            ? current !== undefined
            : current?.revision !== change.expectedRevision;
        if (stale) conflicts.push({ spaceId: change.spaceId, current });
      }
      if (conflicts.length > 0) return { kind: 'conflict', conflicts };

      const candidate = new Map(byId);
      for (const change of request.changes) {
        if (change.kind === 'delete') candidate.delete(change.spaceId);
        else {
          candidate.set(change.spaceId, {
            snapshot: structuredClone(change.snapshot),
            revision: change.kind === 'create' ? 0n : change.expectedRevision + 1n,
            exportedRevision: byId.get(change.spaceId)?.exportedRevision ?? null,
          });
        }
      }
      // Answered after the conflicts, exactly as `MemorySpaceRepository` does:
      // a change set naming a Space the store does not hold is a conflict
      // whether or not Meta has been established, and only what follows needs a
      // complete aggregate to check.
      if (metaSpaceId === undefined) {
        return {
          kind: 'rejected',
          code: 'invalid-commit',
          message: 'The repository has no Meta Space',
        };
      }
      /*
       * Only a reference the caller did not submit is authoritative state, and
       * only that makes an incomplete deletion a conflict it can resolve by
       * reloading. A reference the caller kept in its own change set is its own
       * proposal, and answering `conflict` for it cannot be recovered from: the
       * reload returns the target at the revision the caller already holds, so
       * the identical change set conflicts again, forever. That falls through
       * to complete intake below and is refused. `memory.ts` draws the same
       * line, and `repository-contract.ts` holds both to it.
       */
      const changedIds = new Set(request.changes.map((change) => change.spaceId));
      const incompleteDeletes = request.changes.flatMap((change) => {
        if (change.kind !== 'delete') return [];
        const stillReferenced = [...candidate.values()].some(
          ({ snapshot }) =>
            !changedIds.has(snapshot.id) &&
            snapshot.cards.some(
              (card) => card.document.kind === 'space' && card.document.spaceId === change.spaceId,
            ),
        );
        return stillReferenced
          ? [{ spaceId: change.spaceId, current: byId.get(change.spaceId) }]
          : [];
      });
      if (incompleteDeletes.length > 0) {
        return { kind: 'conflict', conflicts: incompleteDeletes };
      }
      const aggregate = validateSpaceAggregate({
        metaSpaceId,
        snapshots: [...candidate.values()].map(({ snapshot }) => snapshot),
      });
      if (!aggregate.ok) return { kind: 'aggregate-refused', errors: aggregate.errors };

      const revisions: { spaceId: UUID; revision: bigint }[] = [];
      const deletedSpaceIds: UUID[] = [];
      for (const change of request.changes) {
        if (change.kind === 'delete') {
          await orm.public.Card.where({ spaceId: change.spaceId }).deleteAll();
          const deleted = await orm.public.Space.where({ id: change.spaceId }).delete();
          if (deleted === null)
            throw new Error(`Space ${change.spaceId} disappeared during commit`);
          deletedSpaceIds.push(change.spaceId);
        } else if (change.kind === 'create') {
          await createStoredSpace(orm, change.snapshot);
          revisions.push({ spaceId: change.spaceId, revision: 0n });
        } else {
          const revision = change.expectedRevision + 1n;
          await replaceStoredSpace(orm, change.snapshot, revision);
          revisions.push({ spaceId: change.spaceId, revision });
        }
      }
      return { kind: 'committed', revisions, deletedSpaceIds };
    });
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
        const imported: LoadedSpace[] = [];

        if (mode === 'truncate') await truncateHyperContent(orm);

        for (const importInput of accepted) {
          let space;
          try {
            // A placeholder document, replaced below once the space id it is
            // being inserted to reserve is known. It carries no graph
            // collection, because a space has none until a layout exists to own
            // one (ADR 0040) — under version 2 this was an empty space-level
            // array, and there is no longer a key for it to be empty in.
            const spaceCreateInput: SpaceCreateInput = {
              document: toJsonValue({
                version: SPACE_FILE_VERSION,
                title: importInput.document.title,
              }),
              revision: 0,
            };
            if (importInput.id !== undefined) spaceCreateInput.id = importInput.id;
            space = await orm.public.Space.create(spaceCreateInput);
          } catch (error) {
            // An explicit id that collides is an identity rejection, never a
            // revision conflict: insert-only import compares no revisions, so
            // there is nothing to disagree about — the id is simply taken.
            //
            // Deliberately classified off the violation rather than off a
            // preceding existence check. Under READ COMMITTED a check would see
            // a rival's row only if that rival had already committed, so
            // "existed before I began" versus "created while I ran" would be
            // decided by commit timing, giving identical inputs different
            // outcomes. Both are the same fact, so draw no line between them.
            if (isSpacePrimaryKeyConflict(error)) {
              if (importInput.id === undefined) throw error;
              throw new DuplicateIdentityError(`Space ${importInput.id} already exists`);
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

          // The only read that runs inside a transaction, and it reads rows this
          // transaction has just written and not yet committed. That is exactly
          // what a transaction sees of its own work, and the aggregate is still
          // one statement here.
          const stored = await loadSpaceAggregate(orm, snapshot.id);
          if (stored === undefined) {
            throw new Error(`Space ${snapshot.id} disappeared during import`);
          }
          imported.push(stored);
        }

        await establishMetaSpace(orm, imported[0]?.snapshot.id);
        return { kind: 'imported', spaces: imported };
      });
    } catch (error) {
      if (error instanceof DuplicateIdentityError) {
        return {
          kind: 'rejected',
          code: 'duplicate-identity',
          message: error.message,
        };
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
