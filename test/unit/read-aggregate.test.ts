import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  AGGREGATE_FILE_NAME,
  AggregateDirectoryError,
  mapSource,
  readAggregateFrom,
  scanAggregateFrom,
  type AggregateDirectoryContents,
  type AggregateSource,
} from '@project/aggregate';
import { uuidSchema, type UUID } from '@project/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  directorySource,
  readAggregate,
  scannedAggregateFiles,
} from '../../src/aggregate-directory';
import { markdownResourceFiles, resourceFiles } from '../support/aggregate-directory';
import { captureError } from '../support/capture-error';
import { admitted, pngBytes } from '../support/stored-images';

const META_SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const RESOURCE_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
/** A Space id spelled with hex letters, so upper-casing its name changes it. */
const LETTERED_SPACE_ID = uuidSchema.parse('abcdefab-cdef-4abc-8def-abcdefabcdef');

const countingIds = (): (() => UUID) => {
  let next = 0;
  return () => {
    next += 1;
    return uuidSchema.parse(`00000000-0000-4000-8000-${next.toString().padStart(12, '0')}`);
  };
};

const temporaryDirectories: string[] = [];

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-read-aggregate-'));
  temporaryDirectories.push(directory);
  return directory;
};

const writeAggregateFile = (root: string, metaSpaceId: UUID): Promise<void> =>
  writeFile(join(root, AGGREGATE_FILE_NAME), JSON.stringify({ version: 1, metaSpaceId }));

/**
 * Takes the space file's bytes rather than a document to serialize: several
 * cases below write a document the schema declines on purpose, and a parameter
 * typed loosely enough to express those is no contract at all.
 */
const writeSpace = async (
  root: string,
  directoryName: string,
  spaceFile: string,
): Promise<string> => {
  const directory = join(root, directoryName);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'space.json'), spaceFile);
  return directory;
};

/** Write a Space directory's `resources/`, by file name. */
const writeResources = async (
  directory: string,
  files: Readonly<Record<string, string>>,
): Promise<void> => {
  await mkdir(join(directory, 'resources'), { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(directory, 'resources', name), text);
  }
};

/** Every regular file under `root`, at any depth, by path relative to it with `/` between segments. */
const filesUnder = async (root: string): Promise<readonly string[]> =>
  (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));

/**
 * Every file under `root` with its bytes, whether Import reads it or not, so
 * the reader is the one deciding what to read from a `mapSource` over them.
 */
const allFilesUnder = async (root: string): Promise<ReadonlyMap<string, Uint8Array>> =>
  new Map(
    await Promise.all(
      (await filesUnder(root)).map(
        async (path) => [path, new Uint8Array(await readFile(join(root, path)))] as const,
      ),
    ),
  );

/**
 * The two sources an aggregate is read from here: the disk, and a map of its
 * files' bytes, the way Export reads back what it is about to write (ADR 0130).
 * Every case below runs through both, so they cannot come to disagree.
 */
const READERS: readonly {
  readonly name: string;
  readonly read: (root: string, newId: () => UUID) => Promise<AggregateDirectoryContents>;
}[] = [
  {
    name: 'readAggregateFrom a directorySource',
    read: (root, newId) => readAggregateFrom(directorySource(root), newId),
  },
  {
    name: 'readAggregateFrom a mapSource',
    read: async (root, newId) =>
      readAggregateFrom(mapSource(root, await allFilesUnder(root)), newId),
  },
];

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/** `source`, answering `reason` for each read of a path `unreadable` names. */
const withUnreadable = (
  source: AggregateSource,
  unreadable: ReadonlyMap<string, string>,
): AggregateSource => ({
  ...source,
  read: (path) => {
    const reason = unreadable.get(path);
    return reason === undefined ? source.read(path) : Promise.resolve({ ok: false, reason });
  },
});

