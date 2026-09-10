import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { spaceFileSchema, spaceSnapshotSchema } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { readSingleSpace } from '../../src/import/read-single-space';
import {
  writeAdrSpace,
  writeOverviewSpace,
  writeReleaseIssueSpace,
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

/** The one assertion worth making about a generated Space: the app can load it. */
const expectLoadable = async (destination: string): Promise<void> => {
  const imported = await readSingleSpace(destination);
  const intake = loadSpaceSnapshot(
    spaceSnapshotSchema.parse({
      id: imported.id,
      document: imported.document,
      cards: imported.cards,
    }),
  );
  // Named with its errors rather than asserted bare: a regression in a generated
  // Id, position or Edge endpoint fails intake, and `expected false to be true`
  // says nothing about which of the three moved.
  expect(intake.ok ? [] : intake.errors).toEqual([]);
  expect(intake.ok).toBe(true);
};

const layoutOf = (destination: string) => {
  const written: unknown = JSON.parse(readFileSync(join(destination, 'space.json'), 'utf8'));
  const layout = spaceFileSchema.parse(written).layouts?.[0];
  if (layout === undefined) throw new Error('Expected a generated Layout.');
  return layout;
};

/** Read the Graph's Edges back as ADR numbers, which is what the assertions are about. */
const lineage = (destination: string): readonly string[] => {
  const layout = layoutOf(destination);
  const numberById = new Map(
    readdirSync(join(destination, 'cards')).map((name) => {
      const card = readFileSync(join(destination, 'cards', name), 'utf8');
      return [/^id: (.+)$/mu.exec(card)?.[1] ?? '', name.slice(0, 4)];
    }),
  );
  return (layout.graphs[0]?.edges ?? [])
    .map(({ from, to }) => `${numberById.get(from) ?? from} -> ${numberById.get(to) ?? to}`)
    .sort();
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const adr = (slug: string, status: string): string => `# ${slug}\n\n${status}\n\nThe decision.\n`;

describe('the ADR Space', () => {
  it('draws one Card per ADR and one Edge per lineage relation, retired ADRs included', async () => {
    const root = scratch();
    write(root, 'docs/adr/0001-first.md', adr('First', 'Status: accepted'));
    write(
      root,
      'docs/adr/0002-second.md',
      adr('Second', 'Status: accepted\nRefines: 0001\nSupersedes: 0003'),
    );
    write(
      root,
      'docs/adr/superseded/0003-retired.md',
      adr('Retired', 'Status: superseded\nSuperseded by: 0002'),
    );

    const destination = writeAdrSpace(root, join(scratch(), 'adrs'));

    expect(readdirSync(join(destination, 'cards')).sort()).toEqual([
      '0001-first.md',
      '0002-second.md',
      '0003-retired.md',
    ]);
    // `Supersedes: 0003` and `Superseded by: 0002` are the same relation stated
    // from both ends, and a Graph refuses a repeated Edge — so it appears once.
    expect(lineage(destination)).toEqual(['0001 -> 0002', '0003 -> 0002']);
    await expectLoadable(destination);
  });

  it('carries the ADR document as the Card body and its heading as the Title', async () => {
    const root = scratch();
    write(root, 'docs/adr/0001-first.md', adr('First', 'Status: accepted'));

    const destination = writeAdrSpace(root, join(scratch(), 'adrs'));
    const card = readFileSync(join(destination, 'cards/0001-first.md'), 'utf8');

    expect(card).toContain('title: "ADR 0001 — First"');
    expect(card).toContain('The decision.');
    await expectLoadable(destination);
  });

  it('drops a relation naming a number no ADR file carries', async () => {
    const root = scratch();
    write(
      root,
      'docs/adr/0001-first.md',
      adr('First', 'Status: accepted\nRefines: 0099\nRelated: 0002'),
    );

    const destination = writeAdrSpace(root, join(scratch(), 'adrs'));

    // 0099 has no Card, so an Edge to it would name an endpoint the Layout does
    // not hold; `Related:` is not lineage and is not read at all.
    expect(lineage(destination)).toEqual([]);
    await expectLoadable(destination);
  });

  it('lays a chain of decisions out as a line and a fan out as a row', () => {
    const root = scratch();
    write(root, 'docs/adr/0001-first.md', adr('First', 'Status: accepted'));
    write(root, 'docs/adr/0002-second.md', adr('Second', 'Status: accepted\nRefines: 0001'));
    write(root, 'docs/adr/0003-third.md', adr('Third', 'Status: accepted\nRefines: 0001'));

    const layout = layoutOf(writeAdrSpace(root, join(scratch(), 'adrs')));
    const positions = Object.values(layout.positions).flatMap((placement) =>
      placement === undefined ? [] : [{ x: placement.x, y: placement.y }],
    );

    expect(positions).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 260 },
      { x: 340, y: 260 },
    ]);
  });
});

