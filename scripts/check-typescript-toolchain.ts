/**
 * Asserts the compiler this repository actually runs.
 *
 * ADR 0061 splits the toolchain in two: the `tsc` binary is TypeScript 7 and is
 * authoritative, while the package name `typescript` deliberately resolves to the
 * TypeScript 6 compatibility API that `typescript-eslint` and `prisma-next` consume.
 * That arrangement reads as a mistake, so a lockfile change, a dependency bump or a
 * tidy-up can quietly reverse it — and the failure mode is silent, because
 * everything still typechecks, just with the wrong compiler.
 *
 * The permanent assertion is **the authoritative `tsc` is 7 or above**. The bridge
 * half is temporary: when TypeScript 6 is no longer needed, delete `BRIDGE_MAJOR`,
 * `judgeBridge`, `readBridge` and the two lines that call them. Removal is an edit,
 * not a rewrite.
 *
 * It probes every workspace and not only the root, because `pnpm -r typecheck` runs
 * each package's own `tsc` and a root-only check does not prove those.
 */
import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

/** The lowest major version the authoritative `tsc` may report. */
export const AUTHORITATIVE_MAJOR_MINIMUM = 7;

/** The major version `import 'typescript'` must answer for while the bridge stands. */
export const BRIDGE_MAJOR = 6;

/** One `tsc --version` probe, run in the directory whose `typecheck` script owns it. */
export interface CompilerReading {
  /** Repository-relative directory the probe ran in; `.` is the root. */
  readonly workspace: string;
  /** Exactly what `tsc --version` printed, or null when the binary could not be run. */
  readonly reported: string | null;
}

/** What the resolved `typescript` package answers for. */
export interface BridgeReading {
  /** The resolved package's compiler version, or null when the module could not be loaded. */
  readonly version: string | null;
  /** Whether the resolved module exposes the `createProgram` entry point tooling calls. */
  readonly hasCreateProgram: boolean;
}

/** Everything the check needs to reach a verdict, gathered before any judgment. */
export interface ToolchainReading {
  readonly compilers: readonly CompilerReading[];
  readonly bridge: BridgeReading;
}

/** What one part of the reading produced: what it objects to, and what it proves. */
export interface ToolchainFinding {
  readonly failures: readonly string[];
  readonly report: readonly string[];
}

export type ToolchainVerdict =
  | { readonly ok: true; readonly report: readonly string[] }
  | { readonly ok: false; readonly failures: readonly string[] };

const VERSION_LINE = /\bVersion\s+(\d+)\.\d+\.\S+/;

/** Reads the major version out of a `tsc --version` line. Null when the line is not one. */
export const compilerMajor = (reported: string): number | null => {
  const match = VERSION_LINE.exec(reported);
  if (match === null) return null;
  const [, major] = match;
  if (major === undefined) return null;
  return Number.parseInt(major, 10);
};

/** The permanent half: every workspace must run an authoritative compiler. */
export const judgeCompilers = (compilers: readonly CompilerReading[]): ToolchainFinding => {
  const failures: string[] = [];
  const report: string[] = [];
  if (compilers.length === 0) failures.push('no workspace was probed, so nothing was proved');
  for (const { workspace, reported } of compilers) {
    if (reported === null) {
      failures.push(`${workspace}: \`tsc --version\` could not be run`);
      continue;
    }
    const major = compilerMajor(reported);
    if (major === null) {
      failures.push(
        `${workspace}: \`tsc --version\` printed ${JSON.stringify(reported)}, which names no version`,
      );
      continue;
    }
    if (major < AUTHORITATIVE_MAJOR_MINIMUM) {
      failures.push(
        `${workspace}: \`tsc\` resolves to ${reported.trim()}, but ADR 0061 requires ${AUTHORITATIVE_MAJOR_MINIMUM} or above`,
      );
      continue;
    }
    report.push(`${workspace}: tsc ${reported.trim()}`);
  }
  return { failures, report };
};