/** `source`, recording each path it is asked to read, in the order the reads begin. */
const recordingReads = (source: AggregateSource) => {
  const reads: string[] = [];
  return {
    reads,
    source: {
      ...source,
      read: (path: string) => {
        reads.push(path);
        return source.read(path);
      },
    } satisfies AggregateSource,
  };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe.each(READERS)('$name', ({ read }) => {
  it('reads every immediate Space directory, taking each identity from its name', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(
      root,
      META_SPACE_ID,
      JSON.stringify({ version: 1, id: META_SPACE_ID, title: 'Meta' }),
    );
    await writeSpace(root, OTHER_SPACE_ID, JSON.stringify({ version: 1, title: 'Ordinary' }));

    const aggregate = await read(root, countingIds());

    expect(aggregate.metaSpaceId).toBe(META_SPACE_ID);
    // Ordinal order by directory name, which is the Space id — the same order
    // canonical export writes, so a round trip is stable.
    expect(aggregate.spaces.map(({ id }) => id)).toEqual([META_SPACE_ID, OTHER_SPACE_ID]);
    expect(aggregate.spaces.map(({ document }) => document.title)).toEqual(['Meta', 'Ordinary']);
  });

  /*
   * The likeliest way to arrive without one is by pointing the command at a
   * single Space directory, which is not what public import takes. The
   * message names the file so the answer is the next document read.
   */
  it('refuses a directory with no aggregate file, naming it', async () => {
    const root = await makeTemporaryDirectory();
    await writeSpace(
      root,
      META_SPACE_ID,
      JSON.stringify({ version: 1, id: META_SPACE_ID, title: 'Meta' }),
    );

    const thrown = await captureError(() => read(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('discovery');
    expect(thrown.diagnostics.join('\n')).toContain(AGGREGATE_FILE_NAME);
  });

  it('refuses an aggregate file that declares no Meta Space', async () => {
    const root = await makeTemporaryDirectory();
    await writeFile(join(root, AGGREGATE_FILE_NAME), JSON.stringify({ version: 1 }));

    const thrown = await captureError(() => read(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics.join('\n')).toContain('metaSpaceId');
  });

  it('refuses an aggregate file this build cannot read by version', async () => {
    const root = await makeTemporaryDirectory();
    await writeFile(
      join(root, AGGREGATE_FILE_NAME),
      JSON.stringify({ version: 2, metaSpaceId: META_SPACE_ID }),
    );

    const thrown = await captureError(() => read(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('parsing');
  });

  /*
   * A renamed Space directory would otherwise read back as a fresh Space on the
   * next round trip, silently duplicating everything in it.
   */
  it('refuses a Space directory whose name is not a UUID', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(
      root,
      'meta',
      JSON.stringify({ version: 1, id: META_SPACE_ID, title: 'Meta' }),
    );

    const thrown = await captureError(() => read(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics.join('\n')).toContain('named for its Space UUID');
  });

  /*
   * `z.string().uuid()` is case insensitive, and canonical export only ever
   * writes a Space's id in canonical lower case — so an upper-cased name is a
   * renamed directory like any other. Reading the id out of the name anyway
   * would store a Space whose UUID is spelled the way nothing else spells it,
   * and every reference to it elsewhere in the aggregate would miss.
   */
  it('refuses a Space directory whose name is its UUID in upper case', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, LETTERED_SPACE_ID);
    await writeSpace(
      root,
      LETTERED_SPACE_ID.toUpperCase(),
      JSON.stringify({ version: 1, title: 'Meta' }),
    );

    const thrown = await captureError(() => read(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics.join('\n')).toContain('named for its Space UUID');
  });

  it('refuses a space file that declares an identity its directory contradicts', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(
      root,
      META_SPACE_ID,
      JSON.stringify({ version: 1, id: OTHER_SPACE_ID, title: 'Confused' }),
    );

    const thrown = await captureError(() => read(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.diagnostics.join('\n')).toContain(OTHER_SPACE_ID);
    expect(thrown.diagnostics.join('\n')).toContain(META_SPACE_ID);
  });

  /*
   * Re-export preserves whatever else the destination carried, so a directory of
   * notes beside the Spaces has to survive a round trip rather than fail one.
   */
  it('ignores a child directory that holds no space file', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(
      root,
      META_SPACE_ID,
      JSON.stringify({ version: 1, id: META_SPACE_ID, title: 'Meta' }),
    );
    await mkdir(join(root, 'notes'));
    await writeFile(join(root, 'notes', 'README.md'), '# Notes\n');
    await writeFile(join(root, 'untouched.txt'), 'kept\n');

    const aggregate = await read(root, countingIds());

    expect(aggregate.spaces.map(({ id }) => id)).toEqual([META_SPACE_ID]);
  });

  it('does not descend past the immediate children', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(
      root,
      META_SPACE_ID,
      JSON.stringify({ version: 1, id: META_SPACE_ID, title: 'Meta' }),
    );
    await writeSpace(
      root,
      join('wrapper', OTHER_SPACE_ID),
      JSON.stringify({ version: 1, id: OTHER_SPACE_ID, title: 'Nested' }),
    );

    const aggregate = await read(root, countingIds());

    expect(aggregate.spaces.map(({ id }) => id)).toEqual([META_SPACE_ID]);
  });

  it("mints the Map and Graph ids a hand-authored Space leaves out, and keeps its Resources' own", async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    const directory = await writeSpace(
      root,
      META_SPACE_ID,
      JSON.stringify({
        version: 1,
        id: META_SPACE_ID,
        title: 'Hand authored',
        maps: [
          {
            title: 'Only',
            kind: 'positioned',
            positions: { [RESOURCE_ID]: { x: 0, y: 0 } },
            graphs: [{ title: 'Only', edges: [] }],
          },
        ],
      }),
    );
    await writeResources(directory, markdownResourceFiles(RESOURCE_ID, 'Opening', 'Hello.\n'));

    const aggregate = await read(root, countingIds());

    const [space] = aggregate.spaces;
    if (space === undefined) throw new Error('No Space was read');
    expect(space.resources.map(({ id }) => id)).toEqual([RESOURCE_ID]);
    expect(space.document.maps?.[0]?.id).toBe('00000000-0000-4000-8000-000000000001');
    expect(space.document.maps?.[0]?.graphs[0]?.id).toBe('00000000-0000-4000-8000-000000000002');
  });

  /*
   * A Resource's id is its file's name and its links' target, so a Resource
   * file that leaves it out is refused rather than given a minted one (ADR 0128).
   */
  it('refuses a Resource file that leaves out its id rather than minting one', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    const directory = await writeSpace(
      root,
      META_SPACE_ID,
      JSON.stringify({ version: 1, id: META_SPACE_ID, title: 'Hand authored' }),
    );
    await writeResources(directory, {
      [`${RESOURCE_ID}.json`]: JSON.stringify({ title: 'Opening', kind: 'ur', content: {} }),
    });

    const thrown = await captureError(() => read(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.diagnostics).toEqual([
      expect.stringContaining(join(directory, 'resources', `${RESOURCE_ID}.json`)),
    ]);
    expect(thrown.diagnostics[0]).toContain('id');
  });

  /*
   * Which Space draws which minted id is decided by the ordinal sort, not by
   * which `space.json` the filesystem returned first.
   *
   * Reading the Spaces concurrently is deliberate — one unreadable Space must
   * not hide the next one's problem — but minting inside that concurrency would
   * make the draw order an artifact of I/O completion: every call runs only as
   * far as its first `await`, and `newId` is consumed after it. So the same
   * directory handed the same generator twice could put `…0001` on either
   * Space's Map.
   *
   * The reader is asked twice over the same bytes with a fresh counter each
   * time: the two answers have to agree, which is what "from the bytes alone"
   * means. A single run cannot catch this — it passes whichever way the race
   * lands.
   */
  it('mints in ordinal directory order however the reads complete', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    // Maps with no `id`, so each Space draws from the generator. Identical
    // documents but for their ids, so nothing but order can distinguish them.
    for (const id of [OTHER_SPACE_ID, META_SPACE_ID]) {
      const directory = await writeSpace(
        root,
        id,
        JSON.stringify({
          version: 1,
          id,
          title: `Space ${id}`,
          maps: [
            {
              title: 'Only',
              kind: 'positioned',
              positions: {},
              graphs: [{ title: 'Only', edges: [] }],
            },
          ],
        }),
      );
      // The Space that sorts *first* is given the slower read, so completion
      // order and ordinal order disagree. Without that the two coincide and the
      // race never shows: equal-sized reads settle in submission order.
      if (id !== META_SPACE_ID) continue;
      // The files buy read latency without drawing from the generator, which
      // leaves the Map and its Graph as the only draws and the expectation below
      // readable.
      for (let index = 0; index < 40; index += 1) {
        const suffix = index.toString().padStart(12, '0');
        await writeResources(
          directory,
          markdownResourceFiles(
            uuidSchema.parse(`44444444-4444-4444-8444-${suffix}`),
            `Resource ${index}`,
            'Body.\n',
          ),
        );
      }
    }

    const first = await read(root, countingIds());
    const second = await read(root, countingIds());

    const mintedBySpace = (aggregate: Awaited<ReturnType<typeof read>>) =>
      aggregate.spaces.map(({ id, document }) => [id, document.maps?.[0]?.id]);
    expect(mintedBySpace(first)).toEqual(mintedBySpace(second));
    // And the ordinal order is the one it follows: META sorts before OTHER, so
    // it draws first whichever order the directories were written in. Each Space
    // draws twice — its Map, then the Graph that Map owns.
    expect(mintedBySpace(first)).toEqual([
      [META_SPACE_ID, '00000000-0000-4000-8000-000000000001'],
      [OTHER_SPACE_ID, '00000000-0000-4000-8000-000000000003'],
    ]);
  });

  it('reports every unreadable Space together rather than stopping at the first', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    const first = join(root, META_SPACE_ID);
    const second = join(root, OTHER_SPACE_ID);
    await mkdir(first);
    await mkdir(second);
    await writeFile(join(first, 'space.json'), '{ invalid first');
    await writeFile(join(second, 'space.json'), '{ invalid second');

    const thrown = await captureError(() => read(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.diagnostics.join('\n')).toContain(first);
    expect(thrown.diagnostics.join('\n')).toContain(second);
  });

  it('names an image directory holding a space.json once, as an image, never as a Space', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(root, META_SPACE_ID, JSON.stringify({ version: 1, title: 'Meta' }));
    await writeSpace(root, 'images', JSON.stringify({ version: 1, title: 'Not a Space' }));

    const thrown = await captureError(() => read(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.diagnostics).toHaveLength(1);
    expect(thrown.diagnostics[0]).toContain(join(root, 'images', 'space.json'));
    expect(thrown.diagnostics[0]).not.toContain('Space UUID');
  });

  /*
   * Reading identifies; it validates nothing about how the Spaces relate. Meta
   * rooting is `loadSpaceAggregate`'s, asked once over the whole collection by
   * the lifecycle operations — so a directory naming a Meta Space it does not
   * contain reads cleanly here and is refused there, in one place rather than
   * two vocabularies.
   */
  it('reads a directory whose declared Meta Space is absent, leaving that to intake', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(
      root,
      OTHER_SPACE_ID,
      JSON.stringify({ version: 1, id: OTHER_SPACE_ID, title: 'Only' }),
    );

    const aggregate = await read(root, countingIds());

    expect(aggregate.metaSpaceId).toBe(META_SPACE_ID);
    expect(aggregate.spaces.map(({ id }) => id)).toEqual([OTHER_SPACE_ID]);
  });

  /*
   * Only the failures this reader models are collected into one refusal. A
   * Space that failed for a reason it does not — here the identity generator
   * itself throwing, which is exactly how canonical export checks its files
   * before writing them — has to reach the caller, even when a neighbour has an ordinary
   * parse diagnostic that sorts ahead of it.
   */
  it('raises an unmodelled fault ahead of the parse diagnostic beside it', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(root, META_SPACE_ID, '{ invalid');
    // A Map with no id, so reading this Space draws from the generator.
    await writeSpace(
      root,
      OTHER_SPACE_ID,
      JSON.stringify({
        version: 1,
        title: 'Unidentified',
        maps: [
          {
            title: 'Only',
            kind: 'positioned',
            positions: {},
            graphs: [{ title: 'Only', edges: [] }],
          },
        ],
      }),
    );

    const thrown = await captureError(() =>
      read(root, () => {
        throw new Error('Canonical export wrote an entity with no id');
      }),
    );

    expect(thrown).not.toBeInstanceOf(AggregateDirectoryError);
    expect(thrown?.message).toBe('Canonical export wrote an entity with no id');
  });

  it('keeps a Space Resource reference exactly as authored', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    const meta = await writeSpace(
      root,
      META_SPACE_ID,
      JSON.stringify({
        version: 1,
        id: META_SPACE_ID,
        title: 'Meta',
      }),
    );
    await writeResources(
      meta,
      resourceFiles({
        id: RESOURCE_ID,
        title: 'Ordinary',
        kind: 'space',
        content: { spaceId: OTHER_SPACE_ID, map: META_SPACE_ID, graph: OTHER_SPACE_ID },
      }),
    );

    const aggregate = await read(root, countingIds());

    const resource = aggregate.spaces[0]?.resources[0];
    expect(resource?.id).toBe(RESOURCE_ID);
    expect(resource?.document).toMatchObject({
      kind: 'space',
      content: { spaceId: OTHER_SPACE_ID, map: META_SPACE_ID, graph: OTHER_SPACE_ID },
    });
  });

  it('admits each visible image file in images/, ignoring dotfiles and subdirectories', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(root, META_SPACE_ID, JSON.stringify({ version: 1, title: 'Meta' }));
    const image = await admitted(pngBytes(7));
    await mkdir(join(root, 'images', 'drafts'), { recursive: true });
    await writeFile(join(root, 'images', `${image.id}.png`), image.bytes);
    await writeFile(join(root, 'images', '.DS_Store'), 'not an image');
    await writeFile(join(root, 'images', 'drafts', 'notes.txt'), 'not an image');

    const aggregate = await read(root, countingIds());

    expect(aggregate.images).toEqual([image]);
  });

  it('refuses an image file not named for its content, naming it', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(root, META_SPACE_ID, JSON.stringify({ version: 1, title: 'Meta' }));
    await mkdir(join(root, 'images'));
    await writeFile(join(root, 'images', 'harbour.png'), pngBytes(7));

    const thrown = await captureError(() => read(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics).toEqual([
      expect.stringContaining(
        `${join(root, 'images', 'harbour.png')}: an image file must be named for its content`,
      ),
    ]);
  });
});

