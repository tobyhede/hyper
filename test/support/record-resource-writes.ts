import type { SqlStore } from '../../src/persistence/sql-store';

/**
 * A database's own `SqlStore`, unchanged except that every Resource row the
 * repository writes through it is recorded by id, in the order written.
 *
 * `Resource.create` and `Resource.upsert` are the only `SqlTables` members that
 * write a Resource's document, so what this records is every Resource row the
 * repository rewrote, whichever database answered and whichever transaction
 * the write ran in. A write in a transaction that later rolled back is
 * recorded too: this counts what the repository issued, not what survived.
 */
export const recordResourceWrites = <Handle, Order>(
  store: SqlStore<Handle, Order>,
): {
  readonly store: SqlStore<Handle, Order>;
  /** Every Resource id written since the last call, and forget them. */
  readonly takeResourceWrites: () => readonly string[];
} => {
  let written: string[] = [];
  return {
    store: {
      ...store,
      tables: (handle) => {
        const tables = store.tables(handle);
        return {
          ...tables,
          Resource: {
            ...tables.Resource,
            create: (input) => {
              written.push(input.id);
              return tables.Resource.create(input);
            },
            upsert: (input) => {
              written.push(input.id);
              return tables.Resource.upsert(input);
            },
          },
        };
      },
    },
    takeResourceWrites: () => {
      const taken = written;
      written = [];
      return taken;
    },
  };
};
