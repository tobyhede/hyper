import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { loadSpace } from '@project/graph';
import { afterEach, describe, expect, it } from 'vitest';
import { AggregateDirectoryError, readSingleSpace } from '../../src/aggregate-directory';
import { captureError } from '../support/capture-error';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const ROOT_THING_ID = '00000000-0000-4000-8000-000000000002';
const GRAPH_ID = '00000000-0000-4000-8000-000000000003';
const DIAGRAM_ID = '00000000-0000-4000-8000-000000000004';

/**
 * The disposable pre-release shape: graphs declared beside the diagrams rather
 * than owned by them (ADR 0040). Under version 1 each of its diagrams is missing
 * the graphs it now owns and carries a key the schema does not recognise, so a
 * shape check reached on its own answers a cascade in which nothing says which
 * version arrived.
 */
const versionTwoDocument = {
  version: 2,
  id: SPACE_ID,
  title: 'Pre-release talk',
  graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
  diagrams: [{ id: DIAGRAM_ID, title: 'Working', positions: {} }],
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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('readSingleSpace', () => {
  it('reads a space-file or directory input with globally sorted, non-recursive things', async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const talkDirectory = join(temporaryDirectory, 'talk');
    const thingsDirectory = join(talkDirectory, 'things');
    await mkdir(join(thingsDirectory, 'nested'), { recursive: true });
    await mkdir(join(talkDirectory, 'notes'));

    const spaceFile = join(talkDirectory, 'space.json');
    await writeFile(spaceFile, JSON.stringify({ version: 1, id: SPACE_ID, title: 'Talk' }));
    await writeFile(join(talkDirectory, 'a.md'), '---\ntitle: A\n---\nA body\n');
    await writeFile(
      join(thingsDirectory, 'detail.md'),
      '---\ntitle: Detail\nkind: markdown\n---\nDetail body\n',
    );
    await writeFile(join(thingsDirectory, 'z.md'), '---\ntitle: Z\n---\nZ body\n');
    await writeFile(
      join(talkDirectory, 'root.md'),
      `---\nid: ${ROOT_THING_ID}\ntitle: Root\n---\nRoot body\n`,
    );
    await writeFile(join(thingsDirectory, 'nested', 'ignored.md'), 'not a discovered thing');
    await writeFile(join(talkDirectory, 'notes', 'ignored.md'), 'not a discovered thing');

    const expected = {
      id: SPACE_ID,
      document: { version: 1, title: 'Talk' },
      things: [
        // Sorted globally by relative path, so the two files inside the
        // inventory directory now follow `root.md` rather than preceding it:
        // ADR 0085 renamed the directory and `things/` sorts after `root`
        // where `cards/` sorted before it. The rule under test is unchanged.
        { document: { title: 'A', kind: 'markdown', body: 'A body\n' } },
        {
          id: ROOT_THING_ID,
          document: { title: 'Root', kind: 'markdown', body: 'Root body\n' },
        },
        { document: { title: 'Detail', kind: 'markdown', body: 'Detail body\n' } },
        { document: { title: 'Z', kind: 'markdown', body: 'Z body\n' } },
      ],
    };

    await expect(readSingleSpace(talkDirectory)).resolves.toEqual(expected);
    await expect(readSingleSpace(spaceFile)).resolves.toEqual(expected);
  });

  // Unreadable-mode is the only way to fail a *discovered* thing file's read:
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
      const thingsDirectory = join(talkDirectory, 'things');
      await mkdir(thingsDirectory, { recursive: true });

      const rootThing = join(talkDirectory, 'a.md');
      const nestedThing = join(thingsDirectory, 'z.md');
      await writeFile(
        join(talkDirectory, 'space.json'),
        JSON.stringify({ version: 1, title: 'Talk' }),
      );
      await writeFile(rootThing, '---\ntitle: A\n---\nA body\n');
      await writeFile(nestedThing, '---\ntitle: Z\n---\nZ body\n');
      await chmod(rootThing, 0o000);
      await chmod(nestedThing, 0o000);

      const thrown = await captureError(() => readSingleSpace(talkDirectory));

      expect(thrown).toBeInstanceOf(AggregateDirectoryError);
      if (!(thrown instanceof AggregateDirectoryError)) return;
      expect(thrown.kind).toBe('discovery');
      expect(thrown.diagnostics).toHaveLength(2);
      expect(thrown.diagnostics[0]).toContain(rootThing);
      expect(thrown.diagnostics[1]).toContain(nestedThing);
    },
  );

  it('reports a missing input as an absolute discovery diagnostic', async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const missingInput = join(temporaryDirectory, 'missing-talk');

    const thrown = await captureError(() => readSingleSpace(relative(process.cwd(), missingInput)));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('discovery');
    expect(thrown.diagnostics).toHaveLength(1);
    expect(thrown.diagnostics[0]).toContain(missingInput);
  });

  // A directory standing in for `space.json` fails its read as EISDIR for every
  // uid, where an unreadable mode would let root through. Nothing filters the
  // space file on type the way `markdownFilesIn` filters things, so the resolved
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

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('discovery');
    expect(thrown.diagnostics).toHaveLength(1);
    expect(thrown.diagnostics[0]).toContain(spaceFile);
  });

  it('reports every malformed file by absolute path through a relative input', async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const talkDirectory = join(temporaryDirectory, 'talk');
    const thingsDirectory = join(talkDirectory, 'things');
    await mkdir(thingsDirectory, { recursive: true });

    const spaceFile = join(talkDirectory, 'space.json');
    const invalidYamlThing = join(talkDirectory, 'invalid-yaml.md');
    const missingFrontmatterThing = join(thingsDirectory, 'missing-frontmatter.md');
    await writeFile(spaceFile, '{ invalid JSON');
    await writeFile(invalidYamlThing, '---\ntitle: [broken\n---\n');
    await writeFile(missingFrontmatterThing, 'No frontmatter here.\n');

    const thrown = await captureError(() =>
      readSingleSpace(relative(process.cwd(), talkDirectory)),
    );

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics.join('\n')).toContain(spaceFile);
    expect(thrown.diagnostics.join('\n')).toContain(invalidYamlThing);
    expect(thrown.diagnostics.join('\n')).toContain(missingFrontmatterThing);
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
        diagrams: [
          {
            title: 'Diagram',
            kind: 'positioned',
            positions: { [ROOT_THING_ID]: { x: 0, y: 0 } },
            graphs: [
              {
                title: 'Graph',
                edges: [{ from: 'not-a-uuid', to: ROOT_THING_ID }],
              },
            ],
          },
        ],
      }),
    );

    const thrown = await captureError(() => readSingleSpace(relative(process.cwd(), spaceFile)));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics.join('\n')).toContain(spaceFile);
    expect(thrown.diagnostics.join('\n')).toContain('diagrams.0.graphs.0.edges.0.from');
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

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics).toHaveLength(1);
    expect(thrown.diagnostics[0]).toContain(spaceFile);
    expect(thrown.diagnostics[0]).toContain('version 2');
  });

  // Root ignores the mode bits and reads the file anyway, which would fail this
  // rather than exercise it — the same reason the deterministic-order test above
  // is skipped there.
  it.skipIf(process.getuid?.() === 0)(
    'refuses the document ahead of a thing it could not even read',
    async () => {
      // The refusal is decided from the space file alone, so an unreadable thing
      // cannot answer ahead of it. A reader told to fix a file permission, who
      // then discovers the document was never going to load anyway, has been
      // sent to do work for nothing.
      const temporaryDirectory = await makeTemporaryDirectory();
      const talkDirectory = join(temporaryDirectory, 'talk');
      await mkdir(talkDirectory);

      const spaceFile = join(talkDirectory, 'space.json');
      const unreadableThing = join(talkDirectory, 'a.md');
      await writeFile(spaceFile, JSON.stringify(versionTwoDocument));
      await writeFile(unreadableThing, '---\ntitle: A\n---\nA body\n');
      await chmod(unreadableThing, 0o000);

      const thrown = await captureError(() => readSingleSpace(talkDirectory));

      expect(thrown).toBeInstanceOf(AggregateDirectoryError);
      if (!(thrown instanceof AggregateDirectoryError)) return;
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

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(thrown.kind).toBe('discovery');
  });

  it('refuses a retired space-level graphs key rather than stripping it', async () => {
    // `importSpaceFileSchema` is strict, so an undeclared key is already
    // refused rather than dropped. This check survives that to *name* the one
    // that matters: a space-level `graphs` carried the whole topology
    // (ADR 0040), and a generic unrecognized-key refusal does not say so.
    const temporaryDirectory = await makeTemporaryDirectory();
    const talkDirectory = join(temporaryDirectory, 'talk');
    await mkdir(talkDirectory);

    const spaceFile = join(talkDirectory, 'space.json');
    await writeFile(spaceFile, JSON.stringify(retiredGraphsDocument));

    const thrown = await captureError(() => readSingleSpace(talkDirectory));

    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
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
    expect(thrown).toBeInstanceOf(AggregateDirectoryError);
    if (!(thrown instanceof AggregateDirectoryError)) return;
    expect(intake.errors).toHaveLength(1);
    expect(thrown.diagnostics[0]).toContain(intake.errors[0]?.message);
  });
});