/**
 * A document refused outright is reported as that, ahead of a file beside it
 * that could not be read, and one Space's unreadable file does not hide another
 * Space's parse diagnostic: the refusal is decided from the space file alone.
 */
describe('a file that could not be read', () => {
  const refusedDocument = JSON.stringify({ version: 2, title: 'Pre-release talk' });

  it('is reported after the refusal of its Space, beside every other Space’s diagnostic', async () => {
    const thrown = await captureError(() =>
      readAggregateFrom(
        withUnreadable(
          mapSource(
            '/talk',
            new Map([
              [
                AGGREGATE_FILE_NAME,
                encode(JSON.stringify({ version: 1, metaSpaceId: META_SPACE_ID })),
              ],
              [`${META_SPACE_ID}/space.json`, encode(refusedDocument)],
              [`${META_SPACE_ID}/a.md`, encode('A body\n')],
              [`${OTHER_SPACE_ID}/space.json`, encode('{ invalid other')],
            ]),
          ),
          new Map([[`${META_SPACE_ID}/a.md`, 'EACCES: permission denied']]),
        ),
        countingIds(),
      ),
    );

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics).toHaveLength(2);
    expect(thrown.diagnostics[0]).toContain('version 2');
    expect(thrown.diagnostics[1]).toContain(`/talk/${OTHER_SPACE_ID}/space.json`);
  });

  it('is a discovery failure naming it when its Space reads otherwise', async () => {
    const thrown = await captureError(() =>
      readAggregateFrom(
        withUnreadable(
          mapSource(
            '/talk',
            new Map([
              [
                AGGREGATE_FILE_NAME,
                encode(JSON.stringify({ version: 1, metaSpaceId: META_SPACE_ID })),
              ],
              [
                `${META_SPACE_ID}/space.json`,
                encode(JSON.stringify({ version: 1, title: 'Meta' })),
              ],
              [`${META_SPACE_ID}/a.md`, encode('A body\n')],
            ]),
          ),
          new Map([[`${META_SPACE_ID}/a.md`, 'EACCES: permission denied']]),
        ),
        countingIds(),
      ),
    );

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('discovery');
    expect(thrown.diagnostics).toEqual([`/talk/${META_SPACE_ID}/a.md: EACCES: permission denied`]);
  });

  // Root ignores the mode bits and reads the file anyway, which would fail this
  // rather than exercise it.
  it.skipIf(process.getuid?.() === 0)('is reported the same way from disk', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    const meta = await writeSpace(root, META_SPACE_ID, refusedDocument);
    await writeSpace(root, OTHER_SPACE_ID, '{ invalid other');
    await writeFile(join(meta, 'a.md'), 'A body\n');
    await chmod(join(meta, 'a.md'), 0o000);

    const thrown = await captureError(() => readAggregate(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics).toHaveLength(2);
    expect(thrown.diagnostics[0]).toContain('version 2');
    expect(thrown.diagnostics[1]).toContain(join(root, OTHER_SPACE_ID, 'space.json'));
  });
});

