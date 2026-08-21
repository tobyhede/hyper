import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ADR 0062's ratchet is three things that have to stay together: the rule on as
 * an error, a committed baseline recording what was already there, and
 * `--prune-suppressions` in the lint `verify` runs so the ceiling only falls.
 * Delete any one of them and the other two still look enforced, which is what
 * these tests exist to stop.
 */
const RULE = '@typescript-eslint/no-unsafe-type-assertion';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const read = (path: string): string => readFileSync(join(repositoryRoot, path), 'utf8');

/**
 * The baseline is read at a boundary rather than asserted into shape. The `as`
 * idiom other tests use for repository-owned JSON is precisely what this rule
 * now bans, so this file cannot use it without suppressing the thing it guards.
 */
const isJsonObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is { readonly count: number } =>
  isJsonObject(value) && typeof value['count'] === 'number';

/** One rule's ceiling for one file. `count` is null when the entry is not a plain count. */
interface SuppressedRule {
  readonly rule: string;
  readonly count: number | null;
  /** Every key the entry carries, so an extra one can be reported rather than ignored. */
  readonly keys: readonly string[];
}

/** One file's line in the baseline, read out of ESLint's `path -> rule -> { count }` shape. */
interface SuppressedFile {
  readonly path: string;
  readonly rules: readonly SuppressedRule[];
}

const suppressions = (): readonly SuppressedFile[] => {
  const parsed: unknown = JSON.parse(read('eslint-suppressions.json'));
  if (!isJsonObject(parsed)) throw new Error('the suppressions baseline is not a JSON object');
  return Object.entries(parsed).map(([path, entry]) => {
    if (!isJsonObject(entry)) throw new Error(`the entry for ${path} is not a JSON object`);
    return {
      path,
      rules: Object.entries(entry).map(([rule, body]) => ({
        rule,
        count: isCount(body) ? body.count : null,
        keys: isJsonObject(body) ? Object.keys(body) : [],
      })),
    };
  });
};

/** One script's command line, read off the manifest text rather than parsed. */
const script = (name: string): string => {
  const found = new RegExp(`"${name}":\\s*"([^"]+)"`).exec(read('package.json'))?.[1];
  if (found === undefined) throw new Error(`package.json declares no ${name} script`);
  return found;
};

describe('the rule', () => {
  it('is on as an error, not a warning', () => {
    expect(read('eslint.config.js')).toContain(`'${RULE}': 'error'`);
  });

  it('has not been traded against the comment rule, which does a different job', () => {
    // One demands a reason, the other caps the count. ADR 0062 kept both.
    const oxlint = read('.oxlintrc.json');
    expect(oxlint).toContain('require-safety-comment-for-type-assertion');
    expect(oxlint).not.toContain('"anti-slop/require-safety-comment-for-type-assertion": "off"');
  });
});

describe('the suppressions baseline', () => {
  it('exists and is not empty, so the rule is capped rather than decorative', () => {
    expect(suppressions().length).toBeGreaterThan(0);
  });

  it('records only this rule, so nothing else is quietly riding along', () => {
    const rules = new Set(suppressions().flatMap((file) => file.rules.map((entry) => entry.rule)));
    expect([...rules]).toEqual([RULE]);
  });

  it('is generated, not hand-maintained', () => {
    // ESLint writes exactly `{ path: { rule: { count } } }` and nothing else.
    // A comment, a note, an extra key or a zero count all mean someone edited it
    // by hand, and a hand-edited baseline is a backlog pretending to be a gate.
    const raw = read('eslint-suppressions.json');
    expect(raw).not.toContain('//');
    for (const { path, rules } of suppressions()) {
      expect(
        rules.map((entry) => entry.rule),
        `${path} carries more than the rule`,
      ).toEqual([RULE]);
      for (const entry of rules) {
        expect(entry.keys, `${path} carries more than a count`).toEqual(['count']);
        expect(entry.count, `${path} suppresses nothing`).toBeGreaterThan(0);
      }
    }
  });

  it('is pruned by the lint verify runs, so a removed assertion lowers the ceiling', () => {
    // Without this the file goes stale and the ratchet stops being one.
    expect(script('lint')).toContain('--prune-suppressions');
    expect(script('verify')).toContain('pnpm lint ');
  });

  it('still runs under --max-warnings=0, which a suppressed finding must not evade', () => {
    expect(script('lint')).toContain('--max-warnings=0');
  });
});
