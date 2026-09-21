import { newUuid } from '@project/core';
import { postgresTarget } from '../prisma/target';
import { runDatabaseCli } from './database-entry';
import { cliArguments, processIo } from './process';

process.exitCode = await runDatabaseCli(postgresTarget, cliArguments(), processIo, newUuid);
