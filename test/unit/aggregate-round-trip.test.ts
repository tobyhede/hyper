import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newUuid, spaceFileSchema, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { createWorkingSpaceLoader, type LoadedSpace } from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { exportAggregate } from '../../src/export/export-aggregate';
import { importAggregate } from '../../src/import/import-aggregate';
import { AGGREGATE_FILE_NAME } from '../../src/aggregate-directory';
import { MemorySpaceRepository } from '../support/memory-space-repository';

const META_SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const TARGET_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const SECOND_TARGET_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const META_MAP_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const META_GRAPH_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const TARGET_MAP_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const TARGET_GRAPH_ID = uuidSchema.parse('77777777-7777-4777-8777-777777777777');
const SECOND_MAP_ID = uuidSchema.parse('88888888-8888-4888-8888-888888888888');
const SECOND_GRAPH_ID = uuidSchema.parse('99999999-9999-4999-8999-999999999999');
const FIRST_LINK_ID = uuidSchema.parse('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const SECOND_LINK_ID = uuidSchema.parse('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
const CONVERGING_LINK_ID = uuidSchema.parse('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
const MARKDOWN_RESOURCE_ID = uuidSchema.parse('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
const TARGET_RESOURCE_ID = uuidSchema.parse('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
const SECOND_RESOURCE_ID = uuidSchema.parse('ffffffff-ffff-4fff-8fff-ffffffffffff');

const temporaryDirectories: string[] = [];

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-round-trip-'));
  temporaryDirectories.push(directory);
  return directory;
};

const stored = (snapshot: SpaceSnapshot): LoadedSpace => ({
  snapshot,
  revision: 0n,
  exportedRevision: null,
});

/**
 * A target Space: one Resource on one Map, with one Graph the Space Resources
 * pointing here can select.
 */
const targetSpace = (
  id: UUID,
  title: string,
  mapId: UUID,
  graphId: UUID,
  resourceId: UUID,
): SpaceSnapshot => ({
  id,
  document: {
    version: 1,
    title,
    maps: [
      {
        id: mapId,
        title: 'Map 1',
        kind: 'positioned',
        positions: { [resourceId]: { x: 0, y: 0, open: false } },
        graphs: [{ id: graphId, title: 'Graph 1', edges: [] }],
        activeGraph: graphId,
      },
    ],
    defaultMap: mapId,
  },
  resources: [
    { id: resourceId, document: { title: `${title} resource`, kind: 'markdown', body: 'Body.' } },
  ],
});

/**
 * Meta, holding a Markdown Resource and three Space Resources — two of which
 * **converge** on the same target, which is legal (ADR 0078) and the case a
 * round trip is most likely to get wrong by deduplicating.
 */
const metaSpace = (): SpaceSnapshot => ({
  id: META_SPACE_ID,
  document: {
    version: 1,
    title: 'Meta',
    maps: [
      {
        id: META_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [MARKDOWN_RESOURCE_ID]: { x: 0, y: 0, open: false },
          [FIRST_LINK_ID]: { x: 340, y: 0, open: false },
          [SECOND_LINK_ID]: { x: 680, y: 0, open: true, openSize: { width: 480, height: 270 } },
          [CONVERGING_LINK_ID]: { x: 1020, y: 0, open: false },
        },
        graphs: [
          {
            id: META_GRAPH_ID,
            title: 'Graph 1',
            color: '#1f77b4',
            edges: [{ from: MARKDOWN_RESOURCE_ID, to: FIRST_LINK_ID }],
          },
        ],
        activeGraph: META_GRAPH_ID,
      },
    ],
    defaultMap: META_MAP_ID,
  },
  resources: [
    {
      id: MARKDOWN_RESOURCE_ID,
      document: { title: 'Opening', kind: 'markdown', body: '# Opening\n\nHello.\n' },
    },
    {
      id: FIRST_LINK_ID,
      document: {
        title: 'To target',
        kind: 'space',
        spaceId: TARGET_SPACE_ID,
        map: TARGET_MAP_ID,
        graph: TARGET_GRAPH_ID,
      },
    },
    {
      id: CONVERGING_LINK_ID,
      document: {
        title: 'To target again',
        kind: 'space',
        spaceId: TARGET_SPACE_ID,
        map: TARGET_MAP_ID,
        graph: TARGET_GRAPH_ID,
      },
    },
    {
      id: SECOND_LINK_ID,
      document: {
        title: 'To second',
        kind: 'space',
        spaceId: SECOND_TARGET_ID,
        map: SECOND_MAP_ID,
        graph: SECOND_GRAPH_ID,
      },
    },
  ],
});

const completeAggregate = (): readonly SpaceSnapshot[] => [
  metaSpace(),
  targetSpace(TARGET_SPACE_ID, 'Target', TARGET_MAP_ID, TARGET_GRAPH_ID, TARGET_RESOURCE_ID),
  targetSpace(SECOND_TARGET_ID, 'Second', SECOND_MAP_ID, SECOND_GRAPH_ID, SECOND_RESOURCE_ID),
];

const repositoryHolding = (snapshots: readonly SpaceSnapshot[]): MemorySpaceRepository =>
  new MemorySpaceRepository(snapshots.map(stored), META_SPACE_ID);

const exportTo = async (repository: MemorySpaceRepository, destination: string): Promise<void> => {
  const result = await exportAggregate(repository, destination);
  if (result.kind !== 'exported') throw new Error(`Export answered ${result.kind}`);
};

const importFrom = async (destination: string): Promise<MemorySpaceRepository> => {
  const target = new MemorySpaceRepository();
  const result = await importAggregate(destination, target, { truncate: false, newId: newUuid });
  if (result.kind !== 'imported') {
    throw new Error(
      result.kind === 'aggregate-refused'
        ? result.errors.map(({ kind }) => kind).join(', ')
        : `Import answered ${result.kind}`,
    );
  }
  return target;
};

const storedSnapshots = async (
  repository: MemorySpaceRepository,
): Promise<readonly SpaceSnapshot[]> => {
  const loaded = await repository.loadAggregate();
  if (loaded.kind !== 'loaded') throw new Error('The repository is not initialized');
  return loaded.aggregate.spaces.map(({ snapshot }) => snapshot);
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('exporting and importing one complete aggregate', () => {
  it('returns the same authored aggregate through normal intake', async () => {
    const destination = join(await makeTemporaryDirectory(), 'aggregate');
    const source = repositoryHolding(completeAggregate());

    await exportTo(source, destination);
    const reimported = await importFrom(destination);

    expect(await storedSnapshots(reimported)).toEqual(await storedSnapshots(source));
    const loaded = await reimported.loadAggregate();
    expect(loaded.kind === 'loaded' && loaded.aggregate.metaSpaceId).toBe(META_SPACE_ID);
  });

  it('writes a versioned aggregate file naming the Meta Space, and one directory per Space', async () => {
    const destination = join(await makeTemporaryDirectory(), 'aggregate');

    await exportTo(repositoryHolding(completeAggregate()), destination);

    expect(JSON.parse(await readFile(join(destination, AGGREGATE_FILE_NAME), 'utf8'))).toEqual({
      version: 1,
      metaSpaceId: META_SPACE_ID,
    });
    const entries = await readdir(destination, { withFileTypes: true });
    expect(
      entries
        .filter((entry) => entry.isDirectory())
        .map(({ name }) => name)
        .sort(),
    ).toEqual([META_SPACE_ID, TARGET_SPACE_ID, SECOND_TARGET_ID].sort());
    // A Resource is named by its own id, never by its title (ADR 0020).
    expect(await readdir(join(destination, TARGET_SPACE_ID, 'resources'))).toEqual([
      `${TARGET_RESOURCE_ID}.md`,
    ]);
  });

  /*
   * Two Space Resources naming one target. Deduplicating them on the way to disk or
   * back would lose one authored Resource while leaving a valid-looking aggregate,
   * which is exactly the failure a whole-aggregate equality check above might
   * not localize — so it is asserted here by name.
   */
  it('keeps both Space Resources that converge on one target', async () => {
    const destination = join(await makeTemporaryDirectory(), 'aggregate');

    await exportTo(repositoryHolding(completeAggregate()), destination);
    const reimported = await importFrom(destination);

    const meta = (await storedSnapshots(reimported)).find(({ id }) => id === META_SPACE_ID);
    const converging = meta?.resources.filter(
      (resource) =>
        resource.document.kind === 'space' && resource.document.spaceId === TARGET_SPACE_ID,
    );
    expect(converging?.map(({ id }) => id).sort()).toEqual(
      [FIRST_LINK_ID, CONVERGING_LINK_ID].sort(),
    );
  });

  it('preserves every selected Map and Graph on a Space Resource', async () => {
    const destination = join(await makeTemporaryDirectory(), 'aggregate');

    await exportTo(repositoryHolding(completeAggregate()), destination);
    const reimported = await importFrom(destination);

    const meta = (await storedSnapshots(reimported)).find(({ id }) => id === META_SPACE_ID);
    expect(meta?.resources.find(({ id }) => id === SECOND_LINK_ID)?.document).toEqual({
      title: 'To second',
      kind: 'space',
      spaceId: SECOND_TARGET_ID,
      map: SECOND_MAP_ID,
      graph: SECOND_GRAPH_ID,
    });
    expect(meta?.document.defaultMap).toBe(META_MAP_ID);
    expect(meta?.document.maps?.[0]?.activeGraph).toBe(META_GRAPH_ID);
  });

  it('re-exports over its own output without changing a byte', async () => {
    const destination = join(await makeTemporaryDirectory(), 'aggregate');
    const source = repositoryHolding(completeAggregate());

    await exportTo(source, destination);
    const first = await readFile(join(destination, META_SPACE_ID, 'space.json'), 'utf8');
    const aggregateFile = await readFile(join(destination, AGGREGATE_FILE_NAME), 'utf8');
    await exportTo(source, destination);

    expect(await readFile(join(destination, META_SPACE_ID, 'space.json'), 'utf8')).toBe(first);
    expect(await readFile(join(destination, AGGREGATE_FILE_NAME), 'utf8')).toBe(aggregateFile);
  });
});

describe('a mapless Space', () => {
  /** A Space before its first working load: titled, holding a Resource, no Map. */
  const mapless: SpaceSnapshot = {
    id: META_SPACE_ID,
    document: { version: 1, title: 'Not yet opened' },
    resources: [
      {
        id: MARKDOWN_RESOURCE_ID,
        document: { title: 'Opening', kind: 'markdown', body: 'Hello.\n' },
      },
    ],
  };

  /*
   * A Space with no Map is initialized on its first complete working-state
   * read, and by nothing else — not by listing, import completion or export
   * (ADR 0079). So the state survives a round trip rather than being repaired by
   * one, and import never rewrites the source it read.
   */
  it('round-trips unchanged, initialized by neither export nor import', async () => {
    const destination = join(await makeTemporaryDirectory(), 'aggregate');

    await exportTo(repositoryHolding([mapless]), destination);
    const exported = spaceFileSchema.parse(
      JSON.parse(await readFile(join(destination, META_SPACE_ID, 'space.json'), 'utf8')),
    );
    const reimported = await importFrom(destination);

    expect(exported).toEqual({ version: 1, id: META_SPACE_ID, title: 'Not yet opened' });
    expect(await storedSnapshots(reimported)).toEqual([mapless]);
  });

  /*
   * The initialization is performed rather than assumed. Handing this a Space
   * built already holding a Map proved only that export writes one — the
   * assertion passed without `loadWorkingSpace` being involved at all, so a
   * first working load that stopped durably initializing would not have shown
   * up here.
   *
   * So the Space goes in mapless, `createWorkingSpaceLoader` is what gives it
   * a Map and Graph, and the ids asserted are the ones that load minted.
   */
  it('exports the Map and Graph a later initialization gave it', async () => {
    const destination = join(await makeTemporaryDirectory(), 'aggregate');
    const repository = repositoryHolding([mapless]);

    const initialized = await createWorkingSpaceLoader(repository, newUuid)(META_SPACE_ID);
    const map = initialized?.snapshot.document.maps?.[0];
    if (map === undefined) throw new Error('The working load initialized no Map');
    await exportTo(repository, destination);

    const exported = spaceFileSchema.parse(
      JSON.parse(await readFile(join(destination, META_SPACE_ID, 'space.json'), 'utf8')),
    );
    expect(exported.defaultMap).toBe(map.id);
    expect(exported.maps?.[0]?.id).toBe(map.id);
    expect(exported.maps?.[0]?.graphs[0]?.id).toBe(map.graphs[0]?.id);
    // The Map initialization authors is *empty* (ADR 0079) — it does not
    // adopt the Resources the Space already held — and export writes that as it is
    // rather than placing them for it.
    expect(exported.maps?.[0]?.positions).toEqual({});
    expect(await storedSnapshots(repository).then((spaces) => spaces[0]?.resources)).toEqual(
      mapless.resources,
    );
  });
});

describe('re-exporting over an earlier export', () => {
  it('removes the directory of a Space the aggregate no longer holds', async () => {
    const destination = join(await makeTemporaryDirectory(), 'aggregate');
    const complete = completeAggregate();

    await exportTo(repositoryHolding(complete), destination);
    expect(await readdir(join(destination, SECOND_TARGET_ID))).not.toEqual([]);

    // Meta keeps only the Resource pointing at the surviving target, or the
    // aggregate it names would no longer be complete.
    const withoutSecond = complete
      .filter(({ id }) => id !== SECOND_TARGET_ID)
      .map((snapshot) =>
        snapshot.id === META_SPACE_ID
          ? {
              ...snapshot,
              document: {
                ...snapshot.document,
                maps: snapshot.document.maps?.map((map) => ({
                  ...map,
                  positions: Object.fromEntries(
                    Object.entries(map.positions).filter(([id]) => id !== SECOND_LINK_ID),
                  ),
                })),
              },
              resources: snapshot.resources.filter(({ id }) => id !== SECOND_LINK_ID),
            }
          : snapshot,
      );
    await exportTo(repositoryHolding(withoutSecond), destination);

    const entries = await readdir(destination, { withFileTypes: true });
    expect(
      entries
        .filter((entry) => entry.isDirectory())
        .map(({ name }) => name)
        .sort(),
    ).toEqual([META_SPACE_ID, TARGET_SPACE_ID].sort());
    expect(await importFrom(destination).then(storedSnapshots)).toHaveLength(2);
  });

  /*
   * The format reads a root aggregate file and `<space-uuid>/` children, and
   * inside a Space directory it reads `space.json`, `*.md` and `resources/*.md`.
   * Everything else is the author's — notes, assets — and re-export has to carry
   * it across rather than tidy it away.
   *
   * A `README.md` inside a Space directory is **not** one of those, and the
   * comments here and on `writeSpaceDirectory` used to offer it as the example of
   * what survives. It does not and must not: root `*.md` is what the reader scans
   * for Resource files, so a README left there imports as a Resource or refuses the
   * import for carrying no frontmatter. Asserted alongside, so the boundary is
   * the tested one rather than the plausible one.
   */
  it('preserves root files it ignores and undiscovered contents of a Space it keeps', async () => {
    const destination = join(await makeTemporaryDirectory(), 'aggregate');
    const source = repositoryHolding(completeAggregate());

    await exportTo(source, destination);
    await writeFile(join(destination, 'notes.txt'), 'root note\n');
    await writeFile(join(destination, META_SPACE_ID, 'assets.json'), '{"kept":true}\n');
    await writeFile(join(destination, META_SPACE_ID, 'README.md'), '# Notes\n');
    await exportTo(source, destination);

    expect(await readFile(join(destination, 'notes.txt'), 'utf8')).toBe('root note\n');
    expect(await readFile(join(destination, META_SPACE_ID, 'assets.json'), 'utf8')).toBe(
      '{"kept":true}\n',
    );
    expect(await readdir(join(destination, META_SPACE_ID))).not.toContain('README.md');
  });

  it('removes the file of a Resource the Space no longer holds', async () => {
    const destination = join(await makeTemporaryDirectory(), 'aggregate');
    const complete = completeAggregate();

    await exportTo(repositoryHolding(complete), destination);
    const withoutMarkdown = complete.map((snapshot) =>
      snapshot.id === META_SPACE_ID
        ? {
            ...snapshot,
            document: {
              ...snapshot.document,
              maps: snapshot.document.maps?.map((map) => ({
                ...map,
                positions: Object.fromEntries(
                  Object.entries(map.positions).filter(([id]) => id !== MARKDOWN_RESOURCE_ID),
                ),
                graphs: map.graphs.map((graph) => ({ ...graph, edges: [] })),
              })),
            },
            resources: snapshot.resources.filter(({ id }) => id !== MARKDOWN_RESOURCE_ID),
          }
        : snapshot,
    );
    await exportTo(repositoryHolding(withoutMarkdown), destination);

    expect(await readdir(join(destination, META_SPACE_ID, 'resources'))).not.toContain(
      `${MARKDOWN_RESOURCE_ID}.md`,
    );
  });
});

describe('recording what was exported', () => {
  it('records the revision of every Space, after the destination is replaced', async () => {
    const destination = join(await makeTemporaryDirectory(), 'aggregate');
    const source = new MemorySpaceRepository(
      completeAggregate().map((snapshot) => ({
        snapshot,
        revision: 7n,
        exportedRevision: null,
      })),
      META_SPACE_ID,
    );

    await exportTo(source, destination);

    const loaded = await source.loadAggregate();
    if (loaded.kind !== 'loaded') throw new Error('The repository is not initialized');
    expect(loaded.aggregate.spaces.map(({ exportedRevision }) => exportedRevision)).toEqual([
      7n,
      7n,
      7n,
    ]);
  });
});
