import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The typing fixtures are executable evidence that the gates bite (ADR 0062).
 * This runs the real toolchain over them, so a rule downgraded, removed or
 * narrowed fails here rather than passing unnoticed.
 *
 * `must-fail` is only half the claim. A rule that rejects everything would score
 * full marks on it, which is what `must-pass` is for.
 */
const run = promisify(execFile);

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixturesRoot = join(repositoryRoot, 'tools/typing-fixtures');

/** What must reject a fixture, keyed by its file name. */
const mustFail = {
  'explicit-any.ts': ['@typescript-eslint/no-explicit-any'],
  'as-any.ts': [
    '@typescript-eslint/no-explicit-any',
    '@typescript-eslint/no-unsafe-type-assertion',
  ],
  'chained-assertion.ts': ['anti-slop(no-chained-type-assertions)'],
  'narrowing-assertion.ts': ['@typescript-eslint/no-unsafe-type-assertion'],
  'non-null-assertion.ts': ['@typescript-eslint/no-non-null-assertion'],
  'ts-ignore.ts': ['@typescript-eslint/ban-ts-comment'],
  'missing-union-case.ts': ['@typescript-eslint/switch-exhaustiveness-check', 'TS2366'],
} satisfies Readonly<Record<string, readonly string[]>>;

const mustPass = [
  'as-const.ts',
  'as-const-satisfies.ts',
  'broadening-to-unknown.ts',
  'unknown-at-parse-boundary.ts',
] as const;

/** Every diagnostic the toolchain produced, as `fixture name -> rule identities`. */
const rejections = new Map<string, Set<string>>();

const noteRejection = (path: string, rule: string): void => {
  const fixture = relative(fixturesRoot, path).split('/').at(-1);
  if (fixture === undefined) return;
  const existing = rejections.get(fixture);
  if (existing === undefined) rejections.set(fixture, new Set([rule]));
  else existing.add(rule);
};

/**
 * Read at the boundary rather than asserted into shape. The `as` idiom other
 * tests use for trusted JSON is exactly what `no-unsafe-type-assertion` now
 * bans, and a test proving the ratchet bites cannot be the one that evades it.
 */
const isJsonObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** The `filePath` and rule identities of one file in ESLint's JSON report. */
const readEslintFileResult = (value: unknown): readonly [string, readonly string[]] | null => {
  if (!isJsonObject(value)) return null;
  const filePath = value['filePath'];
  const messages = value['messages'];
  if (typeof filePath !== 'string' || !Array.isArray(messages)) return null;
  const rules = messages
    .map((message: unknown) => (isJsonObject(message) ? message['ruleId'] : null))
    .filter((ruleId): ruleId is string => typeof ruleId === 'string');
  return [filePath, rules];
};

/**
 * `execFile` rejects on a non-zero exit, which is the normal outcome here — the
 * fixtures are meant to fail. The output is what matters, not the status.
 */
const outputOf = async (command: string, args: readonly string[]): Promise<string> => {
  try {
    const { stdout, stderr } = await run(command, [...args], {
      cwd: repositoryRoot,
      maxBuffer: 32 * 1024 * 1024,
    });
    return `${stdout}${stderr}`;
  } catch (error) {
    if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
      return `${String(error.stdout)}${String(error.stderr)}`;
    }
    throw error;
  }
};

const readEslint = async (): Promise<void> => {
  const output = await outputOf('pnpm', [
    'exec',
    'eslint',
    '--no-ignore',
    'tools/typing-fixtures',
    '--format',
    'json',
  ]);
  const start = output.indexOf('[');
  expect(start, `eslint printed no JSON:\n${output}`).toBeGreaterThanOrEqual(0);
  const parsed: unknown = JSON.parse(output.slice(start));
  expect(Array.isArray(parsed), `eslint printed no report:\n${output}`).toBe(true);
  if (!Array.isArray(parsed)) return;
  for (const value of parsed) {
    const result = readEslintFileResult(value);
    if (result === null) continue;
    const [filePath, rules] = result;
    for (const rule of rules) noteRejection(filePath, rule);
  }
};

const OXLINT_DIAGNOSTIC = /^(\S+\.ts):\d+:\d+: error (anti-slop\([^)]+\))/gm;

/** The `ignorePatterns` entry in `.oxlintrc.json` that hides the fixtures. */
const FIXTURE_IGNORE_ENTRY = '"tools/typing-fixtures/**"';

/** The same entry with whatever comma joins it to its neighbour, so it can be lifted out. */
const FIXTURE_IGNORE_ENTRY_WITH_COMMA = /,?\s*"tools\/typing-fixtures\/\*\*"/;

/**
 * oxlint's `--no-ignore` disables `.eslintignore`-style files, not the config's
 * own `ignorePatterns`, and every path in a config resolves relative to that
 * config's directory — so the fixtures can only be reached through a config that
 * sits beside the real one. This mints that config from the real one for the
 * duration of the run rather than keeping a second copy of the rule set, which
 * would drift.
 */
