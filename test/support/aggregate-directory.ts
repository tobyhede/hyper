import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AGGREGATE_FILE_VERSION, type UUID } from '@project/core';
import { AGGREGATE_FILE_NAME } from '../../src/aggregate-directory';

/** One Space directory inside a canonical aggregate, written from raw bytes. */
export interface SpaceDirectory {
  /** The directory name, which is where a Space's own identity is written. */
  readonly name: string;
  /** Raw text, so a test can write a space file that does not parse. */
  readonly spaceFile: string;
  readonly resources?: Readonly<Record<string, string>>;
}

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
