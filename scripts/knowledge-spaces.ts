import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRoadmap, planRelease, readReleaseScope } from './roadmap';

/**
 * Turns two tracked bodies of Markdown — the ADR record and the open release
 * issues — into importable Hyper Spaces, so the project's own decisions and
 * plan can be read on a canvas rather than only in a directory listing.
 *
 * Both are **derived** (ADR 0056): the Markdown files are the source, this
 * mints the Space, and the destination is regenerated wholesale rather than
 * edited. `scripts/roadmap.ts` already writes a summary-Card dogfood Space for
 * the release; this writes the full-content pair, each with the one Graph its
 * own document set declares.
 *
 * Card ids are content-addressed rather than random, so regenerating after an
 * ADR is added leaves every other Card's identity — and therefore every Edge
 * naming it — unchanged.
 */

/**
 * Where a generated Space's Cards sit relative to each other: one collapsed
 * Card (`COLLAPSED_CARD_SIZE`, 260 x 146) plus a gutter. Written out rather
 * than imported from `@project/core`, because the root package declares no
 * `@project/*` dependency for `tsx` to resolve through.
 */
const COLUMN = 340;
const ROW = 260;

interface CardIdentity {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  /**
   * Present when the Card is authored Open, which is Layout state rather than
   * Card state (ADR 0064) — it reaches the placement below, not the Card file.
   */
  readonly openSize?: { readonly width: number; readonly height: number };
}

/** A Card the generator writes: the document itself, or a pointer at another Space. */
type SpaceCard =
  | (CardIdentity & { readonly kind: 'markdown'; readonly body: string })
  | (CardIdentity & { readonly kind: 'space'; readonly target: SpaceIdentity });

interface SpaceEdge {
  readonly from: string;
  readonly to: string;
}

/**
 * The three ids a generated Space is addressed by.
 *
 * Content-addressed and therefore knowable before the Space is written, which
 * is what lets the overview's Space Cards name a Layout and Graph in a Space
 * this run has not emitted yet. A Space Card's target is resolved when it is
 * opened rather than at intake, so the three Spaces may be written and imported
 * in any order.
 */
interface SpaceIdentity {
  readonly spaceId: string;
  readonly layoutId: string;
  readonly graphId: string;
}

const stableUuid = (namespace: string, name: string): string => {
  const hex = createHash('sha256')
    .update(`hyper-knowledge-space:${namespace}:${name}`)
    .digest('hex');
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

/**
 * Longest-path depth per Card, which is the whole of the layout strategy here.
 *
 * A first approximation on purpose: depth becomes the row and arrival order
 * within a depth becomes the column. A chain of dependencies therefore draws as
 * a line, which is what both of these graphs mostly are, and a fan draws as a
 * row under its blocker. Cycles are permitted in the domain (ADR 0032), so an
 * edge that would revisit a Card already in progress is not counted for depth
 * rather than being an error.
 */
const depthsOf = (
  ids: readonly string[],
  edges: readonly SpaceEdge[],
): ReadonlyMap<string, number> => {
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of edges) incoming.get(edge.to)?.push(edge.from);
  const depths = new Map<string, number>();
  const inProgress = new Set<string>();
  const depthOf = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    if (inProgress.has(id)) return 0;
    inProgress.add(id);
    const parents = incoming.get(id) ?? [];
    const depth = parents.length === 0 ? 0 : Math.max(...parents.map(depthOf)) + 1;
    inProgress.delete(id);
    depths.set(id, depth);
    return depth;
  };
  for (const id of ids) depthOf(id);
  return depths;
};

type Placement =
  | { x: number; y: number; open: false }
  | { x: number; y: number; open: true; openSize: { width: number; height: number } };

/**
 * The column step an Open Card earns, so authored origins do not collide.
 *
 * An Open Card displaces the Cards at greater `x` by its own growth over the
 * collapsed width (ADR 0064), and that displacement is derived at render rather
 * than stored. Spacing the authored origins by the Open width keeps the drawn
 * result readable without this file trying to predict the displacement.
 */
const openColumn = (card: SpaceCard): number =>
  card.openSize === undefined ? COLUMN : card.openSize.width + 80;

