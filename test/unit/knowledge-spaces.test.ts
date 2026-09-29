import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { spaceFileSchema } from '@project/core';
import { importFixture } from '../support/import-fixture';
import { MemorySpaceRepository } from '../support/memory-space-repository';
import {
  criticalEdgesOf,
  layeredPositions,
  writeKnowledgeAggregate,
} from '../../scripts/knowledge-spaces';

const roots: string[] = [];

const write = (root: string, path: string, content: string): void => {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
};

const scratch = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'hyper-knowledge-spaces-'));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const adr = (title: string, status: string): string => `# ${title}\n\n${status}\n\nThe decision.\n`;
const issue = (title: string, status: string, blockers = ''): string =>
  `# ${title}\n\nStatus: ${status}\n${blockers === '' ? '' : `Blocked by: ${blockers}\n`}\nThe work.\n`;

/** A repository holding four ADRs and five issues, one of them settled. */
const repository = (): string => {
  const root = scratch();
  write(root, 'docs/adr/0001-first.md', adr('First', 'Status: accepted'));
  write(
    root,
    'docs/adr/0002-second.md',
    adr('Second', 'Status: accepted\nRefines: 0001, 0099\nSupersedes: 0003\nRelated: 0001'),
  );
  write(root, 'docs/adr/0004-rename.md', adr('Rename', 'Status: accepted\nRenames: 0001, 0002'));
  write(
    root,
    'docs/adr/superseded/0003-retired.md',
    adr('Retired', 'Status: superseded\nSuperseded by: 0002'),
  );
  write(root, '.scratch/base/issues/01-foundation.md', issue('Foundation', 'ready-for-agent'));
  write(root, '.scratch/base/issues/02-settled.md', issue('Settled', 'done'));
  write(
    root,
    '.scratch/base/issues/03-walls.md',
    issue('Walls', 'ready-for-agent', '`base/01`, `base/02`'),
  );
  write(root, '.scratch/roof/issues/01-roof.md', issue('Roof', 'needs-triage', '`base/03`'));
  write(root, '.scratch/roof/issues/02-paint.md', issue('Paint', 'needs-triage', '`base/01`'));
  return root;
};

interface Written {
  readonly title: string;
  readonly directory: string;
  readonly document: ReturnType<typeof spaceFileSchema.parse>;
  /** Resource file name to its frontmatter id. */
  readonly ids: ReadonlyMap<string, string>;
}

interface Generated {
  readonly destination: string;
  readonly spaces: readonly Written[];
}

const generate = (root: string): Generated => {
  const destination = join(scratch(), 'spaces');
  const spaces = writeKnowledgeAggregate(root, join(root, '.scratch'), destination).map(
    (directory): Written => {
      const document = spaceFileSchema.parse(
        JSON.parse(readFileSync(join(directory, 'space.json'), 'utf8')),
      );
      const ids = new Map(
        readdirSync(join(directory, 'resources')).map((name) => [
          name,
          /^id: (.+)$/mu.exec(readFileSync(join(directory, 'resources', name), 'utf8'))?.[1] ?? '',
        ]),
      );
      return { title: document.title, directory, document, ids };
    },
  );
  return { destination, spaces };
};

const space = (spaces: readonly Written[], title: string): Written => {
  const found = spaces.find((candidate) => candidate.title === title);
  if (found === undefined) throw new Error(`No Space titled ${title}`);
  return found;
};

/** A Graph's Edges as Resource file names without `.md`, which is what the assertions are about. */
const edges = (written: Written, graphTitle: string): readonly string[] => {
  const nameById = new Map([...written.ids].map(([name, id]) => [id, name.replace(/\.md$/u, '')]));
  const graph = written.document.maps?.[0]?.graphs.find(({ title }) => title === graphTitle);
  if (graph === undefined) throw new Error(`No Graph titled ${graphTitle}`);
  return graph.edges.map(({ from, to }) => `${nameById.get(from)} -> ${nameById.get(to)}`).sort();
};

