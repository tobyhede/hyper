import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import contractJson from '../../src/prisma/contract.json' with { type: 'json' };

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

interface MutationDefault {
  readonly onCreate: { readonly kind: string; readonly id: string };
  readonly onUpdate: { readonly kind: string; readonly id: string };
  readonly ref: { readonly namespace: string; readonly table: string; readonly column: string };
}

const emittedContract: {
  readonly execution?: {
    readonly mutations: { readonly defaults: readonly MutationDefault[] };
  };
} = contractJson;

describe('Prisma Next foundation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ['Space', 'spaces'],
    ['Card', 'cards'],
  ] as const)('advances %s.updatedAt when a record is updated', (_modelName, table) => {
    const updatedAt = emittedContract.execution?.mutations.defaults.find(
      (entry) => entry.ref.table === table && entry.ref.column === 'updated_at',
    );

    expect(updatedAt).toMatchObject({
      onCreate: { kind: 'generator', id: 'timestampNow' },
      onUpdate: { kind: 'generator', id: 'timestampNow' },
      ref: {
        namespace: 'public',
        table,
        column: 'updated_at',
      },
    });
  });

  it('omits a database connection when DATABASE_URL is blank', async () => {
    vi.stubEnv('DATABASE_URL', ' \t ');

    const { default: config } = await import('../../prisma-next.config');

    expect(config.db).toBeUndefined();
  });

  it('trims a configured DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', '  postgresql://user:password@localhost:5432/app  ');

    const { default: config } = await import('../../prisma-next.config');

    expect(config.db).toEqual({
      connection: 'postgresql://user:password@localhost:5432/app',
    });
  });

  it('constructs the runtime client without a blank DATABASE_URL binding', async () => {
    vi.stubEnv('DATABASE_URL', ' \t ');

    const { db } = await import('../../src/prisma/db');

    expect(db.contract.domain.namespaces.public.models).toHaveProperty('Space');
  });

  it('reaches the emitted contract from the existing migration head', () => {
    const command = spawnSync(
      'pnpm',
      [
        'exec',
        'prisma-next',
        'migrate',
        '--show',
        '--from',
        '20260728T1242_initial',
        '--to',
        '@contract',
        '--format',
        'json',
      ],
      { cwd: repositoryRoot, encoding: 'utf8', timeout: 30_000 },
    );
    const diagnostic = [
      `status: ${command.status ?? 'not launched'}`,
      `signal: ${command.signal ?? 'none'}`,
      `error: ${command.error?.message ?? 'none'}`,
      `stdout: ${command.stdout || '<empty>'}`,
      `stderr: ${command.stderr || '<empty>'}`,
    ].join('\n');

    expect(command.error, diagnostic).toBeUndefined();
    expect(command.status, diagnostic).toBe(0);

    let result: unknown;
    try {
      result = JSON.parse(command.stdout) as unknown;
    } catch (error) {
      throw new Error(`prisma-next returned non-JSON output\n${diagnostic}`, { cause: error });
    }

    expect(result).toMatchObject({ ok: true });
  });
});