const positionsOf = (
  cards: readonly SpaceCard[],
  edges: readonly SpaceEdge[],
): Record<string, Placement> => {
  const depths = depthsOf(
    cards.map(({ id }) => id),
    edges,
  );
  const offsetByDepth = new Map<number, number>();
  return Object.fromEntries(
    cards.map((card): [string, Placement] => {
      const depth = depths.get(card.id) ?? 0;
      const x = offsetByDepth.get(depth) ?? 0;
      offsetByDepth.set(depth, x + openColumn(card));
      const at = { x, y: depth * ROW };
      return [
        card.id,
        card.openSize === undefined
          ? { ...at, open: false }
          : { ...at, open: true, openSize: card.openSize },
      ];
    }),
  );
};

/**
 * One Card file: frontmatter carrying identity, then the document.
 *
 * Only a Markdown Card has a body — `card-file.ts` refuses one on any other
 * kind rather than reading it as a stray key — so a Space Card's file is its
 * frontmatter and nothing else.
 */
const cardFile = (card: SpaceCard): string => {
  const identity = ['---', `id: ${card.id}`, `title: ${JSON.stringify(card.title)}`];
  if (card.kind === 'space') {
    return [
      ...identity,
      'kind: space',
      `spaceId: ${card.target.spaceId}`,
      `layout: ${card.target.layoutId}`,
      `graph: ${card.target.graphId}`,
      '---',
      '',
    ].join('\n');
  }
  return [...identity, 'kind: markdown', '---', '', card.body.replace(/\n*$/u, '\n')].join('\n');
};

interface GeneratedSpace {
  readonly namespace: string;
  readonly title: string;
  readonly layoutTitle: string;
  readonly graphTitle: string;
  readonly graphColor: string;
  readonly cards: readonly SpaceCard[];
  readonly edges: readonly SpaceEdge[];
}

const identityOf = (namespace: string): SpaceIdentity => ({
  spaceId: stableUuid(namespace, 'space'),
  layoutId: stableUuid(namespace, 'layout'),
  graphId: stableUuid(namespace, 'graph'),
});

const writeSpace = (destination: string, space: GeneratedSpace): string => {
  const { spaceId, layoutId, graphId } = identityOf(space.namespace);
  const document = {
    version: 1,
    id: spaceId,
    title: space.title,
    layouts: [
      {
        id: layoutId,
        title: space.layoutTitle,
        kind: 'positioned',
        positions: positionsOf(space.cards, space.edges),
        graphs: [
          {
            id: graphId,
            title: space.graphTitle,
            color: space.graphColor,
            edges: space.edges.map(({ from, to }) => ({ from, to })),
          },
        ],
        activeGraph: graphId,
      },
    ],
    defaultLayout: layoutId,
  };

  rmSync(destination, { recursive: true, force: true });
  const cardsDirectory = join(destination, 'cards');
  mkdirSync(cardsDirectory, { recursive: true });
  for (const card of space.cards) {
    writeFileSync(join(cardsDirectory, `${card.slug}.md`), cardFile(card));
  }
  writeFileSync(join(destination, 'space.json'), `${JSON.stringify(document, null, 2)}\n`);
  return destination;
};

const ADR_FILE_PATTERN = /^(\d{4})-(.+)\.md$/u;
const ADR_HEADING_PATTERN = /^#[ \t]+(.+?)[ \t]*$/u;
/**
 * `Refines: 0005, 0013` and the three other lineage relations a status block
 * writes. They are reciprocal by convention — `test/unit/adr-status-blocks.test.ts`
 * holds them to it — so each relation is read from both ends and the pair
 * deduplicated, rather than trusting one side to be complete.
 */
const ADR_REFINES_PATTERN = /^refines:[ \t]+(.+)$/iu;
const ADR_REFINED_BY_PATTERN = /^refined by:[ \t]+(.+)$/iu;
const ADR_SUPERSEDES_PATTERN = /^supersedes:[ \t]+(.+)$/iu;
const ADR_SUPERSEDED_BY_PATTERN = /^superseded by:[ \t]+(.+)$/iu;
const ADR_NUMBER_PATTERN = /^\d{4}$/u;

interface AdrDocument {
  readonly number: string;
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  /** ADR numbers this one builds on, from `Refines:` and `Supersedes:`. */
  readonly builtOn: readonly string[];
  /** ADR numbers that build on this one, from `Refined by:` and `Superseded by:`. */
  readonly buildOnIt: readonly string[];
}