describe('the knowledge aggregate', () => {
  it('imports as one Meta-rooted aggregate through the fixture importer', async () => {
    const { destination, spaces } = generate(repository());

    const meta = await importFixture(new MemorySpaceRepository(), { directory: destination });

    expect(meta.snapshot.document.title).toBe('Hyper');
    expect(spaces.map(({ title }) => title)).toEqual([
      'Hyper',
      'Architecture decisions',
      'Open issues',
    ]);
  });

  it('reaches both Spaces from Meta through Open Space Resources naming their Map and Graph', () => {
    const { spaces } = generate(repository());
    const overview = space(spaces, 'Hyper');

    for (const [name, title] of [
      ['architecture-decisions.md', 'Architecture decisions'],
      ['open-issues.md', 'Open issues'],
    ] as const) {
      const target = space(spaces, title).document;
      const file = readFileSync(join(overview.directory, 'resources', name), 'utf8');
      expect(file).toContain(`spaceId: ${target.id}`);
      expect(file).toContain(`map: ${target.maps?.[0]?.id ?? ''}`);
      expect(file).toContain(`graph: ${target.maps?.[0]?.graphs[0]?.id ?? ''}`);
    }
    expect(
      Object.values(overview.document.maps?.[0]?.positions ?? {}).map(
        (placement) => placement?.open,
      ),
    ).toEqual([true, true]);
  });
});

describe('the ADR Space', () => {
  it('draws one Resource per ADR, retired ones included, titled from its heading', () => {
    const decisions = space(generate(repository()).spaces, 'Architecture decisions');

    expect([...decisions.ids.keys()].sort()).toEqual([
      '0001-first.md',
      '0002-second.md',
      '0003-retired.md',
      '0004-rename.md',
    ]);
    const retired = readFileSync(join(decisions.directory, 'resources/0003-retired.md'), 'utf8');
    expect(retired).toContain('title: "ADR 0003 (superseded) — Retired"');
    expect(retired).toContain('The decision.');
  });

  it('draws Refines and Supersedes as two Graphs, each relation once, dropping unknown numbers', () => {
    const decisions = space(generate(repository()).spaces, 'Architecture decisions');

    // `Supersedes: 0003` and `Superseded by: 0002` are one relation stated from
    // both ends; 0099 has no Resource; `Related:` is not a dependency.
    expect(edges(decisions, 'Refines')).toEqual(['0001-first -> 0002-second']);
    expect(edges(decisions, 'Supersedes')).toEqual(['0003-retired -> 0002-second']);
  });

  it('draws Renames as its own Graph and places no ADR by it', () => {
    const decisions = space(generate(repository()).spaces, 'Architecture decisions');

    expect(edges(decisions, 'Renames')).toEqual([
      '0001-first -> 0004-rename',
      '0002-second -> 0004-rename',
    ]);
    // The rename ADR has no dependency Edge, so it is packed with the
    // unconnected ADRs below the placed ones rather than drawn after 0002.
    const positions = new Map(Object.entries(decisions.document.maps?.[0]?.positions ?? {}));
    const rename = positions.get(decisions.ids.get('0004-rename.md') ?? '');
    const second = positions.get(decisions.ids.get('0002-second.md') ?? '');
    expect(rename?.y).toBeGreaterThan(second?.y ?? 0);
  });
});

describe('the issue Space', () => {
  it('draws the open issues and splits their unmet blockers into critical and other', () => {
    const issues = space(generate(repository()).spaces, 'Open issues');

    // The settled issue is not remaining work, so it is not a Resource, and the
    // blocker naming it is met.
    expect([...issues.ids.keys()].sort()).toEqual([
      'base-01-foundation.md',
      'base-03-walls.md',
      'roof-01-roof.md',
      'roof-02-paint.md',
    ]);
    expect(edges(issues, 'Critical paths')).toEqual([
      'base-01-foundation -> base-03-walls',
      'base-03-walls -> roof-01-roof',
    ]);
    expect(edges(issues, 'Other blockers')).toEqual(['base-01-foundation -> roof-02-paint']);
  });
});

describe('criticalEdgesOf', () => {
  it('keeps every tied longest path and ignores a shorter branch', () => {
    const critical = criticalEdgesOf(
      ['a', 'b', 'c', 'd', 'e'],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
        { from: 'c', to: 'd' },
        { from: 'a', to: 'e' },
      ],
    );
    expect(critical.map(({ from, to }) => `${from}${to}`)).toEqual(['ab', 'ac', 'bd', 'cd']);
  });

  it('terminates on a cycle', () => {
    expect(() =>
      criticalEdgesOf(
        ['a', 'b'],
        [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'a' },
        ],
      ),
    ).not.toThrow();
  });
});

describe('layeredPositions', () => {
  it('places depth left to right and packs unconnected nodes below the connected ones', () => {
    const positions = layeredPositions(
      ['a', 'b', 'c', 'lonely'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    );
    const at = (id: string) => ({ x: positions[id]?.x, y: positions[id]?.y });

    expect([at('a'), at('b'), at('c')].map(({ x }) => x)).toEqual([0, 380, 760]);
    expect(new Set([at('a'), at('b'), at('c')].map(({ y }) => y)).size).toBe(1);
    expect(at('lonely').y).toBeGreaterThan(at('a').y ?? 0);
  });
});
