import { newUuid } from '@project/core';
import { runCliMain } from './main';
import { PostgresSpaceRepository } from '../persistence/postgres-space-repository';
import { db } from '../prisma/db';

const io = {
  stdout: (message: string) => process.stdout.write(message),
  stderr: (message: string) => process.stderr.write(message),
};

const processArgs = process.argv.slice(2);
const args = processArgs[0] === '--' ? processArgs.slice(1) : processArgs;

process.exitCode = await runCliMain(args, {
  repository: new PostgresSpaceRepository(db),
  io,
  newId: newUuid,
  close: () => db.close(),
});