/**
 * The files Importing reads, found by listing alone, for Export's ownership and
 * for a source that knows its paths before it has any bytes (ADR 0130).
 */
describe('scanAggregateFrom', () => {
  /** An Aggregate directory beside unrelated material, as a repository may hold it. */
  const MIXED_DIRECTORY = [
    'README.md',
    'package.json',
    AGGREGATE_FILE_NAME,
    `${META_SPACE_ID}/space.json`,
    `${META_SPACE_ID}/notes.md`,
    `${META_SPACE_ID}/assets.json`,
    `${META_SPACE_ID}/resources/${RESOURCE_ID}.json`,
    `${META_SPACE_ID}/resources/${RESOURCE_ID}.md`,
    `${META_SPACE_ID}/resources/picture.png`,
    `${META_SPACE_ID}/resources/drafts/old.json`,
    `${OTHER_SPACE_ID}/space.json`,
    'notes/README.md',
    'notes/resources/x.json',
    `sibling/${AGGREGATE_FILE_NAME}`,
    `sibling/${OTHER_SPACE_ID}/space.json`,
    'images/a.png',
    'images/.hidden.png',
    'images/drafts/b.png',
    'images/space.json',
  ];

  /** A source over `paths` with no bytes, which is all a listing needs. */
  const listed = (paths: readonly string[]): AggregateSource =>
    mapSource('/talk', new Map(paths.map((path) => [path, new Uint8Array()])));

  it("finds hyper.json, each Space directory's files and the visible images, in read order", async () => {
    expect(await scanAggregateFrom(listed([...MIXED_DIRECTORY].reverse()))).toEqual({
      files: [
        AGGREGATE_FILE_NAME,
        `${META_SPACE_ID}/space.json`,
        `${META_SPACE_ID}/notes.md`,
        `${META_SPACE_ID}/resources/${RESOURCE_ID}.json`,
        `${META_SPACE_ID}/resources/${RESOURCE_ID}.md`,
        `${OTHER_SPACE_ID}/space.json`,
        'images/a.png',
        'images/space.json',
      ],
      spaceDirectories: [META_SPACE_ID, OTHER_SPACE_ID],
    });
  });

  it('finds nothing of a Space directory without a space.json, and no hyper.json it lacks', async () => {
    expect(
      await scanAggregateFrom(
        listed([
          `${META_SPACE_ID}/notes.md`,
          `${META_SPACE_ID}/resources/${RESOURCE_ID}.json`,
          `sibling/${AGGREGATE_FILE_NAME}`,
        ]),
      ),
    ).toEqual({ files: [], spaceDirectories: [] });
  });

  it('reads images/ as images only, even when it holds a space.json', async () => {
    expect(
      await scanAggregateFrom(listed([AGGREGATE_FILE_NAME, 'images/space.json', 'images/a.png'])),
    ).toEqual({
      files: [AGGREGATE_FILE_NAME, 'images/a.png', 'images/space.json'],
      spaceDirectories: [],
    });
  });

  it('finds the same files on disk as over the same files in memory', async () => {
    const root = await makeTemporaryDirectory();
    for (const path of MIXED_DIRECTORY) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), '{}');
    }

    const onDisk = await scanAggregateFrom(directorySource(root));
    expect(await scanAggregateFrom(mapSource(root, await allFilesUnder(root)))).toEqual(onDisk);
    expect(await scannedAggregateFiles(root)).toEqual(onDisk.files);
  });

  it('finds nothing in a directory that does not exist', async () => {
    const root = await makeTemporaryDirectory();

    expect(await scanAggregateFrom(directorySource(join(root, 'absent')))).toEqual({
      files: [],
      spaceDirectories: [],
    });
  });
});

