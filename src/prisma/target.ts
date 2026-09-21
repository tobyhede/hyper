import { SqlSpaceRepository } from '../persistence/sql-space-repository';
import type { DatabaseTarget } from '../database/database-target';
import { createPostgresDatabase } from './db';
import { postgresSqlStore } from './sql-store';

export const postgresTarget: DatabaseTarget = {
  open() {
    const database = createPostgresDatabase();
    const store = postgresSqlStore(database);
    return Promise.resolve({
      repository: new SqlSpaceRepository(store),
      close: () => store.close(),
    });
  },
};
