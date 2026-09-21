import type { SqliteDatabase } from '../sqlite/db';
import { sqliteHostComposition } from '../sqlite/composition';
import { sqliteTarget } from '../sqlite/target';
import { createDatabaseHttpApp, type DatabaseHttpRuntimeOptions } from './database-http-runtime';

export interface SqliteHttpRuntimeOptions extends DatabaseHttpRuntimeOptions {
  readonly database?: SqliteDatabase;
}

export const createApp = ({ database, ...options }: SqliteHttpRuntimeOptions = {}) =>
  createDatabaseHttpApp(
    database === undefined ? sqliteHostComposition().target : sqliteTarget({ database }),
    options,
  );
