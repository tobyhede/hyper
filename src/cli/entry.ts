import { newUuid } from '@project/core';
import { runCliMain } from './main';
import { cliArguments, processIo } from './process';
import { SqlSpaceRepository } from '../persistence/sql-space-repository';
import { postgresSqlStore } from '../prisma/sql-store';

process.exitCode = await runCliMain(cliArguments(), {
  repository: new SqlSpaceRepository(postgresSqlStore),
  io: processIo,
  newId: newUuid,
  close: () => postgresSqlStore.close(),
});
