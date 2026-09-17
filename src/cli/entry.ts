import { newUuid } from '@project/core';
import { runCliMain } from './main';
import { cliArguments, processIo } from './process';
import { PostgresSpaceRepository } from '../persistence/postgres-space-repository';
import { db } from '../prisma/db';

process.exitCode = await runCliMain(cliArguments(), {
  repository: new PostgresSpaceRepository(db),
  io: processIo,
  newId: newUuid,
  close: () => db.close(),
});
