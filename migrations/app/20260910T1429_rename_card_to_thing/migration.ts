#!/usr/bin/env -S node
import type { Contract as End } from './end-contract';
import endContract from './end-contract.json' with { type: 'json' };
import type { Contract as Start } from './start-contract';
import startContract from './start-contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma-next/postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropTable({ schema: 'public', table: 'cards' }),
      this.createTable({
        schema: 'public',
        table: 'things',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz@1' },
          }),
          col('document', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', '"uuid"', {
            notNull: true,
            default: fn('gen_random_uuid()'),
            codecRef: { codecId: 'pg/uuid@1', typeParams: {} },
          }),
          col('space_id', '"uuid"', {
            notNull: true,
            codecRef: { codecId: 'pg/uuid@1', typeParams: {} },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'things',
        index: 'things_space_id_idx',
        columns: ['space_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'things',
        foreignKey: {
          name: 'things_space_id_fkey',
          columns: ['space_id'],
          references: { schema: 'public', table: 'spaces', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
