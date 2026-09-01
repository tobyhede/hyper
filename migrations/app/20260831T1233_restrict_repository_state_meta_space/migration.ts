#!/usr/bin/env -S node
import type { Contract as End } from './end-contract';
import endContract from './end-contract.json' with { type: 'json' };
import type { Contract as Start } from './start-contract';
import startContract from './start-contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma-next/postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createIndex({
        schema: 'public',
        table: 'repository_state',
        index: 'repository_state_meta_space_id_idx',
        columns: ['meta_space_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'repository_state',
        foreignKey: {
          name: 'repository_state_meta_space_id_fkey',
          columns: ['meta_space_id'],
          references: { schema: 'public', table: 'spaces', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
