import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildRoadmap,
  readIntent,
  renderRoadmap,
  renderRoadmapHtml,
  stateOf,
  type FeatureRoadmap,
  type Roadmap,
} from '../../scripts/roadmap';

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

describe('authored intent', () => {
  it('is absent when no ROADMAP.md is there', () => {
    expect(readIntent(scratch())).toBeNull();
  });

  it('reaches both views so the ordering travels with the derived status', () => {
    const root = scratch();
    write(root, 'ROADMAP.md', '# Roadmap\n\n## Now — finish `effort`\n\nIt is foundation.\n');
    write(root, 'effort/issues/01-a.md', '# 01 — A\n\nStatus: ready-for-agent\n');

    const roadmap = buildRoadmap(root);
    const intent = readIntent(root);

    expect(renderRoadmap(roadmap, intent)).toContain('## Now — finish `effort`');
    expect(renderRoadmapHtml(roadmap, intent)).toContain(
      '<h3>Now — finish <code>effort</code></h3>',
    );
  });

  it('leaves both views intact when there is no ROADMAP.md', () => {
    const root = scratch();
    write(root, 'effort/issues/01-a.md', '# 01 — A\n\nStatus: ready-for-agent\n');

    expect(renderRoadmap(buildRoadmap(root))).toContain('NOT STARTED — 1');
    expect(renderRoadmapHtml(buildRoadmap(root))).not.toContain('class="intent"');
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
