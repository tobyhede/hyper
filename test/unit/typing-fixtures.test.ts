import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
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

/** The tools whose verdict this file reads. */
type Tool = 'eslint' | 'oxlint' | 'tsc';

/** Every fixture on disk, as `<half>/<name>`, which is how both maps below are keyed. */
const fixturePaths = (half: string): readonly string[] =>
  readdirSync(join(fixturesRoot, half))
    .sort()
    .map((name) => `${half}/${name}`);

const allFixtures = (): readonly string[] => [
  ...fixturePaths('must-fail'),
  ...fixturePaths('must-pass'),
];

/**
 * A fixture's key: its path below `tools/typing-fixtures`, not its basename.
 * Keying by basename lets a `must-pass/as-any.ts` inherit the diagnostics of the
 * `must-fail/as-any.ts` beside it, and nothing keeps the two halves' names apart.
 */
const fixtureKey = (path: string): string | null => {
  const key = relative(fixturesRoot, path).split(sep).join('/');
  return key.startsWith('..') || key === '' ? null : key;
};

/** Every diagnostic the toolchain produced, as `fixture path -> rule identities`. */
const rejections = new Map<string, Set<string>>();

/**
 * Which tools actually read each fixture.
 *
 * The `must-pass` half asserts an empty diagnostic list, and a tool that never
 * opened the file produces exactly that. Without this, excluding the whole half
 * — one extra `ignorePatterns` entry does it — leaves all four `accepts …` tests
 * green while the over-reach detector is dead, and `verify` never notices.
 */
const readBy = new Map<string, Set<Tool>>();

const addTo = <Value>(index: Map<string, Set<Value>>, key: string, value: Value): void => {
  const existing = index.get(key);
  if (existing === undefined) index.set(key, new Set([value]));
  else existing.add(value);
};

const noteRead = (tool: Tool, path: string): void => {
  const fixture = fixtureKey(path);
  if (fixture === null) return;
  addTo(readBy, fixture, tool);
};

const noteRejection = (path: string, rule: string): void => {
  const fixture = fixtureKey(path);
  if (fixture === null) return;
  addTo(rejections, fixture, rule);
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

/** What a tool printed, with the two streams kept apart. */
interface ToolOutput {
  readonly stdout: string;
  readonly stderr: string;
  /** Both streams, for the diagnostics a failure message wants to show in full. */
  readonly combined: string;
}

/**
 * `execFile` rejects on a non-zero exit, which is the normal outcome here — the
 * fixtures are meant to fail. The output is what matters, not the status.
 *
 * `stdout` stays separate from `stderr` because the JSON readers below parse it.
 * Concatenating the two appends any `pnpm WARN` or Node deprecation line after
 * the report, and `JSON.parse` then throws on trailing input — failing all
 * seventeen tests in this file with a parse error instead of a diagnosis.
 */
const outputOf = async (command: string, args: readonly string[]): Promise<ToolOutput> => {
  const captured = async (): Promise<{ stdout: string; stderr: string }> => {
    try {
      return await run(command, [...args], { cwd: repositoryRoot, maxBuffer: 32 * 1024 * 1024 });
    } catch (error) {
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        return { stdout: String(error.stdout), stderr: String(error.stderr) };
      }
      throw error;
    }
  };
  const { stdout, stderr } = await captured();
  return { stdout, stderr, combined: `${stdout}${stderr}` };
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
  const start = output.stdout.indexOf('[');
  expect(start, `eslint printed no JSON:\n${output.combined}`).toBeGreaterThanOrEqual(0);
  const parsed: unknown = JSON.parse(output.stdout.slice(start));
  expect(Array.isArray(parsed), `eslint printed no report:\n${output.combined}`).toBe(true);
  if (!Array.isArray(parsed)) return;
  for (const value of parsed) {
    const result = readEslintFileResult(value);
    if (result === null) continue;
    const [filePath, rules] = result;
    // ESLint reports every file it linted, clean ones included, so the report is
    // itself the record of what it read.
    noteRead('eslint', filePath);
    for (const rule of rules) noteRejection(filePath, rule);
  }
};

/** The `ignorePatterns` entry in `.oxlintrc.json` that hides the fixtures. */
const FIXTURE_IGNORE_ENTRY = '"tools/typing-fixtures/**"';

/**
 * Every `ignorePatterns` entry under the fixtures tree, with the comma that joins
 * it to a neighbour.
 *
 * Matched by prefix rather than as one exact string. Lifting out only
 * `"tools/typing-fixtures/**"` leaves a narrower entry such as
 * `"tools/typing-fixtures/must-pass/**"` in place, which silently hides the half
 * that catches a rule over-reaching. The optional leading comma is what keeps the
 * strip valid when the entry is first in the array rather than last.
 */
const FIXTURE_IGNORE_ENTRIES = /\n[^\S\n]*"tools\/typing-fixtures[^"]*",?/g;

/**
 * The same shape without `g`, for asserting the strip worked.
 *
 * Both are anchored to the start of a line, which is what keeps them off the
 * `overrides` block: `unknown-at-parse-boundary.ts` is named there as `"files":
 * ["tools/typing-fixtures/…"]`, and that exemption has to survive into the
 * derived config or the fixture stops proving what it claims.
 */
