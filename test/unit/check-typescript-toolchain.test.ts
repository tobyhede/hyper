import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const workingBridge: BridgeReading = { version: '6.0.3', hasCreateProgram: true };

const at = (workspace: string, reported: string | null): CompilerReading => ({
  workspace,
  reported,
});

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
      compilers: [at('.', 'Version 7.0.2'), at('packages/core', null)],
      bridge: workingBridge,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failures).toEqual(['packages/core: `tsc --version` could not be run']);
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
    const finding = judgeBridge({ version: '7.0.2', hasCreateProgram: true });
    expect(finding.failures).toEqual([
      "`import 'typescript'` is 7.0.2, but typescript-eslint needs the 6.x compatibility API",
    ]);
  });

  it('rejects a library that no longer exposes createProgram', () => {
    const finding = judgeBridge({ version: '6.0.3', hasCreateProgram: false });
    expect(finding.failures).toEqual([
      "`import 'typescript'` exposes no `createProgram`, so the linter cannot run",
    ]);
  });

  it('rejects a library that could not be loaded at all', () => {
    const finding = judgeBridge({ version: null, hasCreateProgram: false });
    expect(finding.failures).toEqual(["`import 'typescript'` could not be loaded"]);
  });
});

describe('what the check probes', () => {
  it('probes the root and every package, because `pnpm -r typecheck` runs each own binary', () => {
    expect(probedWorkspaces(repositoryRoot)).toEqual([
      '.',
      'packages/app',
      'packages/core',
      'packages/graph',
      'packages/http',
      'packages/persistence',
      'packages/react-flow-adapter',
      'packages/ui',
    ]);
  });

  it('runs first in verify, ahead of the typechecks it vouches for', () => {
    const manifest = readFileSync(join(repositoryRoot, 'package.json'), 'utf8');
    const verify = /"verify":\s*"([^"]+)"/.exec(manifest)?.[1];
    expect(verify).toBeDefined();
    expect(verify?.startsWith('pnpm typecheck:toolchain && ')).toBe(true);
  });
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
