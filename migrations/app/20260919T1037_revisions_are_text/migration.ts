#!/usr/bin/env -S node
import type { Contract as End } from './end-contract';
import endContract from './end-contract.json' with { type: 'json' };
import type { Contract as Start } from './start-contract';
import startContract from './start-contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma-next/postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  /**
   * `revision` and `exported_revision` move from `int8` to `text` (ADR 0095):
   * both databases now store a Revision as canonical decimal TEXT, with one
   * shared codec owning the format and the 2^63−1 ceiling on both sides.
   *
   * Neither column needs a `dataTransform` — `alterColumnType` without a
   * `using` option already defaults to `USING "<column>"::<targetType>`
   * (`node_modules/@prisma-next/target-postgres`'s `operations/columns.ts`,
   * `alterColumnType`), and casting an `int8` to `text` is Postgres's ordinary
   * numeric-to-text formatting — every stored value becomes its canonical
   * decimal digits with no loss. Checked directly against a real database:
   * migrated to the prior migration, seeded `spaces` rows with `revision`
   * `9223372036854775807` (2^63−1), `0`, and `exported_revision` `42` and
   * `NULL` as `int8`, ran this migration, and read every value back as the
   * same canonical digits under `text` — `pg_typeof(revision)` reads `text`
   * and `\d spaces` shows `revision text not null default '0'::text`,
   * `exported_revision text`.
   *
   * `revision`'s old `int8` default (`DEFAULT 0`) is dropped before the type
   * change rather than left for `alterColumnType` to recast — Postgres carries
   * an existing default across a type change by recasting the default
   * expression too, and recasting the integer literal `0` to `text` lands as
   * the bare token `0` rather than the quoted string literal `'0'`. That is a
   * valid `text` default (`column_default` reads `0`), but this repo's
   * `db:migrate` failed `SCHEMA_VERIFY_FAILED` against it — the live default's
   * `resolved.value` came back the JS number `0`, not the contract's string
   * `"0"` (`@prisma-next/target-postgres`'s `default-normalizer.ts`:
   * `parsePostgresDefault` returns a numeric `literal` for any digit-only
   * default text, and only widens that back to a string for an `int8`/`bigint`
   * column past `Number.MAX_SAFE_INTEGER` — a `text` column's digit-only
   * default has no such guard). Dropping the default first means there is
   * nothing for the type change to recast, and the explicit `setDefault` below
   * writes the quoted `'0'` this contract expects.
   */
  override get operations() {
    return [
      this.dropDefault({ schema: 'public', table: 'spaces', column: 'revision' }),
      this.alterColumnType({
        schema: 'public',
        table: 'spaces',
        column: 'exported_revision',
        options: {
          qualifiedTargetType: 'text',
          formatTypeExpected: 'text',
          rawTargetTypeForLabel: 'text',
        },
      }),
      this.alterColumnType({
        schema: 'public',
        table: 'spaces',
        column: 'revision',
        options: {
          qualifiedTargetType: 'text',
          formatTypeExpected: 'text',
          rawTargetTypeForLabel: 'text',
        },
      }),
      this.setDefault({
        schema: 'public',
        table: 'spaces',
        column: 'revision',
        defaultSql: "DEFAULT '0'",
        operationClass: 'widening',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
