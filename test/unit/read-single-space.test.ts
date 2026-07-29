import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SpaceImportFileError, readSingleSpace } from '../../src/import/read-single-space';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const ROOT_CARD_ID = '00000000-0000-4000-8000-000000000002';

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
  it('reads a space-file or directory input with globally sorted, non-recursive cards', async () => {
    const temporaryDirectory = await makeTemporaryDirectory();
    const talkDirectory = join(temporaryDirectory, 'talk');
    const cardsDirectory = join(talkDirectory, 'cards');
    await mkdir(join(cardsDirectory, 'nested'), { recursive: true });
    await mkdir(join(talkDirectory, 'notes'));

    const spaceFile = join(talkDirectory, 'space.json');
    await writeFile(
      spaceFile,
      JSON.stringify({ version: 2, id: SPACE_ID, title: 'Talk', routes: [] }),
    );
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
      document: { version: 2, title: 'Talk', routes: [] },
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

    let thrown: unknown;
    try {
      await readSingleSpace(relative(process.cwd(), talkDirectory));
    } catch (error) {
      thrown = error;
    }

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
        version: 2,
        title: 'Talk',
        routes: [
          {
            title: 'Route',
            edges: [{ from: 'not-a-uuid', to: ROOT_CARD_ID }],
          },
        ],
      }),
    );

    let thrown: unknown;
    try {
      await readSingleSpace(relative(process.cwd(), spaceFile));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SpaceImportFileError);
    if (!(thrown instanceof SpaceImportFileError)) return;
    expect(thrown.kind).toBe('parsing');
    expect(thrown.diagnostics.join('\n')).toContain(spaceFile);
    expect(thrown.diagnostics.join('\n')).toContain('routes.0.edges.0.from');
  });
});
