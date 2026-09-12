import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema, type UUID } from '@project/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGGREGATE_FILE_NAME,
  AggregateDirectoryError,
  readAggregate,
} from '../../src/aggregate-directory';
import { captureError } from '../support/capture-error';

const META_SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const THING_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('readAggregate', () => {
  it('reads every immediate Space directory, taking each identity from its name', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(
      root,
      META_SPACE_ID,
      JSON.stringify({ version: 1, id: META_SPACE_ID, title: 'Meta' }),
    );
    await writeSpace(root, OTHER_SPACE_ID, JSON.stringify({ version: 1, title: 'Ordinary' }));

    const aggregate = await readAggregate(root, countingIds());

    expect(aggregate.metaSpaceId).toBe(META_SPACE_ID);
    // Ordinal order by directory name, which is the Space id — the same order
    // canonical export writes, so a round trip is stable.
    expect(aggregate.spaces.map(({ id }) => id)).toEqual([META_SPACE_ID, OTHER_SPACE_ID]);
    expect(aggregate.spaces.map(({ document }) => document.title)).toEqual(['Meta', 'Ordinary']);
  });

  /*
   * The likeliest way to arrive without one is by pointing the command at a
   * single Space directory, which is no longer what public import takes. The
   * message names the file so the answer is the next thing read.
   */
  it('refuses a directory with no aggregate file, naming it', async () => {
    const root = await makeTemporaryDirectory();
    await writeSpace(
      root,
      META_SPACE_ID,
      JSON.stringify({ version: 1, id: META_SPACE_ID, title: 'Meta' }),
    );

    const thrown = await captureError(() => readAggregate(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('discovery');
    expect(thrown.diagnostics.join('\n')).toContain(AGGREGATE_FILE_NAME);
  });

  it('refuses an aggregate file that declares no Meta Space', async () => {
    const root = await makeTemporaryDirectory();
    await writeFile(join(root, AGGREGATE_FILE_NAME), JSON.stringify({ version: 1 }));

    const thrown = await captureError(() => readAggregate(root, countingIds()));

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

    const thrown = await captureError(() => readAggregate(root, countingIds()));

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

    const thrown = await captureError(() => readAggregate(root, countingIds()));

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

    const thrown = await captureError(() => readAggregate(root, countingIds()));

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

    const thrown = await captureError(() => readAggregate(root, countingIds()));

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

    const aggregate = await readAggregate(root, countingIds());

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

    const aggregate = await readAggregate(root, countingIds());

    expect(aggregate.spaces.map(({ id }) => id)).toEqual([META_SPACE_ID]);
  });

  it('mints the nested ids a hand-authored Space leaves out', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    const directory = await writeSpace(
      root,
      META_SPACE_ID,
      JSON.stringify({
        version: 1,
        id: META_SPACE_ID,
        title: 'Hand authored',
      }),
    );
    await mkdir(join(directory, 'things'));
    await writeFile(join(directory, 'things', 'opening.md'), '---\ntitle: Opening\n---\nHello.\n');

    const aggregate = await readAggregate(root, countingIds());

    const [space] = aggregate.spaces;
    if (space === undefined) throw new Error('No Space was read');
    expect(space.things).toHaveLength(1);
    expect(uuidSchema.safeParse(space.things[0]?.id).success).toBe(true);
  });

  /*
   * Which Space draws which minted id is decided by the ordinal sort, not by
   * which `space.json` the filesystem returned first.
   *
   * Reading the Spaces concurrently is deliberate — one unreadable Space must
   * not hide the next one's problem — but minting inside that concurrency made
   * the draw order an artifact of I/O completion: every call runs only as far as
   * its first `await`, and `newId` is consumed after it. So the same directory
   * handed the same generator twice could put `…0001` on either Space's Diagram.
   *
   * `readAggregate` is asked twice over the same bytes with a fresh counter each
   * time: the two answers have to agree, which is what "from the bytes alone"
   * means. A single run cannot catch this — it passes whichever way the race
   * lands.
   */
  it('mints in ordinal directory order however the reads complete', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    // Diagrams with no `id`, so each Space draws from the generator. Identical
    // documents but for their ids, so nothing but order can distinguish them.
    for (const id of [OTHER_SPACE_ID, META_SPACE_ID]) {
      const directory = await writeSpace(
        root,
        id,
        JSON.stringify({
          version: 1,
          id,
          title: `Space ${id}`,
          diagrams: [
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
      await mkdir(join(directory, 'things'));
      for (let index = 0; index < 40; index += 1) {
        const suffix = index.toString().padStart(12, '0');
        // Each Thing carries its own id, so the files buy read latency without
        // drawing from the generator — which leaves the Diagram and its Graph as
        // the only draws and the expectation below readable.
        await writeFile(
          join(directory, 'things', `thing-${suffix}.md`),
          `---\nid: 44444444-4444-4444-8444-${suffix}\ntitle: Thing ${index}\n---\nBody.\n`,
        );
      }
    }

    const first = await readAggregate(root, countingIds());
    const second = await readAggregate(root, countingIds());

    const mintedBySpace = (aggregate: Awaited<ReturnType<typeof readAggregate>>) =>
      aggregate.spaces.map(({ id, document }) => [id, document.diagrams?.[0]?.id]);
    expect(mintedBySpace(first)).toEqual(mintedBySpace(second));
    // And the ordinal order is the one it follows: META sorts before OTHER, so
    // it draws first whichever order the directories were written in. Each Space
    // draws twice — its Diagram, then the Graph that Diagram owns.
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

    const thrown = await captureError(() => readAggregate(root, countingIds()));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.diagnostics.join('\n')).toContain(first);
    expect(thrown.diagnostics.join('\n')).toContain(second);
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

    const aggregate = await readAggregate(root, countingIds());

    expect(aggregate.metaSpaceId).toBe(META_SPACE_ID);
    expect(aggregate.spaces.map(({ id }) => id)).toEqual([OTHER_SPACE_ID]);
  });

  /*
   * Only the failures this reader models are collected into one refusal. A
   * Space that failed for a reason it does not — here the identity generator
   * itself throwing, which is exactly how canonical export verifies a staged
   * aggregate — has to reach the caller, even when a neighbour has an ordinary
   * parse diagnostic that sorts ahead of it.
   */
  it('raises an unmodelled fault ahead of the parse diagnostic beside it', async () => {
    const root = await makeTemporaryDirectory();
    await writeAggregateFile(root, META_SPACE_ID);
    await writeSpace(root, META_SPACE_ID, '{ invalid');
    const unidentified = await writeSpace(
      root,
      OTHER_SPACE_ID,
      JSON.stringify({ version: 1, title: 'Unidentified' }),
    );
    await mkdir(join(unidentified, 'things'));
    await writeFile(
      join(unidentified, 'things', 'opening.md'),
      '---\ntitle: Opening\n---\nHello.\n',
    );

    const thrown = await captureError(() =>
      readAggregate(root, () => {
        throw new Error('Canonical export wrote an entity with no id');
      }),
    );

    expect(thrown).not.toBeInstanceOf(AggregateDirectoryError);
    expect(thrown?.message).toBe('Canonical export wrote an entity with no id');
  });

  it('keeps a Space Thing reference exactly as authored', async () => {
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
    await mkdir(join(meta, 'things'));
    await writeFile(
      join(meta, 'things', `${THING_ID}.md`),
      `---\nid: ${THING_ID}\ntitle: Ordinary\nkind: space\nspaceId: ${OTHER_SPACE_ID}\ndiagram: ${META_SPACE_ID}\ngraph: ${OTHER_SPACE_ID}\n---\n`,
    );

    const aggregate = await readAggregate(root, countingIds());

    const thing = aggregate.spaces[0]?.things[0];
    expect(thing?.id).toBe(THING_ID);
    expect(thing?.document).toMatchObject({
      kind: 'space',
      spaceId: OTHER_SPACE_ID,
      diagram: META_SPACE_ID,
      graph: OTHER_SPACE_ID,
    });
  });
});
