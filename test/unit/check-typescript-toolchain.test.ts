import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  AUTHORITATIVE_MAJOR_MINIMUM,
  BRIDGE_MAJOR,
  compilerMajor,
  formatVerdict,
  judgeBridge,
  judgeToolchain,
  probedWorkspaces,
  type BridgeReading,
  type CompilerReading,
} from '../../scripts/check-typescript-toolchain';

/** One entry of `pnpm -r list --json`: the directory pnpm enumerates. */
interface ListedWorkspace {
  readonly path: string;
}

/** The parse boundary for that listing, expressed as a predicate rather than a cast. */
const isListedWorkspace = (value: unknown): value is ListedWorkspace =>
  typeof value === 'object' && value !== null && 'path' in value && typeof value.path === 'string';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = join(repositoryRoot, 'scripts/check-typescript-toolchain.ts');

const workingBridge: BridgeReading = { version: '6.0.3', hasCreateProgram: true, failure: null };

const at = (
  workspace: string,
  reported: string | null,
  failure: string | null = null,
  typecheckScript: string | null = 'tsc -p tsconfig.json --noEmit',
): CompilerReading => ({
  workspace,
  reported,
  failure,
  typecheckScript,
});

/** A directory `pnpm -r` would enumerate: one that carries a manifest. */
const workspaceAt = (root: string, relativePath: string): void => {
  mkdirSync(join(root, relativePath), { recursive: true });
  writeFileSync(join(root, relativePath, 'package.json'), '{ "name": "fixture" }\n');
};

const everyWorkspaceOn = (version: string): readonly CompilerReading[] =>
  probedWorkspaces(repositoryRoot).map((workspace) => at(workspace, `Version ${version}`));

