import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRoadmap, isSettled } from './roadmap';

/**
 * Turns two tracked bodies of Markdown — the ADR record and the open issues —
 * into one importable aggregate, so the project's own decisions and remaining
 * work can be read on a canvas rather than only in a directory listing.
 *
 * The output is **derived** (ADR 0056): the Markdown files are the source, this
 * mints the aggregate, and the destination is regenerated wholesale rather than
 * edited. It is a canonical aggregate directory — `hyper.json` naming the Meta
 * Space, and one `<space-uuid>/` directory per Space — so it imports through the
 * same door as the tracked fixture. The Meta Space reaches the ADR and issue
 * Spaces through two Space Resources, which is also what makes those two valid
 * members of the aggregate: an ordinary Space nothing references is refused.
 *
 * Every id is content-addressed rather than random, so regenerating after an
 * ADR or issue is added leaves every other Resource's identity — and therefore
 * every Edge naming it — unchanged.
 */

/**
 * The layered placement's grid: one collapsed Resource (`COLLAPSED_RESOURCE_SIZE`,
 * 260 x 146) plus a gutter. Written out rather than imported from
 * `@project/core`, because the root package declares no `@project/*`
 * dependency for `tsx` to resolve through.
 */
const COLUMN = 380;
const ROW = 200;
const COMPONENT_GAP = 160;
const ISOLATED_COLUMNS = 8;

/** `DEFAULT_SPACE_RESOURCE_OPEN_SIZE` from `@project/core`, restated for the reason {@link COLUMN} is. */
const SPACE_RESOURCE_OPEN_SIZE = { width: 960, height: 720 };

const AGGREGATE_VERSION = 1;
const SPACE_FILE_VERSION = 1;

interface ResourceIdentity {
  readonly id: string;
  /** The Resource file's name without `.md`; unique within its Space. */
  readonly slug: string;
  readonly title: string;
}

/** A Resource the generator writes: the document itself, or a pointer at another Space. */
type GeneratedResource =
  | (ResourceIdentity & { readonly kind: 'markdown'; readonly body: string })
  | (ResourceIdentity & { readonly kind: 'space'; readonly target: SpaceIdentity });

export interface GeneratedEdge {
  readonly from: string;
  readonly to: string;
}

interface GeneratedGraph {
  readonly id: string;
  readonly title: string;
  readonly color: string;
  readonly edges: readonly GeneratedEdge[];
}

type Placement =
  | { readonly x: number; readonly y: number; readonly open: false }
  | {
      readonly x: number;
      readonly y: number;
      readonly open: true;
      readonly openSize: { readonly width: number; readonly height: number };
    };

/** Where a Map puts each of its Resources, keyed by Resource id. */
type Positions = Readonly<Record<string, Placement>>;

/**
 * The ids a generated Space is addressed by: its own, its default Map's, and
 * the Graph a Space Resource opens it on.
 */
interface SpaceIdentity {
  readonly spaceId: string;
  readonly mapId: string;
  readonly graphId: string;
}

interface GeneratedMap {
  readonly id: string;
  readonly title: string;
  /** The first Graph is the Map's Active Graph. */
  readonly graphs: readonly [GeneratedGraph, ...GeneratedGraph[]];
  readonly positions: Positions;
}

interface GeneratedSpace {
  readonly identity: SpaceIdentity;
  readonly title: string;
  readonly resources: readonly GeneratedResource[];
  /**
   * The first Map is the default Map, and it and its Active Graph are what
   * `identity` names, so a Space Resource opens the Space there.
   */
  readonly maps: readonly [GeneratedMap, ...GeneratedMap[]];
}