const derivedOxlintConfig = join(repositoryRoot, '.oxlintrc.typing-fixtures.json');

const readOxlint = async (): Promise<void> => {
  const real = readFileSync(join(repositoryRoot, '.oxlintrc.json'), 'utf8');
  expect(
    real.includes(FIXTURE_IGNORE_ENTRY),
    'the fixtures are no longer ignored by .oxlintrc.json, so `pnpm lint:anti-slop` would fail on them',
  ).toBe(true);
  const derived = real.replace(FIXTURE_IGNORE_ENTRY_WITH_COMMA, '');
  expect(derived).not.toContain(FIXTURE_IGNORE_ENTRY);
  writeFileSync(derivedOxlintConfig, derived);
  try {
    const output = await outputOf('pnpm', [
      'exec',
      'oxlint',
      '-c',
      '.oxlintrc.typing-fixtures.json',
      'tools/typing-fixtures',
    ]);
    expect(output, `oxlint could not read the fixtures:\n${output}`).not.toContain(
      'No files found to lint',
    );
    for (const [, path, rule] of output.matchAll(OXLINT_DIAGNOSTIC)) {
      if (path !== undefined && rule !== undefined) noteRejection(join(repositoryRoot, path), rule);
    }
  } finally {
    rmSync(derivedOxlintConfig, { force: true });
  }
};

const rootTsconfigInclude = (): readonly string[] => {
  const parsed: unknown = JSON.parse(readFileSync(join(repositoryRoot, 'tsconfig.json'), 'utf8'));
  if (!isJsonObject(parsed)) throw new Error('the root tsconfig is not a JSON object');
  const include = parsed['include'];
  if (!isStringArray(include)) throw new Error('the root tsconfig declares no include list');
  return include;
};

const TSC_DIAGNOSTIC = /^(\S+\.ts)\(\d+,\d+\): error (TS\d+)/gm;

const readTsc = async (): Promise<void> => {
  const output = await outputOf('pnpm', [
    'exec',
    'tsc',
    '-p',
    'tools/typing-fixtures/tsconfig.json',
    '--noEmit',
  ]);
  for (const [, path, code] of output.matchAll(TSC_DIAGNOSTIC)) {
    if (path !== undefined && code !== undefined) noteRejection(join(repositoryRoot, path), code);
  }
};

beforeAll(async () => {
  await Promise.all([readEslint(), readOxlint(), readTsc()]);
}, 120_000);

describe('constructs the toolchain must reject', () => {
  it('has a fixture for every construct the ratchet claims to catch', () => {
    expect(readdirSync(join(fixturesRoot, 'must-fail')).sort()).toEqual(
      Object.keys(mustFail).sort(),
    );
  });

  for (const [fixture, rules] of Object.entries(mustFail)) {
    it(`rejects ${fixture} — ${rules.join(', ')}`, () => {
      const found = rejections.get(fixture) ?? new Set<string>();
      // A fixture that passes is a gap in enforcement and a finding, not a
      // fixture to relax.
      expect([...found].sort(), `${fixture} was not rejected as expected`).toEqual(
        expect.arrayContaining([...rules]),
      );
    });
  }
});

describe('constructs that must survive', () => {
  it('has a fixture for every construct the ratchet must not over-reach on', () => {
    expect(readdirSync(join(fixturesRoot, 'must-pass')).sort()).toEqual([...mustPass].sort());
  });

  for (const fixture of mustPass) {
    it(`accepts ${fixture}`, () => {
      expect([...(rejections.get(fixture) ?? [])]).toEqual([]);
    });
  }
});

describe('the fixtures stay out of the ordinary passes', () => {
  it('is ignored by the anti-slop run verify performs', async () => {
    const output = await outputOf('pnpm', [
      'exec',
      'oxlint',
      '-c',
      '.oxlintrc.json',
      'tools/typing-fixtures',
    ]);
    expect(output).toContain('No files found to lint');
  }, 60_000);

  it('leaves no derived oxlint config behind', () => {
    expect(existsSync(join(repositoryRoot, '.oxlintrc.typing-fixtures.json'))).toBe(false);
  });

  it('is outside the root TypeScript program, which would fail on must-fail', () => {
    // `tsc -p tsconfig.json` reports TS2366 for `missing-union-case.ts`, so a
    // leak here would already be red in `verify`. This pins the reason it is not.
    const include = rootTsconfigInclude();
    expect(include.length).toBeGreaterThan(0);
    expect(include.filter((entry) => entry.includes('tools'))).toEqual([]);
  });

  it('is ignored by the ESLint run verify performs', async () => {
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({ cwd: repositoryRoot });
    for (const fixture of Object.keys(mustFail)) {
      expect(
        await eslint.isPathIgnored(join(fixturesRoot, 'must-fail', fixture)),
        `${fixture} is not ignored by the ordinary lint run`,
      ).toBe(true);
    }
  });
});
