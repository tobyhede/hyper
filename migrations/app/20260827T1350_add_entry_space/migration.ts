#!/usr/bin/env -S node
import type { Contract as End } from './end-contract';
import endContract from './end-contract.json' with { type: 'json' };
import type { Contract as Start } from './start-contract';
import startContract from './start-contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma-next/postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'spaces',
        column: col('entry', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'spaces',
        constraint: 'spaces_entry_key',
        columns: ['entry'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
