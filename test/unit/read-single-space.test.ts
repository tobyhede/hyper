import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { loadSpace } from '@project/graph';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SpaceImportFileError,
  readImportBatch,
  readSingleSpace,
} from '../../src/import/read-single-space';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const ROOT_CARD_ID = '00000000-0000-4000-8000-000000000002';
const GRAPH_ID = '00000000-0000-4000-8000-000000000003';
const LAYOUT_ID = '00000000-0000-4000-8000-000000000004';

/**
 * The disposable pre-release shape: graphs declared beside the layouts rather
 * than owned by them (ADR 0040). Under version 1 each of its layouts is missing
 * the graphs it now owns and carries a key the schema does not recognise, so a
 * shape check reached on its own answers a cascade in which nothing says which
 * version arrived.
 */
const versionTwoDocument = {
  version: 2,
  id: SPACE_ID,
  title: 'Pre-release talk',
  graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
  layouts: [{ id: LAYOUT_ID, title: 'Working', positions: {} }],
};

/**
 * A version 1 document carrying the retired space-level `graphs` — hand-edited,
 * or written by a stale producer, so it holds both shapes at once. Its version
 * is current, so nothing answers it before the key itself does.
 */
const retiredGraphsDocument = {
  version: 1,
  id: SPACE_ID,
  title: 'Talk',
  graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
};

const temporaryDirectories: string[] = [];

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-single-space-'));
  temporaryDirectories.push(directory);
  return directory;
};