const stableUuid = (namespace: string, name: string): string => {
  const hex = createHash('sha256')
    .update(`hyper-knowledge-space:${namespace}:${name}`)
    .digest('hex');
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const identityOf = (namespace: string, graph: string): SpaceIdentity => ({
  spaceId: stableUuid(namespace, 'space'),
  mapId: stableUuid(namespace, 'map'),
  graphId: stableUuid(namespace, `graph:${graph}`),
});

const compareOrdinal = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** Every Edge whose ends are distinct and both present, each once, in first-seen order. */
const distinctEdges = (
  ids: ReadonlySet<string>,
  edges: readonly GeneratedEdge[],
): readonly GeneratedEdge[] => {
  const seen = new Set<string>();
  return edges.filter(({ from, to }) => {
    if (from === to || !ids.has(from) || !ids.has(to)) return false;
    const key = `${from}\u0000${to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Longest-path depth of every node from a source.
 *
 * Cycles are permitted in the domain (ADR 0032), so an Edge that would revisit
 * a node already in progress does not count towards depth rather than being an
 * error.
 */
export const depthsOf = (
  ids: readonly string[],
  edges: readonly GeneratedEdge[],
): ReadonlyMap<string, number> => {
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of edges) incoming.get(edge.to)?.push(edge.from);
  const depths = new Map<string, number>();
  const inProgress = new Set<string>();
  const depthOf = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    if (inProgress.has(id)) return -1;
    inProgress.add(id);
    const parents = (incoming.get(id) ?? []).map(depthOf);
    inProgress.delete(id);
    const depth = parents.length === 0 ? 0 : Math.max(...parents) + 1;
    depths.set(id, depth);
    return depth;
  };
  for (const id of ids) depthOf(id);
  return depths;
};

/** Weakly connected components, each in `ids` order, largest first. */
const componentsOf = (
  ids: readonly string[],
  edges: readonly GeneratedEdge[],
): readonly (readonly string[])[] => {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    const next = parent.get(id) ?? id;
    if (next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  for (const { from, to } of edges) parent.set(find(from), find(to));
  const byRoot = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const members = byRoot.get(root);
    if (members === undefined) byRoot.set(root, [id]);
    else members.push(id);
  }
  return [...byRoot.values()].sort((left, right) => right.length - left.length);
};

/**
 * A left-to-right layered placement of a directed graph: a first draft for an
 * author to tidy, not a strategy the app runs (ADR 0086).
 *
 * Each weakly connected component is placed on its own band. Within one, a
 * node's column is its longest-path depth, and each column is ordered by a few
 * barycentre sweeps against its neighbours so Edges cross less. Bands are
 * stacked largest first, and the nodes no Edge touches are packed into a grid
 * below them all.
 */
export const layeredPositions = (
  ids: readonly string[],
  edges: readonly GeneratedEdge[],
): Positions => {
  const connected = distinctEdges(new Set(ids), edges);
  const neighbours = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const { from, to } of connected) {
    neighbours.get(from)?.push(to);
    neighbours.get(to)?.push(from);
  }
  const depths = depthsOf(ids, connected);
  const positions = new Map<string, Placement>();
  const components = componentsOf(ids, connected);
  let top = 0;

  for (const component of components.filter((members) => members.length > 1)) {
    const layerCount = Math.max(...component.map((id) => depths.get(id) ?? 0)) + 1;
    const layers: string[][] = Array.from({ length: layerCount }, () => []);
    for (const id of component) layers[depths.get(id) ?? 0]?.push(id);

    const indexOf = new Map<string, number>();
    const index = (): void => {
      for (const layer of layers) layer.forEach((id, at) => indexOf.set(id, at));
    };
    index();
    const sweep = (layer: string[], adjacent: number): void => {
      const barycentre = new Map(
        layer.map((id, at) => {
          const near = (neighbours.get(id) ?? []).filter((other) => depths.get(other) === adjacent);
          const weight =
            near.length === 0
              ? at
              : near.reduce((sum, other) => sum + (indexOf.get(other) ?? 0), 0) / near.length;
          return [id, weight];
        }),
      );
      layer.sort((left, right) => (barycentre.get(left) ?? 0) - (barycentre.get(right) ?? 0));
      layer.forEach((id, at) => indexOf.set(id, at));
    };
    for (let pass = 0; pass < 4; pass += 1) {
      for (let depth = 1; depth < layerCount; depth += 1) sweep(layers[depth] ?? [], depth - 1);
      for (let depth = layerCount - 2; depth >= 0; depth -= 1)
        sweep(layers[depth] ?? [], depth + 1);
    }

    const tallest = Math.max(...layers.map((layer) => layer.length));
    layers.forEach((layer, depth) => {
      const offset = ((tallest - layer.length) * ROW) / 2;
      layer.forEach((id, at) => {
        positions.set(id, {
          x: depth * COLUMN,
          y: Math.round(top + offset + at * ROW),
          open: false,
        });
      });
    });
    top += tallest * ROW + COMPONENT_GAP;
  }

  components
    .filter((members) => members.length === 1)
    .flat()
    .forEach((id, at) => {
      positions.set(id, {
        x: (at % ISOLATED_COLUMNS) * COLUMN,
        y: top + Math.floor(at / ISOLATED_COLUMNS) * ROW,
        open: false,
      });
    });
  return Object.fromEntries(positions);
};

/**
 * Every Edge on a longest path of its component — the critical path, with ties
 * kept rather than chosen between.
 *
 * A component's critical length is the greatest depth any of its nodes reaches.
 * Walking back from every node at that depth through each predecessor exactly
 * one layer shallower collects every longest path at once, the way
 * `planRelease` collects the release's critical subgraph.
 */
export const criticalEdgesOf = (
  ids: readonly string[],
  edges: readonly GeneratedEdge[],
): readonly GeneratedEdge[] => {
  const connected = distinctEdges(new Set(ids), edges);
  const depths = depthsOf(ids, connected);
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const { from, to } of connected) incoming.get(to)?.push(from);
  const critical = new Set<string>();
  const tracePredecessors = (id: string, visited: Set<string>): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const depth = depths.get(id) ?? 0;
    for (const from of incoming.get(id) ?? []) {
      if ((depths.get(from) ?? 0) !== depth - 1) continue;
      critical.add(`${from}\u0000${id}`);
      tracePredecessors(from, visited);
    }
  };
  for (const component of componentsOf(ids, connected)) {
    if (component.length < 2) continue;
    const longest = Math.max(...component.map((id) => depths.get(id) ?? 0));
    const visited = new Set<string>();
    for (const id of component) if (depths.get(id) === longest) tracePredecessors(id, visited);
  }
  return connected.filter(({ from, to }) => critical.has(`${from}\u0000${to}`));
};

/**
 * One Resource file: frontmatter carrying identity, then the document.
 *
 * Only a Markdown Resource has a body, so a Space Resource's file is its
 * frontmatter and nothing else.
 */
const resourceFile = (resource: GeneratedResource): string => {
  const identity = ['---', `id: ${resource.id}`, `title: ${JSON.stringify(resource.title)}`];
  if (resource.kind === 'space') {
    return [
      ...identity,
      'kind: space',
      `spaceId: ${resource.target.spaceId}`,
      `map: ${resource.target.mapId}`,
      `graph: ${resource.target.graphId}`,
      '---',
      '',
    ].join('\n');
  }
  return [...identity, 'kind: markdown', '---', '', resource.body.replace(/\n*$/u, '\n')].join(
    '\n',
  );
};

/** Write one Space directory, named for its Space id as a canonical aggregate requires. */
const writeSpace = (aggregate: string, space: GeneratedSpace): string => {
  const { spaceId, mapId } = space.identity;
  const document = {
    version: SPACE_FILE_VERSION,
    id: spaceId,
    title: space.title,
    defaultMap: mapId,
    maps: space.maps.map((generated) => ({
      id: generated.id,
      title: generated.title,
      kind: 'positioned',
      positions: generated.positions,
      graphs: generated.graphs.map(({ id, title, color, edges }) => ({
        id,
        title,
        color,
        headShape: 'arrow',
        edges: edges.map(({ from, to }) => ({ from, to })),
      })),
      activeGraph: generated.graphs[0].id,
    })),
  };

  const destination = join(aggregate, spaceId);
  const resourcesDirectory = join(destination, 'resources');
  mkdirSync(resourcesDirectory, { recursive: true });
  for (const resource of space.resources) {
    writeFileSync(join(resourcesDirectory, `${resource.slug}.md`), resourceFile(resource));
  }
  writeFileSync(join(destination, 'space.json'), `${JSON.stringify(document, null, 2)}\n`);
  return destination;
};

const ADR_FILE_PATTERN = /^(\d{4})-(.+)\.md$/u;
const ADR_HEADING_PATTERN = /^#[ \t]+(.+?)[ \t]*$/u;
/**
 * `Refines: 0005, 0013` and the five other lineage relations a status block
 * writes. They are reciprocal by convention, so each relation is read from both
 * ends and the pair deduplicated, rather than trusting one side to be complete.
 * `Related:` is not a dependency and is not read.
 */
const ADR_REFINES_PATTERN = /^refines:[ \t]+(.+)$/iu;
const ADR_REFINED_BY_PATTERN = /^refined by:[ \t]+(.+)$/iu;
const ADR_RENAMES_PATTERN = /^renames:[ \t]+(.+)$/iu;
const ADR_RENAMED_BY_PATTERN = /^renamed by:[ \t]+(.+)$/iu;
const ADR_SUPERSEDES_PATTERN = /^supersedes:[ \t]+(.+)$/iu;
const ADR_SUPERSEDED_BY_PATTERN = /^superseded by:[ \t]+(.+)$/iu;
const ADR_NUMBER_PATTERN = /^\d{4}$/u;

interface AdrDocument {
  readonly number: string;
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly refines: readonly string[];
  readonly refinedBy: readonly string[];
  readonly renames: readonly string[];
  readonly renamedBy: readonly string[];
  readonly supersedes: readonly string[];
  readonly supersededBy: readonly string[];
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

const readAdrsIn = (directory: string, retired: boolean): readonly AdrDocument[] =>
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
        title: `ADR ${number}${retired ? ' (superseded)' : ''} — ${heading?.[1] ?? slug}`,
        body,
        refines: references(lines, ADR_REFINES_PATTERN),
        refinedBy: references(lines, ADR_REFINED_BY_PATTERN),
        renames: references(lines, ADR_RENAMES_PATTERN),
        renamedBy: references(lines, ADR_RENAMED_BY_PATTERN),
        supersedes: references(lines, ADR_SUPERSEDES_PATTERN),
        supersededBy: references(lines, ADR_SUPERSEDED_BY_PATTERN),
      },
    ];
  });

/**
 * Every ADR, retired ones included: a superseded decision moves to
 * `superseded/` rather than being deleted, and reading only the accepted
 * directory would drop every `Supersedes` Edge on the floor.
 */
const readAdrs = (adrRoot: string): readonly AdrDocument[] =>
  [...readAdrsIn(adrRoot, false), ...readAdrsIn(join(adrRoot, 'superseded'), true)].sort(
    (left, right) => compareOrdinal(left.number, right.number),
  );

const ADR_STREAM_HEADING_PATTERN = /^##[ \t]+(.+?)[ \t]*$/u;
const ADR_INDEX_ROW_PATTERN = /^\|[ \t]*\[(\d{4})\]\([^)]*\)[ \t]*\|[ \t]*(.*?)[ \t]*\|[ \t]*$/u;

/** One section of the ADR index: a feature stream, and what each ADR it lists binds. */
interface AdrStream {
  readonly title: string;
  readonly slug: string;
  /** ADR number to its index line, in the order the index lists them. */
  readonly binds: ReadonlyMap<string, string>;
}

const slugOf = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');

/**
 * The feature streams `docs/adr/README.md` files every accepted ADR under: each
 * `##` section holding at least one ADR row is one stream. An index that is
 * missing reads as no streams, and every ADR is then drawn unfiled.
 */
const readStreams = (adrRoot: string): readonly AdrStream[] => {
  const index = join(adrRoot, 'README.md');
  if (!existsSync(index)) return [];
  const streams: { title: string; binds: Map<string, string> }[] = [];
  for (const line of readFileSync(index, 'utf8').split('\n')) {
    const heading = ADR_STREAM_HEADING_PATTERN.exec(line);
    if (heading !== null) {
      streams.push({ title: heading[1] ?? '', binds: new Map() });
      continue;
    }
    const row = ADR_INDEX_ROW_PATTERN.exec(line);
    if (row !== null) streams.at(-1)?.binds.set(row[1] ?? '', row[2] ?? '');
  }
  return streams
    .filter(({ binds }) => binds.size > 0)
    .map(({ title, binds }) => ({ title, slug: slugOf(title), binds }));
};

/**
 * The stream every ADR belongs to. The index lists only accepted ADRs, so the
 * rest are placed by their lineage: a superseded ADR joins the stream of the
 * ADR that replaced it, and any other unlisted one (rejected, proposed) the
 * stream of the first ADR it refines. An ADR neither rule reaches is unfiled.
 */
const streamsByNumber = (
  adrs: readonly AdrDocument[],
  streams: readonly AdrStream[],
): ReadonlyMap<string, AdrStream> => {
  const listed = new Map(
    streams.flatMap((stream) =>
      [...stream.binds.keys()].map((number) => [number, stream] as const),
    ),
  );
  const byNumber = new Map(adrs.map((adr) => [adr.number, adr]));
  const streamOf = (number: string, visiting: ReadonlySet<string>): AdrStream | undefined => {
    const direct = listed.get(number);
    if (direct !== undefined || visiting.has(number)) return direct;
    const adr = byNumber.get(number);
    if (adr === undefined) return undefined;
    const next = new Set(visiting).add(number);
    return [...adr.supersededBy, ...adr.refines]
      .map((other) => streamOf(other, next))
      .find((stream) => stream !== undefined);
  };
  return new Map(
    adrs.flatMap((adr) => {
      const stream = streamOf(adr.number, new Set());
      return stream === undefined ? [] : [[adr.number, stream] as const];
    }),
  );
};

const ADR_NAMESPACE = 'adr';
const ADR_GRAPHS = { refines: 'refines', supersedes: 'supersedes', renames: 'renames' } as const;
const LANE_GAP = 240;
const REFINES_COLOR = '#1f77b4';
const STORY_COLOR = '#ff7f0e';
const SUPERSEDES_COLOR = '#7f7f7f';

const shifted = (positions: Positions, dx: number, dy: number): Positions =>
  Object.fromEntries(
    Object.entries(positions).map(([id, placement]) => [
      id,
      { ...placement, x: placement.x + dx, y: placement.y + dy },
    ]),
  );

/** How far below its top a placement reaches, so the next band can start clear of it. */
const depthBelow = (positions: Positions): number =>
  Math.max(0, ...Object.values(positions).map(({ y }) => y + ROW));

/** One column of Resources, top to bottom, at `x`. */
const column = (ids: readonly string[], x: number): Positions =>
  Object.fromEntries(
    ids.map((id, at): [string, Placement] => [id, { x, y: at * ROW, open: false }]),
  );

/** Each id followed by the next: a path through `ids` in order. */
const chain = (ids: readonly string[]): readonly GeneratedEdge[] =>
  ids.flatMap((to, at) => {
    const from = ids[at - 1];
    return from === undefined ? [] : [{ from, to }];
  });

/**
 * The ADR record as a Space: one Resource per ADR, plus one header Resource per
 * feature stream, drawn on one Map per stream and an `All decisions` Map of
 * every stream at once.
 *
 * An Edge runs from the decision that came first to the one that builds on it,
 * so following a Graph reads the record in the order it was decided. Every Map
 * is laid out over the two dependency Graphs only: a rename touches most of the
 * log, so placing by it would pull every decision towards the rename ADRs.
 */
export const adrSpace = (repositoryRoot: string): GeneratedSpace => {
  const adrRoot = join(repositoryRoot, 'docs', 'adr');
  const adrs = readAdrs(adrRoot);
  const streams = readStreams(adrRoot);
  const streamOf = streamsByNumber(adrs, streams);
  const idByNumber = new Map(
    adrs.map(({ number }) => [number, stableUuid(ADR_NAMESPACE, `adr:${number}`)]),
  );
  const idOf = (number: string): string => idByNumber.get(number) ?? `missing:${number}`;
  const ids = new Set(idByNumber.values());
  const lineage = (
    earlier: (adr: AdrDocument) => readonly string[],
    later: (adr: AdrDocument) => readonly string[],
  ): readonly GeneratedEdge[] =>
    distinctEdges(
      ids,
      adrs.flatMap((adr) => [
        ...earlier(adr).map((number) => ({ from: idOf(number), to: idOf(adr.number) })),
        ...later(adr).map((number) => ({ from: idOf(adr.number), to: idOf(number) })),
      ]),
    );
  const refines = lineage(
    ({ refines }) => refines,
    ({ refinedBy }) => refinedBy,
  );
  const supersedes = lineage(
    ({ supersedes }) => supersedes,
    ({ supersededBy }) => supersededBy,
  );
  const renames = lineage(
    ({ renames }) => renames,
    ({ renamedBy }) => renamedBy,
  );
  const dependencies = [...refines, ...supersedes];
  const identity = identityOf(ADR_NAMESPACE, ADR_GRAPHS.refines);

  const lanes = streams.map((stream) => {
    const members = adrs.filter(({ number }) => streamOf.get(number) === stream);
    const header: GeneratedResource = {
      kind: 'markdown',
      id: stableUuid(ADR_NAMESPACE, `stream:${stream.slug}`),
      slug: `stream-${stream.slug}`,
      title: stream.title,
      body: [
        `# ${stream.title}`,
        '',
        `${members.length} decisions, in the order they were made.`,
        '',
        ...members.map((adr) => {
          const binds = stream.binds.get(adr.number);
          return binds === undefined ? `- **${adr.title}**` : `- **${adr.title}** — ${binds}`;
        }),
      ].join('\n'),
    };
    return { stream, header, members: members.map(({ number }) => idOf(number)) };
  });
  const unfiled = adrs
    .filter(({ number }) => !streamOf.has(number))
    .map(({ number }) => idOf(number));

  const allDecisions = (): Positions => {
    const placed: Positions[] = [];
    let top = 0;
    for (const { header, members } of [
      ...lanes,
      ...(unfiled.length === 0 ? [] : [{ header: undefined, members: unfiled }]),
    ]) {
      const ordered = shifted(layeredPositions(members, dependencies), COLUMN, 0);
      const lane: Positions =
        header === undefined ? ordered : { [header.id]: { x: 0, y: 0, open: false }, ...ordered };
      placed.push(shifted(lane, 0, top));
      top += depthBelow(lane) + LANE_GAP;
    }
    return Object.fromEntries(placed.flatMap((lane) => Object.entries(lane)));
  };

  const streamMap = ({ stream, header, members }: (typeof lanes)[number]): GeneratedMap => {
    const inside = new Set(members);
    const touching = dependencies.filter(({ from, to }) => inside.has(from) || inside.has(to));
    const buildsOn = [
      ...new Set(touching.filter(({ from }) => !inside.has(from)).map(({ from }) => from)),
    ];
    const builtOnBy = [
      ...new Set(
        touching.filter(({ to }) => !inside.has(to) && !buildsOn.includes(to)).map(({ to }) => to),
      ),
    ];
    const shown = new Set([...members, ...buildsOn, ...builtOnBy]);
    const drawn = (edges: readonly GeneratedEdge[]): readonly GeneratedEdge[] =>
      edges.filter(
        ({ from, to }) => shown.has(from) && shown.has(to) && (inside.has(from) || inside.has(to)),
      );
    const left = buildsOn.length === 0 ? COLUMN : 2 * COLUMN;
    const placed = layeredPositions(members, dependencies);
    const right = left + Math.max(0, ...Object.values(placed).map(({ x }) => x)) + COLUMN;
    const graphId = (graph: string): string =>
      stableUuid(ADR_NAMESPACE, `graph:stream:${stream.slug}:${graph}`);

    return {
      id: stableUuid(ADR_NAMESPACE, `map:stream:${stream.slug}`),
      title: stream.title,
      graphs: [
        { id: graphId('refines'), title: 'Refines', color: REFINES_COLOR, edges: drawn(refines) },
        {
          id: graphId('story'),
          title: 'Story',
          color: STORY_COLOR,
          edges: chain([header.id, ...members]),
        },
        {
          id: graphId('supersedes'),
          title: 'Supersedes',
          color: SUPERSEDES_COLOR,
          edges: drawn(supersedes),
        },
      ],
      positions: {
        [header.id]: { x: 0, y: 0, open: false },
        ...column(buildsOn, COLUMN),
        ...shifted(placed, left, 0),
        ...column(builtOnBy, right),
      },
    };
  };

  return {
    identity,
    title: 'Architecture decisions',
    resources: [
      ...lanes.map(({ header }) => header),
      ...adrs.map((adr): GeneratedResource => ({
        kind: 'markdown',
        id: idOf(adr.number),
        slug: adr.slug,
        title: adr.title,
        body: adr.body,
      })),
    ],
    maps: [
      {
        id: identity.mapId,
        title: 'All decisions',
        graphs: [
          { id: identity.graphId, title: 'Refines', color: REFINES_COLOR, edges: refines },
          {
            id: stableUuid(ADR_NAMESPACE, `graph:${ADR_GRAPHS.supersedes}`),
            title: 'Supersedes',
            color: SUPERSEDES_COLOR,
            edges: supersedes,
          },
          {
            id: stableUuid(ADR_NAMESPACE, `graph:${ADR_GRAPHS.renames}`),
            title: 'Renames',
            color: '#c5b0d5',
            edges: renames,
          },
        ],
        positions: allDecisions(),
      },
      ...lanes.map(streamMap),
    ],
  };
};

const ISSUE_NAMESPACE = 'issues';
const ISSUE_GRAPHS = { critical: 'critical', other: 'other' } as const;

/**
 * Every open issue as a Space: one Resource per unsettled ticket, and two
 * Graphs of what blocks what.
 *
 * The issue files are the dependency source, as they are for `pnpm roadmap`:
 * an Edge runs from a blocker to the issue it blocks, so a source of the Graph
 * is work that can start now. Only *unmet* blockers are drawn — a settled
 * ticket is not remaining work and has no Resource here. `Critical paths` holds
 * every Edge on a longest chain of its component, and `Other blockers` the
 * rest, so the two together are the whole blocker graph.
 */
export const issueSpace = (scratchRoot: string): GeneratedSpace => {
  const open = buildRoadmap(scratchRoot).features.flatMap((feature) =>
    feature.issues
      .filter((issue) => !isSettled(issue.state))
      .map((issue) => ({
        issue,
        reference: `${feature.slug}/${issue.number ?? '--'}`,
        slug: `${feature.slug}-${basename(issue.path, '.md')}`,
      })),
  );
  open.sort((left, right) => compareOrdinal(left.issue.path, right.issue.path));
  // Every file claiming a number, not the first: a blocker naming a number two
  // tickets claim is ambiguous, and an Edge from each shows that on the canvas
  // instead of silently choosing one.
  const idsByReference = new Map<string, string[]>();
  for (const { issue, reference } of open) {
    const id = stableUuid(ISSUE_NAMESPACE, `issue:${issue.path}`);
    const claimed = idsByReference.get(reference);
    if (claimed === undefined) idsByReference.set(reference, [id]);
    else claimed.push(id);
  }
  const ids = open.map(({ issue }) => stableUuid(ISSUE_NAMESPACE, `issue:${issue.path}`));
  const blockers = distinctEdges(
    new Set(ids),
    open.flatMap(({ issue }) =>
      issue.unmetBlockers.flatMap((blocker) =>
        (idsByReference.get(blocker) ?? []).map((from) => ({
          from,
          to: stableUuid(ISSUE_NAMESPACE, `issue:${issue.path}`),
        })),
      ),
    ),
  );
  const critical = criticalEdgesOf(ids, blockers);
  const criticalKeys = new Set(critical.map(({ from, to }) => `${from}\u0000${to}`));
  const identity = identityOf(ISSUE_NAMESPACE, ISSUE_GRAPHS.critical);

  return {
    identity,
    title: 'Open issues',
    resources: open.map(({ issue, reference, slug }) => ({
      kind: 'markdown',
      id: stableUuid(ISSUE_NAMESPACE, `issue:${issue.path}`),
      slug,
      title: `${reference} — ${issue.title}`,
      body: readFileSync(join(scratchRoot, issue.path), 'utf8'),
    })),
    maps: [
      {
        id: identity.mapId,
        title: 'Remaining work',
        graphs: [
          { id: identity.graphId, title: 'Critical paths', color: '#d62728', edges: critical },
          {
            id: stableUuid(ISSUE_NAMESPACE, `graph:${ISSUE_GRAPHS.other}`),
            title: 'Other blockers',
            color: '#2ca02c',
            edges: blockers.filter(({ from, to }) => !criticalKeys.has(`${from}\u0000${to}`)),
          },
        ],
        positions: layeredPositions(ids, blockers),
      },
    ],
  };
};

const OVERVIEW_NAMESPACE = 'overview';

/**
 * The Meta Space: the other two, each reached through an Open Space Resource,
 * so the overview draws the ADR lineage and the remaining work side by side.
 * Its own Graph carries the one Edge worth traversing: the decisions, then the
 * work they leave.
 */
export const overviewSpace = (decisions: SpaceIdentity, issues: SpaceIdentity): GeneratedSpace => {
  const spaceResource = (
    namespace: string,
    slug: string,
    title: string,
    target: SpaceIdentity,
  ): GeneratedResource => ({
    kind: 'space',
    id: stableUuid(OVERVIEW_NAMESPACE, `resource:${namespace}`),
    slug,
    title,
    target,
  });
  const decisionsResource = spaceResource(
    ADR_NAMESPACE,
    'architecture-decisions',
    'Architecture decisions',
    decisions,
  );
  const issuesResource = spaceResource(ISSUE_NAMESPACE, 'open-issues', 'Open issues', issues);
  const identity = identityOf(OVERVIEW_NAMESPACE, 'overview');
  const open = (x: number): Placement => ({
    x,
    y: 0,
    open: true,
    openSize: SPACE_RESOURCE_OPEN_SIZE,
  });

  return {
    identity,
    title: 'Hyper',
    resources: [decisionsResource, issuesResource],
    maps: [
      {
        id: identity.mapId,
        title: 'Overview',
        graphs: [
          {
            id: identity.graphId,
            title: 'Decisions, then the work they leave',
            color: '#9467bd',
            edges: [{ from: decisionsResource.id, to: issuesResource.id }],
          },
        ],
        positions: {
          [decisionsResource.id]: open(0),
          [issuesResource.id]: open(SPACE_RESOURCE_OPEN_SIZE.width + 120),
        },
      },
    ],
  };
};

/**
 * Write the whole aggregate to `destination`, replacing whatever was there,
 * and answer the directory each Space was written to.
 */
export const writeKnowledgeAggregate = (
  repositoryRoot: string,
  scratchRoot: string,
  destination: string,
): readonly string[] => {
  const decisions = adrSpace(repositoryRoot);
  const issues = issueSpace(scratchRoot);
  const overview = overviewSpace(decisions.identity, issues.identity);

  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  writeFileSync(
    join(destination, 'hyper.json'),
    `${JSON.stringify({ version: AGGREGATE_VERSION, metaSpaceId: overview.identity.spaceId }, null, 2)}\n`,
  );
  return [overview, decisions, issues].map((space) => writeSpace(destination, space));
};

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  const repositoryRoot = process.cwd();
  const scratchRoot = join(repositoryRoot, '.scratch');
  if (!existsSync(join(repositoryRoot, 'docs', 'adr')) || !existsSync(scratchRoot)) {
    console.error(`Run from the repository root: no docs/adr or .scratch under ${repositoryRoot}`);
    process.exitCode = 1;
  } else {
    const destination = join(scratchRoot, 'spaces');
    for (const written of writeKnowledgeAggregate(repositoryRoot, scratchRoot, destination)) {
      console.log(written);
    }
  }
}
