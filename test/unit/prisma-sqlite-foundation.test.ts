import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import contractJson from '../../src/sqlite/contract.json' with { type: 'json' };
import {
  configuredSqlitePath,
  createSqliteDatabase,
  requireConfiguredSqlitePath,
} from '../../src/sqlite/db';

const viteConfig = readFileSync(
  fileURLToPath(new URL('../../packages/app/vite.config.ts', import.meta.url)),
  'utf8',
);
const sqliteViteConfig = readFileSync(
  fileURLToPath(new URL('../../packages/app/vite.sqlite.config.ts', import.meta.url)),
  'utf8',
);
const databaseViteConfig = readFileSync(
  fileURLToPath(new URL('../../packages/app/database-vite-config.ts', import.meta.url)),
  'utf8',
);

const spaceColumns = contractJson.storage.namespaces.__unbound__.entries.table.spaces.columns;
const spaceFields = contractJson.domain.namespaces.__unbound__.models.Space.fields;

describe('Prisma Next SQLite foundation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('emits a SQLite contract whose revisions are text, not integer', () => {
    expect(contractJson.target).toBe('sqlite');
    expect(spaceFields.revision.type.codecId).toBe('sqlite/text@1');
    expect(spaceFields.exportedRevision.type.codecId).toBe('sqlite/text@1');
    expect(spaceColumns.revision).toMatchObject({
      codecId: 'sqlite/text@1',
      nativeType: 'text',
      default: { kind: 'literal', value: '0' },
    });
    expect(spaceColumns.exported_revision.codecId).toBe('sqlite/text@1');
  });

  it('does not mint Space ids in the database', () => {
    expect(spaceColumns.id).not.toHaveProperty('default');
    expect(spaceFields.id.type.codecId).toBe('sqlite/text@1');
  });

  it('omits a database path when SQLITE_PATH is blank', async () => {
    vi.stubEnv('SQLITE_PATH', ' \t ');

    const { default: config } = await import('../../prisma-next.config.sqlite');

    expect(config.db).toBeUndefined();
  });

  it('trims a configured SQLITE_PATH', async () => {
    vi.stubEnv('SQLITE_PATH', '  /tmp/hyper.db  ');

    const { default: config } = await import('../../prisma-next.config.sqlite');

    expect(config.db).toEqual({ connection: '/tmp/hyper.db' });
  });

  it('constructs the runtime client without a blank SQLITE_PATH binding', () => {
    const database = createSqliteDatabase();

    expect(database.contract.domain.namespaces.__unbound__.models).toHaveProperty('Space');
  });

  it('applies the same absolute-path rule to every SQLite caller', () => {
    vi.stubEnv('SQLITE_PATH', 'relative/hyper.db');
    expect(() => requireConfiguredSqlitePath()).toThrow(
      'SQLITE_PATH must be an absolute path: relative/hyper.db',
    );
  });

  it('allows offline migration planning without a configured path', () => {
    vi.stubEnv('SQLITE_PATH', '');
    expect(configuredSqlitePath()).toBeUndefined();
  });

  it('keeps the CLI existing-file rule separate from migration', () => {
    const parent = mkdtempSync(join(tmpdir(), 'hyper-sqlite-existing-'));
    try {
      const path = join(parent, 'missing.db');
      vi.stubEnv('SQLITE_PATH', path);
      expect(configuredSqlitePath()).toBe(path);
      expect(() => requireConfiguredSqlitePath({ existing: true })).toThrow(
        `SQLite database file does not exist: ${path}. Run pnpm db:migrate:sqlite first.`,
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('fails clearly when the SQLite parent directory is missing', () => {
    expect(() => createSqliteDatabase('/no-such-hyper-sqlite-parent/hyper.db')).toThrow(
      /SQLite parent directory is missing or unwritable/,
    );
  });

  // `access(W_OK)` is a discretionary check the superuser bypasses (POSIX
  // access(2)): running as root, `chmodSync(parent, 0o500)` below would not
  // stop `accessSync` from succeeding, so `requireWritableParent` would not
  // throw and this test would fail (not pass with a false green) — skip
  // rather than leave a root run red for a permission model this test
  // cannot exercise there.
  it.skipIf(process.getuid?.() === 0)(
    'fails clearly when the SQLite parent directory is not writable',
    () => {
      const parent = mkdtempSync(join(tmpdir(), 'hyper-sqlite-readonly-'));
      try {
        chmodSync(parent, 0o500);
        expect(() => createSqliteDatabase(join(parent, 'hyper.db'))).toThrow(
          /SQLite parent directory is missing or unwritable/,
        );
      } finally {
        chmodSync(parent, 0o700);
        rmSync(parent, { recursive: true, force: true });
      }
    },
  );

  it('leaves PostgreSQL as the default Vite host', () => {
    expect(viteConfig).toContain('postgresViteTarget');
    expect(sqliteViteConfig).toContain('sqliteViteTarget');
    expect(databaseViteConfig).toContain('postgres-http-runtime.ts');
    expect(databaseViteConfig).toContain('dist-http/postgres-http-runtime.js');
    expect(databaseViteConfig).toContain('sqlite-http-runtime.ts');
  });
});