const captureError = async <T>(operation: () => Promise<T>): Promise<Error | undefined> => {
  try {
    await operation();
    return undefined;
  } catch (error) {
    // Every path under test throws one of this module's own Error subclasses;
    // a non-Error throw would be a bug in the code under test, not something
    // to paper over by wrapping it into a generic Error that loses its shape.
    if (error instanceof Error) return error;
    throw error;
  }
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('readSingleSpace', () => {
  it('reads a space-file or directory input with globally sorted, non-recursive cards', async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const talkDirectory = join(temporaryDirectory, 'talk');
    const cardsDirectory = join(talkDirectory, 'cards');
    await mkdir(join(cardsDirectory, 'nested'), { recursive: true });
    await mkdir(join(talkDirectory, 'notes'));

    const spaceFile = join(talkDirectory, 'space.json');
    await writeFile(spaceFile, JSON.stringify({ version: 1, id: SPACE_ID, title: 'Talk' }));
    await writeFile(join(talkDirectory, 'a.md'), '---\ntitle: A\n---\nA body\n');
    await writeFile(
      join(cardsDirectory, 'detail.md'),
      '---\ntitle: Detail\nkind: markdown\n---\nDetail body\n',
    );
    await writeFile(join(cardsDirectory, 'z.md'), '---\ntitle: Z\n---\nZ body\n');
    await writeFile(
      join(talkDirectory, 'root.md'),
      `---\nid: ${ROOT_CARD_ID}\ntitle: Root\n---\nRoot body\n`,
    );
    await writeFile(join(cardsDirectory, 'nested', 'ignored.md'), 'not a discovered card');
    await writeFile(join(talkDirectory, 'notes', 'ignored.md'), 'not a discovered card');

    const expected = {
      id: SPACE_ID,
      document: { version: 1, title: 'Talk' },
      cards: [
        { document: { title: 'A', kind: 'markdown', body: 'A body\n' } },
        { document: { title: 'Detail', kind: 'markdown', body: 'Detail body\n' } },
        { document: { title: 'Z', kind: 'markdown', body: 'Z body\n' } },
        {
          id: ROOT_CARD_ID,
          document: { title: 'Root', kind: 'markdown', body: 'Root body\n' },
        },
      ],
    };

    await expect(readSingleSpace(talkDirectory)).resolves.toEqual(expected);
    await expect(readSingleSpace(spaceFile)).resolves.toEqual(expected);
  });

  // Unreadable-mode is the only way to fail a *discovered* card file's read:
  // `markdownFilesIn` keeps `entry.isFile()` entries only, so a directory or a
  // symlink named `x.md` is filtered out before any read and never produces the
  // EISDIR/ELOOP a uid-independent version would need. Root ignores the mode bits
  // and reads the files anyway, which would fail these assertions rather than
  // exercise them, so the case is skipped there instead of reported as a defect.
  it.skipIf(process.getuid?.() === 0)(
    'settles every file read and reports failures in deterministic path order',
    async () => {
      const temporaryDirectory = await makeTemporaryDirectory();
      const talkDirectory = join(temporaryDirectory, 'talk');
      const cardsDirectory = join(talkDirectory, 'cards');
      await mkdir(cardsDirectory, { recursive: true });

      const rootCard = join(talkDirectory, 'a.md');
      const nestedCard = join(cardsDirectory, 'z.md');
      await writeFile(
        join(talkDirectory, 'space.json'),
        JSON.stringify({ version: 1, title: 'Talk' }),
      );
      await writeFile(rootCard, '---\ntitle: A\n---\nA body\n');
      await writeFile(nestedCard, '---\ntitle: Z\n---\nZ body\n');
      await chmod(rootCard, 0o000);
      await chmod(nestedCard, 0o000);

      const thrown = await captureError(() => readSingleSpace(talkDirectory));

      expect(thrown).toBeInstanceOf(SpaceImportFileError);
      if (!(thrown instanceof SpaceImportFileError)) return;
      expect(thrown.kind).toBe('discovery');
      expect(thrown.diagnostics).toHaveLength(2);
      expect(thrown.diagnostics[0]).toContain(rootCard);
      expect(thrown.diagnostics[1]).toContain(nestedCard);
    },
  );

  it('reports a missing input as an absolute discovery diagnostic', async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const missingInput = join(temporaryDirectory, 'missing-talk');

    const thrown = await captureError(() => readSingleSpace(relative(process.cwd(), missingInput)));

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
    expect(thrown.kind).toBe('discovery');
    expect(thrown.diagnostics).toHaveLength(1);
    expect(thrown.diagnostics[0]).toContain(missingInput);
  });

  // A directory standing in for `space.json` fails its read as EISDIR for every
  // uid, where an unreadable mode would let root through. Nothing filters the
  // space file on type the way `markdownFilesIn` filters cards, so the resolved
  // path is read as-is and this needs no root guard.
  it('reports an unreadable space file as an absolute discovery diagnostic', async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const talkDirectory = join(temporaryDirectory, 'talk');
    await mkdir(talkDirectory);

    const spaceFile = join(talkDirectory, 'space.json');
    await mkdir(spaceFile);

    const thrown = await captureError(() =>
      readSingleSpace(relative(process.cwd(), talkDirectory)),
    );

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
    expect(thrown.kind).toBe('discovery');
    expect(thrown.diagnostics).toHaveLength(1);
    expect(thrown.diagnostics[0]).toContain(spaceFile);
  });

  it('reports every malformed file by absolute path through a relative input', async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const talkDirectory = join(temporaryDirectory, 'talk');
    const cardsDirectory = join(talkDirectory, 'cards');
    await mkdir(cardsDirectory, { recursive: true });

    const spaceFile = join(talkDirectory, 'space.json');
    const invalidYamlCard = join(talkDirectory, 'invalid-yaml.md');
    const missingFrontmatterCard = join(cardsDirectory, 'missing-frontmatter.md');
    await writeFile(spaceFile, '{ invalid JSON');
    await writeFile(invalidYamlCard, '---\ntitle: [broken\n---\n');
    await writeFile(missingFrontmatterCard, 'No frontmatter here.\n');

    const thrown = await captureError(() =>
      readSingleSpace(relative(process.cwd(), talkDirectory)),
    );

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics.join('\n')).toContain(spaceFile);
    expect(thrown.diagnostics.join('\n')).toContain(invalidYamlCard);
    expect(thrown.diagnostics.join('\n')).toContain(missingFrontmatterCard);
  });

  it('reports schema-invalid JSON against the absolute space-file path', async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const talkDirectory = join(temporaryDirectory, 'talk');
    await mkdir(talkDirectory);

    const spaceFile = join(talkDirectory, 'space.json');
    await writeFile(
      spaceFile,
      JSON.stringify({
        version: 1,
        title: 'Talk',
        layouts: [
          {
            title: 'Layout',
            kind: 'positioned',
            positions: { [ROOT_CARD_ID]: { x: 0, y: 0 } },
            graphs: [
              {
                title: 'Graph',
                edges: [{ from: 'not-a-uuid', to: ROOT_CARD_ID }],
              },
            ],
          },
        ],
      }),
    );

    const thrown = await captureError(() => readSingleSpace(relative(process.cwd(), spaceFile)));

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics.join('\n')).toContain(spaceFile);
    expect(thrown.diagnostics.join('\n')).toContain('layouts.0.graphs.0.edges.0.from');
  });

  it('answers a version it cannot read once, ahead of every key that moved', async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const talkDirectory = join(temporaryDirectory, 'talk');
    await mkdir(talkDirectory);

    const spaceFile = join(talkDirectory, 'space.json');
    await writeFile(spaceFile, JSON.stringify(versionTwoDocument));
    // A document of a version this build cannot read is not a document to
    // report the files of, either: nothing here is worth saying until the
    // version is.
    await writeFile(join(talkDirectory, 'broken.md'), 'No frontmatter here.\n');

    const thrown = await captureError(() => readSingleSpace(talkDirectory));

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics).toHaveLength(1);
    expect(thrown.diagnostics[0]).toContain(spaceFile);
    expect(thrown.diagnostics[0]).toContain('version 2');
  });

  // Root ignores the mode bits and reads the file anyway, which would fail this
  // rather than exercise it — the same reason the deterministic-order test above
  // is skipped there.
  it.skipIf(process.getuid?.() === 0)(
    'refuses the document ahead of a card it could not even read',
    async () => {
      // The refusal is decided from the space file alone, so an unreadable card
      // cannot answer ahead of it. A reader told to fix a file permission, who
      // then discovers the document was never going to load anyway, has been
      // sent to do work for nothing.
      const temporaryDirectory = await makeTemporaryDirectory();
      const talkDirectory = join(temporaryDirectory, 'talk');
      await mkdir(talkDirectory);

      const spaceFile = join(talkDirectory, 'space.json');
      const unreadableCard = join(talkDirectory, 'a.md');
      await writeFile(spaceFile, JSON.stringify(versionTwoDocument));
      await writeFile(unreadableCard, '---\ntitle: A\n---\nA body\n');
      await chmod(unreadableCard, 0o000);

      const thrown = await captureError(() => readSingleSpace(talkDirectory));

      expect(thrown).toBeInstanceOf(SpaceImportFileError);
      if (!(thrown instanceof SpaceImportFileError)) return;
      expect(thrown.kind).toBe('parsing');
      expect(thrown.diagnostics).toHaveLength(1);
      expect(thrown.diagnostics[0]).toContain('version 2');
    },
  );

  it('reports an unreadable space file ahead of any refusal it cannot decide', async () => {
    // The mirror of the case above, and the reason the refusal is not simply
    // hoisted above every read: with no space file there is no document, so a
    // read failure is the only thing there is to say.
    const temporaryDirectory = await makeTemporaryDirectory();
    const talkDirectory = join(temporaryDirectory, 'talk');
    await mkdir(talkDirectory);
    await mkdir(join(talkDirectory, 'space.json'));

    const thrown = await captureError(() => readSingleSpace(talkDirectory));

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
    expect(thrown.kind).toBe('discovery');
  });

  it('refuses a retired space-level graphs key rather than stripping it', async () => {
    // `importSpaceFileSchema` is a plain Zod object, so an undeclared key is
    // dropped. For the retired `cards` and `edges` that is right — they carried
    // nothing the rest of the document does not say. A space-level `graphs`
    // carried the whole topology (ADR 0040), so stripping it discards exactly
    // what the author wrote and imports a Space that looks complete.
    const temporaryDirectory = await makeTemporaryDirectory();
    const talkDirectory = join(temporaryDirectory, 'talk');
    await mkdir(talkDirectory);

    const spaceFile = join(talkDirectory, 'space.json');
    await writeFile(spaceFile, JSON.stringify(retiredGraphsDocument));

    const thrown = await captureError(() => readSingleSpace(talkDirectory));

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics).toHaveLength(1);
    expect(thrown.diagnostics[0]).toContain(spaceFile);
    expect(thrown.diagnostics[0]).toContain('`graphs`');
  });

  // The acceptance criterion behind both checks above, and the one that makes
  // them survive a *third* pre-parse refusal being added at intake: a document
  // intake refuses before parsing is refused here in the same words. The two
  // doors ask one composed `documentRefusal`, so neither can come to know about
  // a refusal the other does not — which is exactly how the retired `graphs`
  // key came to be stripped here while intake rejected it.
  it.each([
    ['a version it cannot read', versionTwoDocument],
    ['a retired space-level graphs key', retiredGraphsDocument],
  ])('says of %s exactly what domain intake says', async (_case, document) => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const talkDirectory = join(temporaryDirectory, 'talk');
    await mkdir(talkDirectory);
    await writeFile(join(talkDirectory, 'space.json'), JSON.stringify(document));

    const thrown = await captureError(() => readSingleSpace(talkDirectory));
    const intake = loadSpace(document, []);

    expect(intake.ok).toBe(false);
    if (intake.ok) return;
    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
    expect(intake.errors).toHaveLength(1);
    expect(thrown.diagnostics[0]).toContain(intake.errors[0]?.message);
  });
});

