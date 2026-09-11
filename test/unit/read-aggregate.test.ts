import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema, type UUID } from '@project/core';
import { afterEach, describe, expect, it } from 'vitest';
import { AGGREGATE_FILE_NAME, readAggregate } from '../../src/import/read-aggregate';
import { SpaceImportFileError } from '../../src/import/read-single-space';
import { captureError } from '../support/capture-error';

const META_SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const THING_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');

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

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
    expect(thrown.kind).toBe('discovery');
    expect(thrown.diagnostics.join('\n')).toContain(AGGREGATE_FILE_NAME);
  });

  it('refuses an aggregate file that declares no Meta Space', async () => {
    const root = await makeTemporaryDirectory();
    await writeFile(join(root, AGGREGATE_FILE_NAME), JSON.stringify({ version: 1 }));

    const thrown = await captureError(() => readAggregate(root, countingIds()));

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
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

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
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

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
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

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
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

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
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