describe('the release issue Space', () => {
  const roadmapFile =
    '# V1 Release\n\nTag: release/v1\nGoal: Ship V1.\nGate: release/03\nSpace: release/roadmap-space\n';

  it('draws the open release issues and an Edge from each unmet blocker', async () => {
    const root = scratch();
    write(root, 'ROADMAP.md', roadmapFile);
    write(
      root,
      'foundation/issues/01-foundation.md',
      '# 01 — Foundation\n\nStatus: ready-for-agent\nTags: release/v1\n\nBuild the base.\n',
    );
    write(
      root,
      'release/issues/02-settled.md',
      '# 02 — Settled\n\nStatus: resolved\nTags: release/v1\n',
    );
    write(
      root,
      'release/issues/03-gate.md',
      '# 03 — Prove release\n\nStatus: ready-for-agent\nTags: release/v1\nBlocked by: `foundation/01`, `release/02`\n',
    );

    const destination = writeReleaseIssueSpace(root, join(scratch(), 'release'));
    if (destination === null) throw new Error('Expected a generated Space.');

    // The settled issue is not remaining work, so it is not a Card — and the
    // blocker naming it is met, so it draws no Edge either.
    expect(readdirSync(join(destination, 'cards')).sort()).toEqual([
      'foundation-01.md',
      'release-03.md',
    ]);
    expect(layoutOf(destination).graphs[0]?.edges).toHaveLength(1);
    expect(readFileSync(join(destination, 'cards/foundation-01.md'), 'utf8')).toContain(
      'Build the base.',
    );
    await expectLoadable(destination);
  });

  it('answers null when there is no release scope to draw', () => {
    expect(writeReleaseIssueSpace(scratch(), join(scratch(), 'release'))).toBeNull();
  });
});

describe('the overview Space', () => {
  it('reaches the other two Spaces through Open Space Cards naming their Layout and Graph', async () => {
    const root = scratch();
    write(root, 'docs/adr/0001-first.md', adr('First', 'Status: accepted'));

    const spaces = scratch();
    const adrs = writeAdrSpace(root, join(spaces, '02-adrs'));
    const overview = writeOverviewSpace(join(spaces, '01-overview'));

    const adrDocument = spaceFileSchema.parse(
      JSON.parse(readFileSync(join(adrs, 'space.json'), 'utf8')),
    );
    const card = readFileSync(join(overview, 'cards/architecture-decisions.md'), 'utf8');

    expect(card).toContain(`spaceId: ${adrDocument.id}`);
    expect(card).toContain(`layout: ${adrDocument.layouts?.[0]?.id ?? ''}`);
    expect(card).toContain(`graph: ${adrDocument.layouts?.[0]?.graphs[0]?.id ?? ''}`);
    // `card-file.ts` refuses a body on any Card kind but Markdown.
    expect(card.split('---\n')[2]).toBe('');
    expect(Object.values(layoutOf(overview).positions).map((placement) => placement?.open)).toEqual(
      [true, true],
    );
    await expectLoadable(overview);
  });
});