/**
 * The bridge half, and the temporary one. Delete this whole function when the
 * TypeScript 6 compatibility package is no longer needed.
 */
export const judgeBridge = (bridge: BridgeReading): ToolchainFinding => {
  const failures: string[] = [];
  if (bridge.version === null)
    return { failures: ["`import 'typescript'` could not be loaded"], report: [] };
  const major = compilerMajor(`Version ${bridge.version}`);
  if (major === null)
    failures.push(
      `\`import 'typescript'\` reports version ${bridge.version}, which cannot be read`,
    );
  else if (major !== BRIDGE_MAJOR)
    failures.push(
      `\`import 'typescript'\` is ${bridge.version}, but typescript-eslint needs the ${BRIDGE_MAJOR}.x compatibility API`,
    );
  if (!bridge.hasCreateProgram)
    failures.push("`import 'typescript'` exposes no `createProgram`, so the linter cannot run");
  return failures.length > 0
    ? { failures, report: [] }
    : { failures, report: [`typescript (library): ${bridge.version}`] };
};

export const judgeToolchain = (reading: ToolchainReading): ToolchainVerdict => {
  const compilers = judgeCompilers(reading.compilers);
  const bridge = judgeBridge(reading.bridge);
  const failures = [...compilers.failures, ...bridge.failures];
  return failures.length > 0
    ? { ok: false, failures }
    : { ok: true, report: [...compilers.report, ...bridge.report] };
};

export const formatVerdict = (verdict: ToolchainVerdict): string =>
  verdict.ok
    ? ['TypeScript toolchain is the one ADR 0061 describes:', ...verdict.report.map(indent)].join(
        '\n',
      )
    : [
        'TypeScript toolchain is not the one ADR 0061 describes:',
        ...verdict.failures.map(indent),
        '',
        'See docs/adr/0061-typescript-7-is-the-compiler-and-typescript-6-is-a-bridge.md.',
      ].join('\n');

const indent = (line: string): string => `  ${line}`;

const run = promisify(execFile);

/** Every directory a compiler runs in: the root, plus each package `pnpm -r` reaches. */
export const probedWorkspaces = (repositoryRoot: string): readonly string[] => [
  '.',
  ...readdirSync(join(repositoryRoot, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}`)
    .sort(),
];

const probeCompiler = async (
  repositoryRoot: string,
  workspace: string,
): Promise<CompilerReading> => {
  try {
    // `pnpm exec` rather than a hand-built PATH, so the probe resolves the binary
    // by exactly the rule the `typecheck` script in this directory would.
    const { stdout } = await run('pnpm', ['exec', 'tsc', '--version'], {
      cwd: join(repositoryRoot, workspace),
    });
    return { workspace, reported: stdout.trim() };
  } catch {
    return { workspace, reported: null };
  }
};

const readBridge = async (): Promise<BridgeReading> => {
  try {
    const typescript = await import('typescript');
    // Asked of the resolved module rather than of its type: the type comes from
    // whatever `typescript` resolves to, so it can only ever agree with itself.
    return {
      version: typescript.version,
      hasCreateProgram: Object.hasOwn(typescript, 'createProgram'),
    };
  } catch {
    return { version: null, hasCreateProgram: false };
  }
};

export const readToolchain = async (repositoryRoot: string): Promise<ToolchainReading> => {
  const [compilers, bridge] = await Promise.all([
    Promise.all(
      probedWorkspaces(repositoryRoot).map((workspace) => probeCompiler(repositoryRoot, workspace)),
    ),
    readBridge(),
  ]);
  return { compilers, bridge };
};

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const verdict = judgeToolchain(await readToolchain(repositoryRoot));
  if (verdict.ok) console.log(formatVerdict(verdict));
  else {
    console.error(formatVerdict(verdict));
    process.exitCode = 1;
  }
}