const references = (lines: readonly string[], pattern: RegExp): readonly string[] => {
  for (const line of lines) {
    const matched = pattern.exec(line);
    if (matched === null) continue;
    return (matched[1] ?? '')
      .split(',')
      .map((reference) => reference.trim())
      .filter((reference) => ADR_NUMBER_PATTERN.test(reference));
  }
  return [];
};

const compareOrdinal = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const readAdrsIn = (directory: string): readonly AdrDocument[] =>
  (existsSync(directory) ? readdirSync(directory) : []).flatMap((name): readonly AdrDocument[] => {
    const matched = ADR_FILE_PATTERN.exec(name);
    if (matched === null) return [];
    const number = matched[1] ?? '';
    const slug = matched[2] ?? '';
    const body = readFileSync(join(directory, name), 'utf8');
    const lines = body.split('\n');
    const heading = lines
      .map((line) => ADR_HEADING_PATTERN.exec(line))
      .find((match) => match !== null);
    return [
      {
        number,
        slug: `${number}-${slug}`,
        title: `ADR ${number} — ${heading?.[1] ?? slug}`,
        body,
        builtOn: [
          ...references(lines, ADR_REFINES_PATTERN),
          ...references(lines, ADR_SUPERSEDES_PATTERN),
        ],
        buildOnIt: [
          ...references(lines, ADR_REFINED_BY_PATTERN),
          ...references(lines, ADR_SUPERSEDED_BY_PATTERN),
        ],
      },
    ];
  });

/**
 * Every ADR, retired ones included.
 *
 * A superseded decision moves to `superseded/` rather than being deleted, and a
 * live ADR that points at one still resolves (`docs/adr/README.md`). Reading
 * only the accepted directory would therefore drop every `Supersedes` Edge on
 * the floor and leave the lineage starting part-way through its own history.
 */
const readAdrs = (adrRoot: string): readonly AdrDocument[] =>
  [...readAdrsIn(adrRoot), ...readAdrsIn(join(adrRoot, 'superseded'))].sort((left, right) =>
    compareOrdinal(left.number, right.number),
  );

/**
 * The ADR record as a Space, with one Graph of its refinement lineage.
 *
 * An Edge runs from the decision that came first to the one that builds on it,
 * so following the Graph reads the record in the order it was decided. Both
 * spellings of the relation are collected — an ADR states `Refines:` and the
 * one it refines states `Refined by:` — and deduplicated, because a Graph
 * refuses a repeated Edge. Retired decisions are Cards too, so a `Supersedes:`
 * has somewhere to land; a reference to a number no ADR file carries is
 * dropped, because an Edge endpoint must name a Card this Layout holds.
 */