/**
 * The reader decides the order of reads and how many run at once, so a source
 * that records them shows both (ADR 0130).
 */
describe('reading from a source', () => {
  const aggregateText = JSON.stringify({ version: 1, metaSpaceId: META_SPACE_ID });
  const metaSpaceFile = JSON.stringify({ version: 1, title: 'Meta' });

  it('reads nothing past a malformed hyper.json', async () => {
    const { source, reads } = recordingReads(
      mapSource(
        '/talk',
        new Map([
          [AGGREGATE_FILE_NAME, encode('{ malformed')],
          [`${META_SPACE_ID}/space.json`, encode(metaSpaceFile)],
          ['images/a.png', pngBytes(7)],
        ]),
      ),
    );

    const thrown = await captureError(() => readAggregateFrom(source, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics).toEqual([expect.stringContaining(`/talk/${AGGREGATE_FILE_NAME}:`)]);
    expect(reads).toEqual([AGGREGATE_FILE_NAME]);
  });

  it('reads hyper.json first, then what the scan finds, in its order', async () => {
    const image = await admitted(pngBytes(7));
    const files = new Map<string, Uint8Array>([
      [AGGREGATE_FILE_NAME, encode(aggregateText)],
      [`${META_SPACE_ID}/space.json`, encode(metaSpaceFile)],
      ...Object.entries(markdownResourceFiles(RESOURCE_ID, 'Opening', 'Hello.\n')).map(
        ([name, text]): [string, Uint8Array] => [
          `${META_SPACE_ID}/resources/${name}`,
          encode(text),
        ],
      ),
      [`images/${image.id}.png`, image.bytes],
      ['README.md', encode('# Notes\n')],
    ]);
    const { source, reads } = recordingReads(mapSource('/talk', files));

    await readAggregateFrom(source, countingIds());

    expect(reads).toEqual([
      AGGREGATE_FILE_NAME,
      `${META_SPACE_ID}/space.json`,
      `${META_SPACE_ID}/resources/${RESOURCE_ID}.json`,
      `${META_SPACE_ID}/resources/${RESOURCE_ID}.md`,
      `images/${image.id}.png`,
    ]);
    expect(reads).toEqual((await scanAggregateFrom(mapSource('/talk', files))).files);
  });

  it('never has more reads in flight than the source allows', async () => {
    const resources = Array.from({ length: 10 }, (_, index) =>
      uuidSchema.parse(`44444444-4444-4444-8444-${index.toString().padStart(12, '0')}`),
    );
    const base = mapSource(
      '/talk',
      new Map([
        [AGGREGATE_FILE_NAME, encode(aggregateText)],
        [`${META_SPACE_ID}/space.json`, encode(metaSpaceFile)],
        ...resources.flatMap((id) =>
          Object.entries(markdownResourceFiles(id, 'Resource', 'Body.\n')).map(
            ([name, text]): [string, Uint8Array] => [
              `${META_SPACE_ID}/resources/${name}`,
              encode(text),
            ],
          ),
        ),
      ]),
    );
    let inFlight = 0;
    let most = 0;
    const source: AggregateSource = {
      ...base,
      concurrency: 3,
      read: async (path) => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        try {
          // Yield, so the reads the reader has begun overlap before this one ends.
          await Promise.resolve();
          return await base.read(path);
        } finally {
          inFlight -= 1;
        }
      },
    };

    const aggregate = await readAggregateFrom(source, countingIds());

    expect(aggregate.spaces[0]?.resources).toHaveLength(resources.length);
    expect(most).toBe(3);
  });

  it('stops at a directory that could not be listed, naming it', async () => {
    const base = mapSource(
      '/talk',
      new Map([
        [AGGREGATE_FILE_NAME, encode(aggregateText)],
        [`${META_SPACE_ID}/space.json`, encode(metaSpaceFile)],
      ]),
    );
    const source: AggregateSource = {
      ...base,
      list: (directory) =>
        directory === META_SPACE_ID
          ? Promise.resolve({ ok: false, reason: 'EACCES: permission denied' })
          : base.list(directory),
    };

    const thrown = await captureError(() => readAggregateFrom(source, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('discovery');
    expect(thrown.diagnostics).toEqual([`/talk/${META_SPACE_ID}: EACCES: permission denied`]);
  });
});

/*
 * A link is how an author shares one file between directories, so a file
 * entry that is a symbolic link to a regular file is read and owned like the
 * file it names, and a link that names nothing is not a file at all.
 */
describe('a file that is a symbolic link, on disk', () => {
  /** Write `text` to a file outside `root` and link `path` under `root` to it. */
  const linkTo = async (root: string, path: string, text: string): Promise<void> => {
    const target = join(await makeTemporaryDirectory(), 'target');
    await writeFile(target, text);
    await mkdir(join(root, path, '..'), { recursive: true });
    await symlink(target, join(root, path));
  };

  it('reads a Space whose space.json is a link to a regular file', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await linkTo(
      root,
      `${META_SPACE_ID}/space.json`,
      JSON.stringify({ version: 1, id: META_SPACE_ID, title: 'Linked' }),
    );

    const aggregate = await readAggregate(root, countingIds());

    expect(aggregate.spaces.map(({ document }) => document.title)).toEqual(['Linked']);
  });

  it('reads a Resource file that is a link to a regular file', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(root, META_SPACE_ID, JSON.stringify({ version: 1, title: 'Meta' }));
    for (const [name, text] of Object.entries(
      markdownResourceFiles(RESOURCE_ID, 'Opening', 'Hello.\n'),
    )) {
      await linkTo(root, `${META_SPACE_ID}/resources/${name}`, text);
    }

    const aggregate = await readAggregate(root, countingIds());

    expect(aggregate.spaces[0]?.resources.map(({ id }) => id)).toEqual([RESOURCE_ID]);
  });

  it('lists a linked hyper.json, space.json and Resource file as files Export owns', async () => {
    const root = await makeTemporaryDirectory();
    await linkTo(
      root,
      AGGREGATE_FILE_NAME,
      JSON.stringify({ version: 1, metaSpaceId: META_SPACE_ID }),
    );
    await linkTo(
      root,
      `${META_SPACE_ID}/space.json`,
      JSON.stringify({ version: 1, title: 'Meta' }),
    );
    for (const [name, text] of Object.entries(
      markdownResourceFiles(RESOURCE_ID, 'Opening', 'Hello.\n'),
    )) {
      await linkTo(root, `${META_SPACE_ID}/resources/${name}`, text);
    }

    expect(await scannedAggregateFiles(root)).toEqual([
      AGGREGATE_FILE_NAME,
      `${META_SPACE_ID}/space.json`,
      `${META_SPACE_ID}/resources/${RESOURCE_ID}.json`,
      `${META_SPACE_ID}/resources/${RESOURCE_ID}.md`,
    ]);
    expect((await readAggregate(root, countingIds())).metaSpaceId).toBe(META_SPACE_ID);
  });

  it('leaves a link in images/ to the author: neither admitted nor owned by Export', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(root, META_SPACE_ID, JSON.stringify({ version: 1, title: 'Meta' }));
    const image = await admitted(pngBytes(7));
    const target = join(await makeTemporaryDirectory(), 'picture.png');
    await writeFile(target, image.bytes);
    await mkdir(join(root, 'images'));
    await symlink(target, join(root, 'images', `${image.id}.png`));

    expect(await scannedAggregateFiles(root)).toEqual([
      AGGREGATE_FILE_NAME,
      `${META_SPACE_ID}/space.json`,
    ]);
    expect((await readAggregate(root, countingIds())).images).toEqual([]);
  });

  it('lists no dangling link, and no Space whose space.json is one', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await mkdir(join(root, META_SPACE_ID));
    await symlink(join(root, 'nowhere.json'), join(root, META_SPACE_ID, 'space.json'));

    expect(await scannedAggregateFiles(root)).toEqual([AGGREGATE_FILE_NAME]);
  });
});
