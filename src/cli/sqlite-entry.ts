import { newUuid } from '@project/core';
import { sqliteCliComposition } from '../sqlite/composition';
import { runDatabaseCli } from './database-entry';
import { cliArguments, processIo } from './process';

process.exitCode = await runDatabaseCli(
  sqliteCliComposition().target,
  cliArguments(),
  processIo,
  newUuid,
);