describe('readImportBatch', () => {
  it('classifies a child-space probe failure as file discovery', async () => {
    const collection = await makeTemporaryDirectory();
    const unreadable = join(collection, 'unreadable');
    await mkdir(unreadable);
    await chmod(unreadable, 0o000);

    const thrown = await captureError(() => readImportBatch(collection));
    await chmod(unreadable, 0o700);

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
    expect(thrown.kind).toBe('discovery');
    expect(thrown.diagnostics.join('\n')).toContain(unreadable);
  });

  it('imports only immediate child spaces from a collection in directory order', async () => {
    const collection = await makeTemporaryDirectory();
    const first = join(collection, 'a-first');
    const second = join(collection, 'b-second');
    const nested = join(collection, 'wrapper', 'nested');
    await mkdir(first);
    await mkdir(second);
    await mkdir(nested, { recursive: true });
    await writeFile(join(first, 'space.json'), JSON.stringify({ version: 1, title: 'First' }));
    await writeFile(join(second, 'space.json'), JSON.stringify({ version: 1, title: 'Second' }));
    await writeFile(join(nested, 'space.json'), JSON.stringify({ version: 1, title: 'Nested' }));

    const batch = await readImportBatch(collection);

    expect(batch.map(({ document }) => document.title)).toEqual(['First', 'Second']);
  });

  it('reports parsing failures from every discovered child space together', async () => {
    const collection = await makeTemporaryDirectory();
    const first = join(collection, 'first');
    const second = join(collection, 'second');
    await mkdir(first);
    await mkdir(second);
    const firstSpaceFile = join(first, 'space.json');
    const secondSpaceFile = join(second, 'space.json');
    await writeFile(firstSpaceFile, '{ invalid first');
    await writeFile(secondSpaceFile, '{ invalid second');

    const thrown = await captureError(() => readImportBatch(collection));

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics.join('\n')).toContain(firstSpaceFile);
    expect(thrown.diagnostics.join('\n')).toContain(secondSpaceFile);
  });
});
