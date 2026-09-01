#!/usr/bin/env -S node
import type { Contract as End } from './end-contract';
import endContract from './end-contract.json' with { type: 'json' };
import type { Contract as Start } from './start-contract';
import startContract from './start-contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  lit,
  primaryKey,
  rawSql,
} from '@prisma-next/postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'repository_state',
        columns: [
          col('meta_space_id', '"uuid"', {
            notNull: true,
            codecRef: { codecId: 'pg/uuid@1', typeParams: {} },
          }),
          col('singleton_id', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['singleton_id'])],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'repository_state',
        constraint: 'repository_state_singleton_id_check',
        column: 'singleton_id',
        values: ['1'],
      }),
      rawSql({
        id: 'data_migration.bootstrap_repository_state',
        label: 'Bootstrap repository state from the legacy Entry Space',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [
          {
            description: 'check repository state needs bootstrapping',
            sql: 'SELECT NOT EXISTS (SELECT 1 FROM "public"."repository_state") AS "result"',
            params: [],
          },
        ],
        execute: [
          {
            description: 'bootstrap repository state from the legacy Entry Space',
            sql: 'INSERT INTO "public"."repository_state" ("meta_space_id", "singleton_id") SELECT "id", 1 FROM "public"."spaces" WHERE "entry" = TRUE LIMIT 1',
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify every non-empty repository has singleton state',
            sql: 'SELECT (NOT EXISTS (SELECT 1 FROM "public"."spaces") OR EXISTS (SELECT 1 FROM "public"."repository_state" WHERE "singleton_id" = 1)) AS "result"',
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
