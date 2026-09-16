#!/usr/bin/env -S node
import type { Contract as End } from './end-contract';
import endContract from './end-contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  foreignKey,
  lit,
  primaryKey,
} from '@prisma-next/sqlite/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        table: 'repository_state',
        columns: [
          col('meta_space_id', 'TEXT', { notNull: true }),
          col('singleton_id', 'INTEGER', { notNull: true, default: lit(1) }),
        ],
        constraints: [
          primaryKey(['singleton_id']),
          foreignKey(['meta_space_id'], 'spaces', ['id'], { onDelete: 'restrict' }),
        ],
      }),
      this.createTable({
        table: 'spaces',
        columns: [
          col('created_at', 'TEXT', { notNull: true, default: fn('now()') }),
          col('document', 'TEXT', { notNull: true }),
          col('exported_revision', 'TEXT'),
          col('id', 'TEXT', { notNull: true }),
          col('revision', 'TEXT', { notNull: true, default: lit('0') }),
          col('updated_at', 'TEXT', { notNull: true }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        table: 'things',
        columns: [
          col('created_at', 'TEXT', { notNull: true, default: fn('now()') }),
          col('document', 'TEXT', { notNull: true }),
          col('id', 'TEXT', { notNull: true }),
          col('space_id', 'TEXT', { notNull: true }),
          col('updated_at', 'TEXT', { notNull: true }),
        ],
        constraints: [
          primaryKey(['id']),
          foreignKey(['space_id'], 'spaces', ['id'], { onDelete: 'cascade' }),
        ],
      }),
      this.createIndex({
        table: 'repository_state',
        index: 'repository_state_meta_space_id_idx',
        columns: ['meta_space_id'],
      }),
      this.createIndex({ table: 'things', index: 'things_space_id_idx', columns: ['space_id'] }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
