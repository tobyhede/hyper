import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AGGREGATE_FILE_VERSION, type ResourceFileDocument, type UUID } from '@project/core';
import { AGGREGATE_FILE_NAME } from '../../src/aggregate-directory';

/** One Space directory inside a canonical aggregate, written from raw bytes. */
export interface SpaceDirectory {
  /** The directory name, which is where a Space's own identity is written. */
  readonly name: string;
  /** Raw text, so a test can write a space file that does not parse. */
  readonly spaceFile: string;
  /** Files of the Space directory's `resources/`, by name. */
  readonly resources?: Readonly<Record<string, string>>;
}

/**
 * One Resource's file under `resources/`, by name, as an author writes it:
 * `<id>.json` holding the document. Written with `JSON.stringify` rather than
 * the codec, so intake is exercised against files the codec under test did
 * not produce.
 */
export const resourceFiles = (document: ResourceFileDocument) => ({
  [`${document.id}.json`]: `${JSON.stringify(document, null, 2)}\n`,
});

/** A Markdown Resource's files under `resources/`: its Resource file and its `<id>.md` sidecar. */
export const markdownResourceFiles = (id: UUID, title: string, source: string) => ({
  ...resourceFiles({
    id,
    title,
    kind: 'markdown',
    content: { path: `${id}.md`, mediaType: 'text/markdown' },
  }),
  [`${id}.md`]: source,
});

/**
 * Write a canonical aggregate directory into `root`: a versioned aggregate file
 * naming the Meta Space, and one `<space-uuid>/` child per Space.
 *
 * Public import takes nothing else, so every import test starts from this shape
 * rather than a bare Space directory — which is why it lives here rather than in
 * one of them: a change to the format has one place to reach.
 *
 * `root` is the caller's. Each suite owns its own temporary directory naming and
 * cleanup, and this takes no view on either.
 */
export const writeAggregateInto = async (
  root: string,
  metaSpaceId: UUID,
  spaces: readonly SpaceDirectory[],
): Promise<string> => {
  await writeFile(
    join(root, AGGREGATE_FILE_NAME),
    JSON.stringify({ version: AGGREGATE_FILE_VERSION, metaSpaceId }),
  );
  for (const space of spaces) {
    const directory = join(root, space.name);
    await mkdir(join(directory, 'resources'), { recursive: true });
    await writeFile(join(directory, 'space.json'), space.spaceFile);
    for (const [name, text] of Object.entries(space.resources ?? {})) {
      await writeFile(join(directory, 'resources', name), text);
    }
  }
  return root;
};