const ANY_FIXTURE_IGNORE_ENTRY = /\n[^\S\n]*"tools\/typing-fixtures[^"]*",?/;

/** How many files oxlint reported linting. Emptiness proves nothing without this. */
let oxlintFilesLinted = -1;

/** oxlint's JSON report, as far as this file reads it. */
interface OxlintReport {
  /** How many files oxlint linted; -1 when the report did not say. */
  readonly files: number;
  readonly diagnostics: readonly unknown[];
}

/** oxlint's JSON report: the diagnostics, and how many files it actually read. */
const readOxlintReport = (value: unknown): OxlintReport => {
  if (!isJsonObject(value)) return { files: -1, diagnostics: [] };
  const files = value['number_of_files'];
  const diagnostics = value['diagnostics'];
  return {
    files: typeof files === 'number' ? files : -1,
    diagnostics: Array.isArray(diagnostics) ? diagnostics : [],
  };
};

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
  const derived = real.replace(FIXTURE_IGNORE_ENTRIES, '').replace(/,(\s*])/g, '$1');
  expect(ANY_FIXTURE_IGNORE_ENTRY.test(derived), 'the fixtures are still ignored').toBe(false);
  expect(derived, 'the parse-boundary exemption was stripped along with the ignores').toContain(
    'must-pass/unknown-at-parse-boundary.ts',
  );
  writeFileSync(derivedOxlintConfig, derived);
  try {
    const output = await outputOf('pnpm', [
      'exec',
      'oxlint',
      '-c',
      '.oxlintrc.typing-fixtures.json',
      '--format',
      'json',
      'tools/typing-fixtures',
    ]);
    const start = output.stdout.indexOf('{');
    expect(start, `oxlint printed no JSON:\n${output.combined}`).toBeGreaterThanOrEqual(0);
    const parsed: unknown = JSON.parse(output.stdout.slice(start));
    const { files, diagnostics } = readOxlintReport(parsed);
    oxlintFilesLinted = files;
    for (const diagnostic of diagnostics) {
      if (!isJsonObject(diagnostic)) continue;
      const filename = diagnostic['filename'];
      const code = diagnostic['code'];
      if (typeof filename !== 'string' || typeof code !== 'string') continue;
      noteRejection(join(repositoryRoot, filename), code);
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

/** A `--listFiles` line: an absolute path to a file in the program, and nothing else. */
const TSC_PROGRAM_FILE = /^(\/\S+\.tsx?)$/gm;

const readTsc = async (): Promise<void> => {
  // `--listFiles` names every file in the program alongside the diagnostics, so
  // one invocation answers both "what did it object to" and "what did it read".
  // Program membership is what makes a clean `must-pass` fixture evidence rather
  // than the silence of a file the compiler never opened.
  const output = await outputOf('pnpm', [
    'exec',
    'tsc',
    '-p',
    'tools/typing-fixtures/tsconfig.json',
    '--noEmit',
    '--listFiles',
  ]);
  for (const [, path] of output.combined.matchAll(TSC_PROGRAM_FILE)) {
    if (path !== undefined) noteRead('tsc', path);
  }
  for (const [, path, code] of output.combined.matchAll(TSC_DIAGNOSTIC)) {
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
      const found = rejections.get(`must-fail/${fixture}`) ?? new Set<string>();
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
      expect([...(rejections.get(`must-pass/${fixture}`) ?? [])]).toEqual([]);
    });
  }
});

describe('every tool actually read every fixture', () => {
  // Without these, the `must-pass` half is vacuous. It asserts an empty
  // diagnostic list, and a tool that never opened the file produces exactly that
  // — so one extra `ignorePatterns` entry silently kills the only half that
  // catches a rule over-reaching, with all four `accepts …` tests still green.
  it.each(['eslint', 'tsc'] as const)('%s read every fixture', (tool) => {
    const unread = allFixtures().filter((fixture) => !(readBy.get(fixture)?.has(tool) ?? false));
    expect(unread, `${tool} never opened these fixtures, so their result proves nothing`).toEqual(
      [],
    );
  });

  it('oxlint linted every fixture', () => {
    // oxlint's report names only files it had something to say about, so a clean
    // `must-pass` fixture is absent from it either way. `number_of_files` is the
    // one thing it prints that distinguishes "read and clean" from "never read".
    expect(
      oxlintFilesLinted,
      'oxlint linted a different number of files than there are fixtures',
    ).toBe(allFixtures().length);
  });
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
    expect(output.combined).toContain('No files found to lint');
  }, 60_000);

  it('leaves no derived oxlint config behind', () => {
    expect(existsSync(join(repositoryRoot, '.oxlintrc.typing-fixtures.json'))).toBe(false);
  });

  it('is named by no entry in the root tsconfig include list', () => {
    // Deliberately weaker than "is outside the root program": this reads the
    // `include` spelling, and a broad glob or a `files`/`references` entry could
    // still reach the fixtures while passing. The real backstop is that a leak
    // makes `pnpm typecheck` report TS2366 for `missing-union-case.ts`, so it
    // fails loudly in `verify` rather than passing quietly. This pins the reason.
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
