import {
  spaceDocumentSchema,
  thingDocumentSchema,
  uuidSchema,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { decodeStoredRevision, type LoadedSpace, type SpaceSummary } from '@project/persistence';
import type { SqlStore } from './sql-store';

class SnapshotValidationError extends Error {}

const parseSnapshot = (input: unknown): SpaceSnapshot => {
  const intake = loadSpaceSnapshot(input);
  if (!intake.ok) {
    throw new SnapshotValidationError(intake.errors.map(({ message }) => message).join('\n'));
  }
  return intake.snapshot;
};

/**
 * The one SQL Space repository (ADR 0095), serving `listSpaces` and
 * `loadSpace` for both databases through a database's own `SqlStore`
 * (`src/prisma/sql-store.ts`, `src/sqlite/sql-store.ts`). This is ticket 22's
 * tracer slice: `loadAggregate`, the two lifecycle doors, `markExported` and
 * `commit` stay on `PostgresSpaceRepository`/`SqliteSpaceRepository` until
 * tickets 23 and 24 move them here and delete those two adapters.
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
}