describe('the authoritative compiler', () => {
  it('accepts a 7.x tsc in every workspace', () => {
    const verdict = judgeToolchain({ compilers: everyWorkspaceOn('7.0.2'), bridge: workingBridge });
    expect(verdict).toMatchObject({ ok: true });
  });

  it('rejects a 6.x tsc, which is the reversal the check exists to catch', () => {
    const verdict = judgeToolchain({ compilers: everyWorkspaceOn('6.0.3'), bridge: workingBridge });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failures).toHaveLength(probedWorkspaces(repositoryRoot).length);
    expect(verdict.failures[0]).toContain('requires 7 or above');
  });

  it('rejects a single package left behind on 6.x even when the root is 7.x', () => {
    const compilers = [at('.', 'Version 7.0.2'), at('packages/app', 'Version 6.0.3')];
    const verdict = judgeToolchain({ compilers, bridge: workingBridge });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failures).toEqual([
      'packages/app: `tsc` resolves to Version 6.0.3, but ADR 0061 requires 7 or above',
    ]);
  });

  it('accepts a major above the minimum, so a future release does not fail the guard', () => {
    const verdict = judgeToolchain({ compilers: everyWorkspaceOn('8.1.0'), bridge: workingBridge });
    expect(verdict).toMatchObject({ ok: true });
  });

  it('rejects a workspace whose binary could not be run', () => {
    const verdict = judgeToolchain({
      compilers: [at('.', 'Version 7.0.2'), at('packages/core', null, 'spawn pnpm ENOENT')],
      bridge: workingBridge,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failures).toEqual([
      'packages/core: `tsc --version` could not be run — spawn pnpm ENOENT',
    ]);
  });

  it('rejects a typecheck script that runs tsc6, which probing `tsc` cannot see', () => {
    // The probe asks what the binary named `tsc` resolves to. It says nothing
    // about which binary the `typecheck` script invokes, and ADR 0061 installs a
    // second one on purpose — so a script switched to `tsc6` typechecks on
    // TypeScript 6 with the guard still reporting 7 and exiting 0.
    const verdict = judgeToolchain({
      compilers: [
        at('.', 'Version 7.0.2'),
        at('packages/app', 'Version 7.0.2', null, 'tsc6 -p tsconfig.json --noEmit'),
      ],
      bridge: workingBridge,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failures).toEqual([
      'packages/app: its `typecheck` script runs `tsc6`, not the authoritative `tsc`',
    ]);
  });

  it('rejects a workspace that declares no typecheck script, so nothing runs there', () => {
    const verdict = judgeToolchain({
      compilers: [at('.', 'Version 7.0.2'), at('packages/core', 'Version 7.0.2', null, null)],
      bridge: workingBridge,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failures).toEqual([
      'packages/core: declares no `typecheck` script, so no compiler runs there at all',
    ]);
  });

  it('rejects output that names no version rather than reading a major out of noise', () => {
    const verdict = judgeToolchain({
      compilers: [at('.', 'command not found: tsc')],
      bridge: workingBridge,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failures[0]).toContain('names no version');
  });

  it('fails when nothing was probed, so an empty sweep cannot read as a pass', () => {
    const verdict = judgeToolchain({ compilers: [], bridge: workingBridge });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failures).toContain('no workspace was probed, so nothing was proved');
  });
});

describe('the TypeScript 6 bridge', () => {
  it('accepts the compatibility API typescript-eslint needs', () => {
    expect(judgeBridge(workingBridge).failures).toEqual([]);
  });

  it('rejects a library unified onto the authoritative major', () => {
    const finding = judgeBridge({ version: '7.0.2', hasCreateProgram: true, failure: null });
    expect(finding.failures).toEqual([
      "`import 'typescript'` is 7.0.2, but typescript-eslint needs the 6.x compatibility API",
    ]);
  });

  it('rejects a library that no longer exposes createProgram', () => {
    const finding = judgeBridge({ version: '6.0.3', hasCreateProgram: false, failure: null });
    expect(finding.failures).toEqual([
      "`import 'typescript'` exposes no `createProgram`, so the linter cannot run",
    ]);
  });

  it('rejects a library that could not be loaded at all', () => {
    const finding = judgeBridge({
      version: null,
      hasCreateProgram: false,
      failure: 'Cannot find module',
    });
    expect(finding.failures).toEqual([
      "`import 'typescript'` could not be loaded — Cannot find module",
    ]);
  });
});

describe('what the check probes', () => {
  it('probes the root and every workspace `pnpm -r typecheck` reaches', async () => {
    // Asked of pnpm rather than re-derived here. An expectation rebuilt from the
    // same manifest with the same globbing rule can only ever agree with the code
    // under test; `pnpm -r list` is the enumeration `pnpm -r typecheck` itself
    // walks, so this compares the claim against the thing it is a claim about.
    const { stdout } = await promisify(execFile)(
      'pnpm',
      ['-r', 'list', '--depth', '-1', '--json'],
      { cwd: repositoryRoot, maxBuffer: 8 * 1024 * 1024 },
    );
    const listed: unknown = JSON.parse(stdout);
    if (!Array.isArray(listed)) throw new Error('`pnpm -r list` printed no array');
    const expected = listed
      .filter(isListedWorkspace)
      .map(({ path }) => relative(repositoryRoot, path) || '.')
      .sort();
    expect(expected.length).toBeGreaterThan(1);
    expect([...probedWorkspaces(repositoryRoot)].sort()).toEqual(expected);
  }, 60_000);

  it('reads only the packages: block, so an unrelated pnpm key is not a workspace glob', () => {
    const root = mkdtempSync(join(tmpdir(), 'hyper-toolchain-'));
    try {
      workspaceAt(root, 'packages/app');
      workspaceAt(root, 'packages/core');
      // `pnpm approve-builds` writes `onlyBuiltDependencies:` itself, and
      // `catalog:`, `ignoredBuiltDependencies:` and `packageExtensions:` have the
      // same shape. None of them is a workspace glob, and reading one as one
      // fails `verify` at its first step blaming the compiler toolchain.
      writeFileSync(
        join(root, 'pnpm-workspace.yaml'),
        "packages:\n  - 'packages/*'\n\nonlyBuiltDependencies:\n  - esbuild\n",
      );
      expect(probedWorkspaces(root)).toEqual(['.', 'packages/app', 'packages/core']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips a directory with no manifest, which `pnpm -r typecheck` never enters', () => {
    const root = mkdtempSync(join(tmpdir(), 'hyper-toolchain-'));
    try {
      workspaceAt(root, 'packages/app');
      // A leftover after a rename, or a plain assets directory. `pnpm -r` skips
      // it, so probing it reports a compiler no typecheck ever runs there — the
      // guard vouching for a directory it does not actually cover.
      mkdirSync(join(root, 'packages/shared-assets'), { recursive: true });
      writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
      expect(probedWorkspaces(root)).toEqual(['.', 'packages/app']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a workspace glob it cannot expand rather than probing fewer', () => {
    const root = mkdtempSync(join(tmpdir(), 'hyper-toolchain-'));
    try {
      writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/**/nested'\n");
      expect(() => probedWorkspaces(root)).toThrow(/cannot expand/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs first in verify, ahead of the typechecks it vouches for', () => {
    const manifest = readFileSync(join(repositoryRoot, 'package.json'), 'utf8');
    const verify = /"verify":\s*"([^"]+)"/.exec(manifest)?.[1];
    expect(verify).toBeDefined();
    expect(verify?.startsWith('pnpm typecheck:toolchain && ')).toBe(true);
  });
});

describe('the script the verify step actually runs', () => {
  // The pure core above proves the verdict. This proves the shell reaches it —
  // and it is not decoration: the entry-point guard compares `import.meta.url`
  // against the invocation path, and comparing with `resolve` rather than
  // `realpathSync` makes the whole body a silent no-op under any symlinked
  // ancestor. A guard that prints nothing and exits 0 is exactly the silent pass
  // it exists to prevent, and only spawning it catches that.
  it('prints the verdict and exits 0 against the real toolchain', async () => {
    const { stdout } = await promisify(execFile)('pnpm', ['exec', 'tsx', SCRIPT], {
      cwd: repositoryRoot,
    });
    expect(stdout).toContain('TypeScript toolchain is the one ADR 0061 describes');
    for (const workspace of probedWorkspaces(repositoryRoot)) {
      expect(stdout, `${workspace} was not reported`).toContain(`${workspace}: tsc Version `);
    }
    expect(stdout).toContain('typescript (library): 6.');
  }, 120_000);

  it('still prints the verdict when invoked through a symlink to itself', async () => {
    // The regression this pins. Node sets `import.meta.url` to the realpath, so a
    // symlinked invocation is where a `resolve`-based guard silently stops running.
    const link = join(repositoryRoot, 'scripts/.check-typescript-toolchain.link.ts');
    rmSync(link, { force: true });
    symlinkSync(SCRIPT, link);
    try {
      const { stdout } = await promisify(execFile)('pnpm', ['exec', 'tsx', link], {
        cwd: repositoryRoot,
      });
      expect(stdout).toContain('TypeScript toolchain is the one ADR 0061 describes');
    } finally {
      rmSync(link, { force: true });
    }
  }, 120_000);
});

describe('the version line', () => {
  it('reads the major out of what tsc prints', () => {
    expect(compilerMajor('Version 7.0.2')).toBe(AUTHORITATIVE_MAJOR_MINIMUM);
    expect(compilerMajor('Version 6.0.3')).toBe(BRIDGE_MAJOR);
    expect(compilerMajor('Version 7.0.0-dev.20260101')).toBe(7);
  });

  it('answers null rather than a guess when there is no version', () => {
    expect(compilerMajor('')).toBeNull();
    expect(compilerMajor('Version seven')).toBeNull();
  });
});

describe('the message a run leaves behind', () => {
  it('names both resolved versions on success, so a passing run is still evidence', () => {
    const verdict = judgeToolchain({
      compilers: [at('.', 'Version 7.0.2')],
      bridge: workingBridge,
    });
    expect(formatVerdict(verdict)).toBe(
      [
        'TypeScript toolchain is the one ADR 0061 describes:',
        '  .: tsc Version 7.0.2',
        '  typescript (library): 6.0.3',
      ].join('\n'),
    );
  });

  it('points at the ADR on failure', () => {
    const verdict = judgeToolchain({ compilers: everyWorkspaceOn('6.0.3'), bridge: workingBridge });
    expect(formatVerdict(verdict)).toContain('docs/adr/0061-');
  });
});
