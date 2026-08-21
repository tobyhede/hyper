import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Drives the real `oxlint` binary over a fixture snippet with one or more
 * `anti-slop/*` rules enabled, so these tests exercise the actual vendored
 * plugin rather than hand-built ESTree nodes and a mocked rule context.
 * `tools/oxlint/anti-slop/**` carries no typecheck, lint or test coverage of
 * its own (it's excluded from all three), so this harness is what stands
 * between a rule regression and it going unnoticed.
 */

const REPO_ROOT = new URL('../../../', import.meta.url).pathname;
const ANTI_SLOP_PLUGIN_SPECIFIER = join(REPO_ROOT, 'tools/oxlint/anti-slop/index.ts');
const OXLINT_BINARY = join(REPO_ROOT, 'node_modules/.bin/oxlint');

export interface RuleDiagnostic {
  readonly rule: string;
  readonly message: string;
}

interface ExecFileError {
  readonly stdout: string;
}

function isExecFileError(error: unknown): error is ExecFileError {
  if (typeof error !== 'object' || error === null || !('stdout' in error)) return false;
  const { stdout } = error;
  return typeof stdout === 'string';
}

interface OxlintDiagnostic {
  readonly code: string;
  readonly message: string;
}

interface OxlintReport {
  readonly diagnostics: readonly OxlintDiagnostic[];
}

function isOxlintReport(value: unknown): value is OxlintReport {
  if (typeof value !== 'object' || value === null || !('diagnostics' in value)) return false;
  const { diagnostics } = value;
  // `Array.isArray` narrows to `any[]` in its lib types, not `unknown[]` — the
  // explicit annotation re-asserts the honest element type it erases.
  if (!Array.isArray(diagnostics)) return false;
  const diagnosticEntries: readonly unknown[] = diagnostics;

  return diagnosticEntries.every((entry) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('code' in entry) ||
      !('message' in entry)
    ) {
      return false;
    }
    const { code, message } = entry;
    return typeof code === 'string' && typeof message === 'string';
  });
}

/**
 * Lints `source` (a standalone TypeScript fixture) with exactly the given
 * `anti-slop/*` rules enabled and returns every diagnostic those rules
 * raised, in source order. `rules` maps a rule's bare name (no `anti-slop/`
 * prefix) to `"error"` or `"off"`.
 *
 * `extension` selects the fixture's file extension. A rule with a JSX-only
 * visitor needs `'tsx'` — JSX in a `.ts` file is a parse error, so a `.ts`
 * fixture would report zero diagnostics whether the visitor fired or not.
 */
export function lintFixture(
  source: string,
  rules: Readonly<Record<string, 'error' | 'off'>>,
  extension: 'ts' | 'tsx' = 'ts',
): readonly RuleDiagnostic[] {
  const dir = mkdtempSync(join(tmpdir(), 'anti-slop-fixture-'));
  try {
    const sourcePath = join(dir, `fixture.${extension}`);
    const configPath = join(dir, '.oxlintrc.json');
    writeFileSync(sourcePath, source);
    writeFileSync(
      configPath,
      JSON.stringify({
        plugins: [],
        categories: {},
        jsPlugins: [{ name: 'anti-slop', specifier: ANTI_SLOP_PLUGIN_SPECIFIER }],
        rules: Object.fromEntries(
          Object.entries(rules).map(([name, severity]) => [`anti-slop/${name}`, severity]),
        ),
      }),
    );

    const output = runOxlint(configPath, sourcePath);
    if (!isOxlintReport(output)) {
      throw new Error(`oxlint produced an unexpected report shape: ${JSON.stringify(output)}`);
    }
    return output.diagnostics
      .filter((diagnostic) => diagnostic.code.startsWith('anti-slop('))
      .map((diagnostic) => ({
        rule: diagnostic.code.replace(/^anti-slop\(/u, '').replace(/\)$/u, ''),
        message: diagnostic.message,
      }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runOxlint(configPath: string, sourcePath: string): unknown {
  const args = ['-c', configPath, '--format', 'json', sourcePath];
  try {
    // A clean fixture exits 0; oxlint exits 1 when it reports diagnostics —
    // both cases print the same JSON report to stdout.
    return JSON.parse(execFileSync(OXLINT_BINARY, args, { encoding: 'utf8' }));
  } catch (error) {
    if (isExecFileError(error)) return JSON.parse(error.stdout);
    throw error;
  }
}
