import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { spaceFileSchema, spaceSnapshotSchema } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { readSingleSpace } from '../../src/import/read-single-space';
import {
  buildRoadmap,
  planRelease,
  readReleaseScope,
  renderRoadmap,
  renderRoadmapHtml,
  stateOf,
  writeReleaseSpace,
  type FeatureRoadmap,
  type Roadmap,
} from '../../scripts/roadmap';

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const roots: string[] = [];

const write = (root: string, path: string, content: string): void => {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
};

const scratch = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'hyper-roadmap-'));
  roots.push(root);
  return root;
};

const featureNamed = (roadmap: Roadmap, slug: string): FeatureRoadmap => {
  const feature = roadmap.features.find((candidate) => candidate.slug === slug);
  if (feature === undefined) throw new Error(`No feature ${slug} in the roadmap.`);
  return feature;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('status lines', () => {
  it('reads all three spellings in the tree', () => {
    const root = scratch();
    write(root, 'effort/issues/01-plain.md', '# 01 — Plain\n\nStatus: resolved\n');
    write(root, 'effort/issues/02-bold-label.md', '# 02 — Bold label\n\n**Status:** resolved\n');
    write(root, 'effort/issues/03-bold-line.md', '# 03 — Bold line\n\n**Status: delivered.**\n');

    const states = featureNamed(buildRoadmap(root), 'effort').issues.map((issue) => issue.state);

    expect(states).toEqual(['done', 'done', 'done']);
  });

  it('classifies by the first word and keeps the rest as prose', () => {
    expect(stateOf('resolved — delivered in PR #69.')).toBe('done');
    expect(stateOf('superseded by ADR 0030')).toBe('dropped');
    expect(stateOf('needs-triage — reviewed and deliberately deferred, 2026-08-05.')).toBe(
      'needs-triage',
    );
    expect(stateOf('accepted prototype')).toBe('accepted');
  });

  it('names an unfamiliar status rather than filing it as settled', () => {
    expect(stateOf('mostly there honestly')).toBe('unrecognised');
  });

  it('ignores a line that merely begins with the word status', () => {
    const root = scratch();
    write(root, 'effort/issues/01-a.md', '# 01 — A\n\nStatusy prose about resolved things.\n');

    expect(featureNamed(buildRoadmap(root), 'effort').issues).toEqual([]);
  });

  it('reports a ticket carrying no status rather than passing over it', () => {
    const root = scratch();
    write(root, 'effort/issues/01-a.md', 'Status: resolved\n');
    write(root, 'effort/issues/02-handoff.md', '# Handoff\n\nWhat went wrong.\n');

    const roadmap = buildRoadmap(root);

    expect(featureNamed(roadmap, 'effort').unstatused).toEqual(['effort/issues/02-handoff.md']);
    expect(renderRoadmap(roadmap)).toContain('NO STATUS LINE — 1');
    expect(renderRoadmapHtml(roadmap)).toContain('effort/issues/02-handoff.md');
  });
});

describe('issue tags', () => {
  it('reads optional comma-separated tags without changing issue membership', () => {
    const root = scratch();
    write(
      root,
      'effort/issues/01-a.md',
      '# 01 — A\n\nStatus: resolved\nTags: release/v1, design-system\n',
    );
    write(root, 'effort/issues/02-b.md', '# 02 — B\n\nStatus: ready-for-agent\n');

    const issues = featureNamed(buildRoadmap(root), 'effort').issues;

    expect(issues.map((issue) => issue.tags)).toEqual([['release/v1', 'design-system'], []]);
  });
});

describe('feature phase', () => {
  it('separates complete, in-flight, not-started and issueless efforts', () => {
    const root = scratch();
    write(root, 'complete/issues/01-a.md', 'Status: resolved\n');
    write(root, 'complete/issues/02-b.md', 'Status: wontfix\n');
    write(root, 'in-flight/issues/01-a.md', 'Status: resolved\n');
    write(root, 'in-flight/issues/02-b.md', 'Status: ready-for-agent\n');
    write(root, 'open/issues/01-a.md', 'Status: needs-triage\n');
    write(root, 'notes/spec.md', 'Status: accepted specification\n');

    const roadmap = buildRoadmap(root);

    expect(featureNamed(roadmap, 'complete').phase).toBe('complete');
    expect(featureNamed(roadmap, 'in-flight').phase).toBe('in-flight');
    expect(featureNamed(roadmap, 'open').phase).toBe('open');
    expect(featureNamed(roadmap, 'notes').phase).toBe('no-issues');
    expect(featureNamed(roadmap, 'notes').documents).toHaveLength(1);
    expect(roadmap.issueCount).toBe(5);
    expect(roadmap.openCount).toBe(2);
  });
});

describe('blockers', () => {
  it('reports only the blockers that are still unsettled', () => {
    const root = scratch();
    write(root, 'effort/issues/01-a.md', 'Status: resolved\n');
    write(root, 'effort/issues/02-b.md', 'Status: ready-for-agent\n');
    write(root, 'effort/issues/03-c.md', 'Status: ready-for-agent\nBlocked by: 01; 02\n');

    const blocked = featureNamed(buildRoadmap(root), 'effort').issues[2];

    expect(blocked?.unmetBlockers).toEqual(['effort/02']);
  });

  it('resolves a cross-effort reference against the effort it names', () => {
    const root = scratch();
    write(root, 'other/issues/05-a.md', 'Status: needs-triage\n');
    write(root, 'effort/issues/01-a.md', 'Status: ready-for-agent\nBlocked by: `other/05`\n');

    const blocked = featureNamed(buildRoadmap(root), 'effort').issues[0];

    expect(blocked?.unmetBlockers).toEqual(['other/05']);
  });

  it('does not read an ADR or PR number in the blocker prose as a reference', () => {
    const root = scratch();
    write(root, 'effort/issues/01-a.md', 'Status: resolved\n');
    write(
      root,
      'effort/issues/02-b.md',
      'Status: ready-for-agent\nBlocked by: 01 — settled by ADR 0052 and PR #83.\n',
    );

    const issue = featureNamed(buildRoadmap(root), 'effort').issues[1];

    expect(issue?.blockers).toEqual([{ feature: null, number: '01' }]);
    expect(issue?.unmetBlockers).toEqual([]);
  });

  it('treats a declared absence of blockers as unblocked', () => {
    const root = scratch();
    write(root, 'effort/issues/01-a.md', 'Status: ready-for-agent\n**Blocked by:** None.\n');
    write(root, 'effort/issues/02-b.md', 'Status: ready-for-agent\nBlocked by: nothing. See 01.\n');

    const issues = featureNamed(buildRoadmap(root), 'effort').issues;

    expect(issues.map((issue) => issue.blockers)).toEqual([[], []]);
  });
});

describe('release scope', () => {
  it('is absent when no ROADMAP.md is there', () => {
    expect(readReleaseScope(scratch())).toBeNull();
  });

  it('renders only open tagged issues while settled issues remain in the tally', () => {
    const root = scratch();
    write(
      root,
      'ROADMAP.md',
      '# V1 Release\n\nTag: release/v1\nGoal: Build and present one durable document.\nDefinition: v1-release/definition-of-done.md\n',
    );
    write(root, 'effort/issues/01-done.md', '# 01 — Done\n\nStatus: resolved\nTags: release/v1\n');
    write(
      root,
      'effort/issues/02-open.md',
      '# 02 — Open\n\nStatus: ready-for-agent\nTags: release/v1, another-tag\n',
    );
    write(root, 'effort/issues/03-other.md', '# 03 — Other\n\nStatus: ready-for-agent\n');

    const roadmap = buildRoadmap(root);
    const release = readReleaseScope(root);
    const text = renderRoadmap(roadmap, release);
    const html = renderRoadmapHtml(roadmap, release);

    expect(text).toContain('V1 RELEASE — 1/2 settled');
    expect(text).toContain('Build and present one durable document.');
    expect(text).toContain('Definition: v1-release/definition-of-done.md');
    expect(text).not.toMatch(/effort\/01\s+done/u);
    expect(text).toMatch(/effort\/02\s+ready-for-agent/u);
    expect(text.indexOf('V1 RELEASE')).toBeLessThan(text.indexOf('IN FLIGHT'));
    expect(html).toContain('<h2>V1 Release<span class="tally">1/2 settled</span></h2>');
    expect(html).toContain('href="v1-release/definition-of-done.md"');
    expect(html).not.toContain('href="effort/issues/01-done.md"');
    expect(html.match(/href="effort\/issues\/02-open\.md"/gu)).toHaveLength(3);
    const releaseHtml = html.slice(
      html.indexOf('class="release-scope"'),
      html.indexOf('</section>'),
    );
    expect(releaseHtml).not.toContain('href="effort/issues/03-other.md"');
    expect(html.indexOf('V1 Release')).toBeLessThan(html.indexOf('In flight'));
  });

  it('leaves both views intact when there is no ROADMAP.md', () => {
    const root = scratch();
    write(root, 'effort/issues/01-a.md', '# 01 — A\n\nStatus: ready-for-agent\n');

    expect(renderRoadmap(buildRoadmap(root))).toContain('NOT STARTED — 1');
    expect(renderRoadmapHtml(buildRoadmap(root))).not.toContain('class="release-scope"');
  });

  it('separates the longest gate path from work that can proceed in parallel', () => {
    const root = scratch();
    write(
      root,
      'ROADMAP.md',
      '# V1 Release\n\nTag: release/v1\nGoal: Ship V1.\nGate: release/03\nSpace: release/roadmap-space\n',
    );
    write(
      root,
      'foundation/issues/01-foundation.md',
      '# 01 — Foundation\n\nStatus: ready-for-agent\nTags: release/v1\n',
    );
    write(
      root,
      'release/issues/01-lifecycle.md',
      '# 01 — Lifecycle\n\nStatus: ready-for-agent\nTags: release/v1\nBlocked by: `foundation/01`\n',
    );
    write(
      root,
      'parallel/issues/01-alias.md',
      '# 01 — Alias\n\nStatus: ready-for-agent\nTags: release/v1\n',
    );
    write(
      root,
      'release/issues/03-gate.md',
      '# 03 — Prove release\n\nStatus: ready-for-agent\nTags: release/v1\nBlocked by: 01; `parallel/01`\n',
    );

    const roadmap = buildRoadmap(root);
    const release = readReleaseScope(root);
    if (release === null) throw new Error('Expected a release.');
    const plan = planRelease(roadmap, release);

    expect(release).toMatchObject({ gate: 'release/03', space: 'release/roadmap-space' });
    expect(plan.criticalPath.map(({ reference }) => reference)).toEqual([
      'foundation/01',
      'release/01',
      'release/03',
    ]);
    expect(plan.parallel.map(({ reference }) => reference)).toEqual(['parallel/01']);

    const text = renderRoadmap(roadmap, release);
    expect(text).toContain('CRITICAL PATH — 3');
    expect(text).toContain('PARALLEL WORK — 1');
    expect(text.indexOf('foundation/01')).toBeLessThan(text.indexOf('release/01'));
    expect(text.indexOf('release/01')).toBeLessThan(text.indexOf('release/03'));

    const html = renderRoadmapHtml(roadmap, release);
    expect(html).toContain('<h3>Critical path<span class="tally">3</span></h3>');
    expect(html).toContain('<h3>Parallel work<span class="tally">1</span></h3>');
    expect(html).toContain('href="release/roadmap-space/space.json"');
  });

  it('treats a settled gate as a reached release rather than a broken one', () => {
    const root = scratch();
    write(
      root,
      'ROADMAP.md',
      '# V1 Release\n\nTag: release/v1\nGoal: Ship V1.\nGate: release/03\nSpace: release/roadmap-space\n',
    );
    write(
      root,
      'release/issues/03-gate.md',
      '# 03 — Prove release\n\nStatus: resolved\nTags: release/v1\n',
    );
    write(
      root,
      'parallel/issues/01-alias.md',
      '# 01 — Alias\n\nStatus: ready-for-agent\nTags: release/v1\n',
    );

    const roadmap = buildRoadmap(root);
    const release = readReleaseScope(root);
    if (release === null) throw new Error('Expected a release.');
    const plan = planRelease(roadmap, release);

    // Reaching the gate is how a release ends, so there is no critical path left
    // to trace to it — the work that outlived it is ordinary parallel work.
    expect(plan.criticalPath).toEqual([]);
    expect(plan.parallel.map(({ reference }) => reference)).toEqual(['parallel/01']);

    const text = renderRoadmap(roadmap, release);
    expect(text).not.toContain('CRITICAL PATH');
    expect(text).toContain('parallel/01');
    expect(renderRoadmapHtml(roadmap, release)).not.toContain('<h3>Critical path');
  });

  it('renders a fully settled release without a plan to draw', () => {
    const root = scratch();
    write(
      root,
      'ROADMAP.md',
      '# V1 Release\n\nTag: release/v1\nGoal: Ship V1.\nGate: release/03\n',
    );
    write(
      root,
      'release/issues/03-gate.md',
      '# 03 — Prove release\n\nStatus: resolved\nTags: release/v1\n',
    );

    const roadmap = buildRoadmap(root);
    const release = readReleaseScope(root);
    if (release === null) throw new Error('Expected a release.');

    expect(planRelease(roadmap, release)).toEqual({ criticalPath: [], parallel: [] });
    expect(renderRoadmap(roadmap, release)).toContain('1/1 settled');
  });

  it('still refuses a gate that names no issue tagged for the release', () => {
    const root = scratch();
    write(
      root,
      'ROADMAP.md',
      '# V1 Release\n\nTag: release/v1\nGoal: Ship V1.\nGate: release/99\n',
    );
    write(
      root,
      'release/issues/03-gate.md',
      '# 03 — Prove release\n\nStatus: ready-for-agent\nTags: release/v1\n',
    );
    write(root, 'untagged/issues/01-a.md', '# 01 — A\n\nStatus: ready-for-agent\n');

    const roadmap = buildRoadmap(root);
    const release = readReleaseScope(root);
    if (release === null) throw new Error('Expected a release.');

    expect(() => planRelease(roadmap, release)).toThrow(/release\/99/u);
  });

  it('writes a dogfood Space for a reached gate, down to one with nothing left open', async () => {
    const root = scratch();
    write(
      root,
      'ROADMAP.md',
      '# V1 Release\n\nTag: release/v1\nGoal: Ship V1.\nGate: release/03\nSpace: release/roadmap-space\n',
    );
    write(
      root,
      'release/issues/03-gate.md',
      '# 03 — Prove release\n\nStatus: resolved\nTags: release/v1\n',
    );
    write(
      root,
      'parallel/issues/01-alias.md',
      '# 01 — Alias\n\nStatus: ready-for-agent\nTags: release/v1\n',
    );

    const release = readReleaseScope(root);
    if (release === null) throw new Error('Expected a release.');
    const destination = writeReleaseSpace(root, buildRoadmap(root), release);
    if (destination === null) throw new Error('Expected a generated Space.');
    expect(readdirSync(join(destination, 'cards'))).toHaveLength(1);

    // And once the work that outlived the gate settles too, the release is over
    // and there is nothing left to draw. Generating a Space is still the normal
    // outcome, so it has to stay loadable rather than fail intake as empty.
    write(
      root,
      'parallel/issues/01-alias.md',
      '# 01 — Alias\n\nStatus: resolved\nTags: release/v1\n',
    );
    const emptied = writeReleaseSpace(root, buildRoadmap(root), release);
    if (emptied === null) throw new Error('Expected a generated Space.');
    expect(readdirSync(join(emptied, 'cards'))).toHaveLength(0);

    const imported = await readSingleSpace(emptied);
    const intake = loadSpaceSnapshot(
      spaceSnapshotSchema.parse({
        id: imported.id,
        document: imported.document,
        cards: imported.cards,
      }),
    );
    expect(intake.ok ? [] : intake.errors).toEqual([]);
  });

  it('writes the open release dependency graph as a loadable dogfood Space', async () => {
    const root = scratch();
    write(
      root,
      'ROADMAP.md',
      '# V1 Release\n\nTag: release/v1\nGoal: Ship V1.\nGate: release/03\nSpace: release/roadmap-space\n',
    );
    write(
      root,
      'foundation/issues/01-foundation.md',
      '# 01 — Foundation\n\nStatus: ready-for-agent\nTags: release/v1\n',
    );
    write(
      root,
      'parallel/issues/01-alias.md',
      '# 01 — Alias\n\nStatus: ready-for-agent\nTags: release/v1\n',
    );
    write(
      root,
      'release/issues/03-gate.md',
      '# 03 — Prove release\n\nStatus: ready-for-agent\nTags: release/v1\nBlocked by: `foundation/01`, `parallel/01`\n',
    );

    const roadmap = buildRoadmap(root);
    const release = readReleaseScope(root);
    if (release === null) throw new Error('Expected a release.');
    const destination = writeReleaseSpace(root, roadmap, release);
    if (destination === null) throw new Error('Expected a generated Space.');

    expect(readdirSync(join(destination, 'cards'))).toHaveLength(3);
    const written: unknown = JSON.parse(readFileSync(join(destination, 'space.json'), 'utf8'));
    const file = spaceFileSchema.parse(written);
    expect(file.layouts?.[0]?.graphs.map(({ edges }) => edges)).toEqual([
      [expect.any(Object)],
      [expect.any(Object)],
    ]);

    const imported = await readSingleSpace(destination);
    const intake = loadSpaceSnapshot(
      spaceSnapshotSchema.parse({
        id: imported.id,
        document: imported.document,
        cards: imported.cards,
      }),
    );
    // Named with its errors rather than asserted bare: a regression in a
    // generated Id, position or Edge endpoint fails intake, and `expected false
    // to be true` says nothing about which of the three moved.
    expect(intake.ok ? [] : intake.errors).toEqual([]);
    expect(intake.ok).toBe(true);
  });
});

describe('deferrals', () => {
  it('collects declared deferrals in a settled issue', () => {
    const root = scratch();
    write(
      root,
      'effort/issues/01-a.md',
      '# 01 — A\n\nStatus: resolved\n\n## Out of scope\n\nThe wider rename.\n\n- **Deferred:** the parity manifest\n',
    );

    expect(featureNamed(buildRoadmap(root), 'effort').issues[0]?.deferrals).toEqual([
      'Out of scope',
      '- **Deferred:** the parity manifest',
    ]);
  });

  it('ignores prose that merely mentions a deferral', () => {
    const root = scratch();
    write(
      root,
      'effort/issues/01-a.md',
      'Status: resolved\n\nIssue 02 is resolved consistently with the deferred work.\n',
    );

    expect(featureNamed(buildRoadmap(root), 'effort').issues[0]?.deferrals).toEqual([]);
  });

  it('does not scan an issue that is still open', () => {
    const root = scratch();
    write(root, 'effort/issues/01-a.md', 'Status: ready-for-agent\n\n## Out of scope\n');

    expect(featureNamed(buildRoadmap(root), 'effort').issues[0]?.deferrals).toEqual([]);
  });
});

/**
 * The CLI entry point, run the way `pnpm roadmap` runs it.
 *
 * It lives behind an `import.meta.url` guard, so a subprocess is the only way to
 * reach it — the same shape `check-typescript-toolchain.test.ts` uses to prove
 * what the verify step actually does.
 */
const ROADMAP_SCRIPT = join(REPOSITORY_ROOT, 'scripts/roadmap.ts');

// `tsx` is resolved from this file rather than through `pnpm exec`: the cwd is a
// temporary directory outside the monorepo, where pnpm finds no package and
// fails before the script runs. `tsx/cli` is the entry point the package itself
// declares, so this asks for what tsx exports rather than for a path inside its
// build output that it never promised to keep.
const TSX_CLI = createRequire(import.meta.url).resolve('tsx/cli');

const runRoadmap = (cwd: string, ...args: readonly string[]) => {
  const result = spawnSync(process.execPath, [TSX_CLI, ROADMAP_SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
};

/** A `.scratch` under a fresh temporary cwd, since the script reads `process.cwd()`. */
const scratchCwd = () => {
  const cwd = mkdtempSync(join(tmpdir(), 'hyper-roadmap-cli-'));
  roots.push(cwd);
  const root = join(cwd, '.scratch');
  mkdirSync(root, { recursive: true });
  return { cwd, root };
};

const RELEASE_WITH_SPACE =
  '# V1 Release\n\nTag: release/v1\nGoal: Ship it.\nSpace: v1-release/generated-space\n';
const RELEASE_WITHOUT_SPACE = '# V1 Release\n\nTag: release/v1\nGoal: Ship it.\n';

describe('the --space command', () => {
  it('writes the Space and reports its path', () => {
    const { cwd, root } = scratchCwd();
    writeFileSync(join(root, 'ROADMAP.md'), RELEASE_WITH_SPACE);
    write(root, 'effort/issues/01-a.md', '# 01 — A\n\nStatus: ready-for-agent\nTags: release/v1\n');

    const run = runRoadmap(cwd, '--space');

    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toContain('generated-space');
  });

  it('fails when ROADMAP.md declares no Space rather than reporting success', () => {
    const { cwd, root } = scratchCwd();
    writeFileSync(join(root, 'ROADMAP.md'), RELEASE_WITHOUT_SPACE);

    const run = runRoadmap(cwd, '--space');

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('Space:');
  });

  it('fails when there is no ROADMAP.md at all', () => {
    const { cwd } = scratchCwd();

    const run = runRoadmap(cwd, '--space');

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('ROADMAP.md');
  });

  it('leaves --html alone, which asks for a render and only implies a Space', () => {
    const { cwd, root } = scratchCwd();
    writeFileSync(join(root, 'ROADMAP.md'), RELEASE_WITHOUT_SPACE);

    const run = runRoadmap(cwd, '--html');

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('roadmap.html');
  });
});