export const writeAdrSpace = (repositoryRoot: string, destination: string): string => {
  const adrs = readAdrs(join(repositoryRoot, 'docs', 'adr'));
  const idByNumber = new Map(
    adrs.map(({ number }) => [number, stableUuid('adr', `adr:${number}`)]),
  );
  const cardId = (number: string): string => {
    const id = idByNumber.get(number);
    if (id === undefined) throw new Error(`No ADR Card for ${number}.`);
    return id;
  };
  const cards = adrs.map((adr): SpaceCard => ({
    kind: 'markdown',
    id: cardId(adr.number),
    slug: adr.slug,
    title: adr.title,
    body: adr.body,
  }));

  const seen = new Set<string>();
  const edges: SpaceEdge[] = [];
  const connect = (earlier: string, later: string): void => {
    if (!idByNumber.has(earlier) || !idByNumber.has(later) || earlier === later) return;
    const key = `${earlier} ${later}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from: cardId(earlier), to: cardId(later) });
  };
  for (const adr of adrs) {
    for (const earlier of adr.builtOn) connect(earlier, adr.number);
    for (const later of adr.buildOnIt) connect(adr.number, later);
  }

  return writeSpace(destination, {
    namespace: 'adr',
    title: 'Architecture decisions',
    layoutTitle: 'Decision record',
    graphTitle: 'Refinement lineage',
    graphColor: '#2563eb',
    cards,
    edges,
  });
};

/**
 * The open release issues as a Space, with one Graph of their blockers.
 *
 * The issue files are the dependency source, as they are for `pnpm roadmap`:
 * an Edge runs from a blocker to the issue it blocks, so a source of the Graph
 * is work that can start now. Only *unmet* blockers are drawn — a settled
 * dependency is not a Card here, and an Edge to a Card the Layout does not hold
 * is a reference error.
 */
export const writeReleaseIssueSpace = (scratchRoot: string, destination: string): string | null => {
  const release = readReleaseScope(scratchRoot);
  if (release === null) return null;
  const plan = planRelease(buildRoadmap(scratchRoot), release);
  const issues = [...plan.criticalSubgraph, ...plan.parallel].sort((left, right) =>
    compareOrdinal(left.reference, right.reference),
  );
  const idByReference = new Map(
    issues.map(({ reference }) => [reference, stableUuid('release', `issue:${reference}`)]),
  );
  const cardId = (reference: string): string => {
    const id = idByReference.get(reference);
    if (id === undefined) throw new Error(`No release Card for ${reference}.`);
    return id;
  };

  const cards = issues.map((planned): SpaceCard => ({
    kind: 'markdown',
    id: cardId(planned.reference),
    slug: planned.reference.replace('/', '-'),
    title: `${planned.reference} — ${planned.issue.title}`,
    body: readFileSync(join(scratchRoot, planned.issue.path), 'utf8'),
  }));

  const edges = issues.flatMap((planned) =>
    planned.issue.unmetBlockers.flatMap((blocker) =>
      idByReference.has(blocker) ? [{ from: cardId(blocker), to: cardId(planned.reference) }] : [],
    ),
  );

  return writeSpace(destination, {
    namespace: 'release',
    title: `${release.title} issues`,
    layoutTitle: 'Remaining work',
    graphTitle: 'Blocker dependencies',
    graphColor: '#dc2626',
    cards,
    edges,
  });
};

/**
 * The Open Size a generated Space Card is authored at.
 *
 * `DEFAULT_SPACE_CARD_OPEN_SIZE` from `@project/core`, restated here for the
 * reason {@link COLUMN} is. Open rather than Closed on purpose: a Closed Space
 * Card shows only its Title, and the point of this Space is to see both
 * collections at once.
 */
const SPACE_CARD_OPEN_SIZE = { width: 960, height: 720 };

/**
 * One Space over the other two, each reached through a Space Card.
 *
 * The Cards are authored Open, so the overview draws the ADR lineage and the
 * remaining release work side by side, each through the Layout and Graph its
 * Card names. Its own Graph carries the one Edge worth traversing: the
 * decisions, then the work they leave.
 */
export const writeOverviewSpace = (destination: string): string => {
  const card = (
    namespace: string,
    slug: string,
    title: string,
  ): Extract<SpaceCard, { kind: 'space' }> => ({
    kind: 'space',
    id: stableUuid('overview', `card:${namespace}`),
    slug,
    title,
    openSize: SPACE_CARD_OPEN_SIZE,
    target: identityOf(namespace),
  });
  const decisions = card('adr', 'architecture-decisions', 'Architecture decisions');
  const remaining = card('release', 'remaining-release-work', 'Remaining release work');

  return writeSpace(destination, {
    namespace: 'overview',
    title: 'Hyper',
    layoutTitle: 'Overview',
    graphTitle: 'Decisions, then the work they leave',
    graphColor: '#7c3aed',
    cards: [decisions, remaining],
    edges: [{ from: decisions.id, to: remaining.id }],
  });
};

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  const repositoryRoot = process.cwd();
  const scratchRoot = join(repositoryRoot, '.scratch');
  if (!existsSync(join(repositoryRoot, 'docs', 'adr')) || !existsSync(scratchRoot)) {
    console.error(`Run from the repository root: no docs/adr or .scratch under ${repositoryRoot}`);
    process.exitCode = 1;
  } else {
    // Numbered, because `readImportBatch` sorts a collection's directories
    // ordinally and the memory runtime opens the first Space it imports. The
    // overview is the one to arrive on, so it has to sort first.
    const spaces = join(scratchRoot, 'spaces');
    console.log(writeOverviewSpace(join(spaces, '01-overview')));
    console.log(writeAdrSpace(repositoryRoot, join(spaces, '02-adrs')));
    const releaseSpace = writeReleaseIssueSpace(scratchRoot, join(spaces, '03-release'));
    if (releaseSpace === null) {
      console.error(`No release scope: ${join(scratchRoot, 'ROADMAP.md')} is missing.`);
      process.exitCode = 1;
    } else console.log(releaseSpace);
  }
}
