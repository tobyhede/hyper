import type { SqlStore } from '../../src/persistence/sql-store';

/**
 * A database's own `SqlStore`, unchanged except that every Resource row the
 * repository writes through it is recorded by id, in the order written.
 *
 * Of `SqlTables`'s Resource members, `create` and `upsert` write a Resource's
 * document and the other two only delete rows, so what this records is every
 * Resource row the repository rewrote through `SqlTables`, whichever database
 * answered and whichever transaction the write ran in. A write in a
 * transaction that later rolled back is recorded too: this counts what the
 * repository issued, not what survived.
 *
 * `Resource` below names every member rather than spreading the store's, so a
 * member added to `SqlTables['Resource']` fails typecheck here until it is
 * classified as a write to record or a pass-through.
 */
export const recordResourceWrites = <Handle, Order>(store: SqlStore<Handle, Order>) => {
  let written: string[] = [];
  const recording: SqlStore<Handle, Order> = {
    ...store,
    tables: (handle) => {
      const tables = store.tables(handle);
      return {
        ...tables,
        Resource: {
          create: (input) => {
            written.push(input.id);
            return tables.Resource.create(input);
          },
          upsert: (input) => {
            written.push(input.id);
            return tables.Resource.upsert(input);
          },
          deleteExcept: tables.Resource.deleteExcept,
          deleteAllForSpace: tables.Resource.deleteAllForSpace,
        },
      };
    },
  };
  /** Every Resource id written since the last call, and forget them. */
  const takeResourceWrites = (): readonly string[] => {
    const taken = written;
    written = [];
    return taken;
  };
  return { store: recording, takeResourceWrites };
};
