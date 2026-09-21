#!/usr/bin/env -S node
import type { Contract as End } from './end-contract';
import endContract from './end-contract.json' with { type: 'json' };
import type { Contract as Start } from './start-contract';
import startContract from './start-contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  foreignKey,
  primaryKey,
} from '@prisma-next/sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  /**
   * **This migration destroys every row in `things`.** Prisma Next 0.16.0 has
   * no table-rename operation, so the generated plan creates an empty
   * `resources` table and drops `things` without copying the stored Resource
   * documents.
   *
   * **The loss is wider than this table, and a reset is the only answer that
   * fully works.** `spaces` is untouched here, so every surviving row's
   * `document` still carries the retired `diagrams` and `defaultDiagram` keys.
   * `spaceFileSchema` is a `z.strictObject`, so those rows now fail intake on
   * unrecognized keys rather than loading — a developer who migrates without
   * exporting first is left with unreadable Spaces, not the empty database this
   * table's loss alone would suggest. No migration rewrites `spaces.document`,
   * because ADR 0056 makes a reset the supported answer.
   *
   * This loss is accepted because ADR 0056 makes every database derived and
   * resettable. A developer whose local content matters must export it first
   * with `pnpm hyper export <dir>`, run the migration, then import it again with
   * `pnpm hyper <dir>`.
   */
  override get operations() {
    return [
      this.createTable({
        table: 'resources',
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
        table: 'resources',
        index: 'resources_space_id_idx',
        columns: ['space_id'],
      }),
      this.dropTable({ table: 'things' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
