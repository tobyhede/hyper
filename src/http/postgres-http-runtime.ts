import { postgresTarget } from '../prisma/target';
import { createDatabaseHttpApp, type DatabaseHttpRuntimeOptions } from './database-http-runtime';

export type PostgresHttpRuntimeOptions = DatabaseHttpRuntimeOptions;

export const createApp = (options: PostgresHttpRuntimeOptions = {}) =>
  createDatabaseHttpApp(postgresTarget, options);
