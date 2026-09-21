import { createPostgresDatabase } from '../../src/prisma/db';

/** One integration-suite handle; production opens PostgreSQL through its target. */
export const postgresTestDatabase = createPostgresDatabase();
