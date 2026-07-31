import { cp, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { spaceSnapshotSchema, type Card, type SpaceFile, type UUID } from '@project/core';
import { loadSpaceSnapshot, serializeCardFile } from '@project/graph';
import { readSingleSpace } from '../import/read-single-space';
import type { SpaceRepository, StoredSpace } from '../persistence/space-repository';

const compareOrdinal = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const canonicalSpaceFile = ({ snapshot }: StoredSpace): SpaceFile => {
  const layouts = snapshot.document.layouts?.map((layout) => ({
    id: layout.id,
    title: layout.title,
    kind: layout.kind,
    positions: Object.fromEntries(
      Object.entries(layout.positions).sort(([left], [right]) => compareOrdinal(left, right)),
    ),
    ...(layout.routes === undefined ? {} : { routes: layout.routes }),
    ...(layout.activeRoute === undefined ? {} : { activeRoute: layout.activeRoute }),
  }));
  return {
    version: 2,
    id: snapshot.id,
    title: snapshot.document.title,
    routes: snapshot.document.routes.map((route) => ({
      id: route.id,
      title: route.title,
      ...(route.color === undefined ? {} : { color: route.color }),
      edges: route.edges.map(({ from, to }) => ({ from, to })),
    })),
    ...(layouts === undefined ? {} : { layouts }),
    ...(snapshot.document.defaultView === undefined
      ? {}
      : { defaultView: snapshot.document.defaultView }),
  };
};

const canonicalCard = (
  id: UUID,
  document: StoredSpace['snapshot']['cards'][number]['document'],
): Card => {
  const common = {
    id,
    title: document.title,
    ...(document.description === undefined ? {} : { description: document.description }),
  };
  return document.kind === 'alias'
    ? { ...common, kind: 'alias', target: document.target }
    : { ...common, kind: 'markdown', body: document.body };
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
};

const removeMarkdownFiles = async (directory: string): Promise<void> => {
  if (!(await exists(directory))) return;
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => rm(join(directory, entry.name))),
  );
};

const prepareReplacement = async (stored: StoredSpace, directory: string): Promise<void> => {
  await removeMarkdownFiles(directory);
  await removeMarkdownFiles(join(directory, 'cards'));
  await rm(join(directory, 'space.json'), { force: true });

  const cardsDirectory = join(directory, 'cards');
  await mkdir(cardsDirectory, { recursive: true });
  await writeFile(
    join(directory, 'space.json'),
    `${JSON.stringify(canonicalSpaceFile(stored), null, 2)}\n`,
  );
  for (const card of [...stored.snapshot.cards].sort((left, right) =>
    compareOrdinal(left.id, right.id),
  )) {
    await writeFile(
      join(cardsDirectory, `${card.id}.md`),
      serializeCardFile(canonicalCard(card.id, card.document)),
    );
  }

  const imported = await readSingleSpace(directory);
  const snapshot = spaceSnapshotSchema.parse({
    id: imported.id,
    document: imported.document,
    cards: imported.cards,
  });
  const intake = loadSpaceSnapshot(snapshot);
  if (!intake.ok) {
    throw new Error(intake.errors.map(({ message }) => message).join('\n'));
  }
};

const replaceDestination = async (replacement: string, destination: string): Promise<void> => {
  if (!(await exists(destination))) {
    await rename(replacement, destination);
    return;
  }

  const backup = join(dirname(replacement), 'previous');
  await rename(destination, backup);
  try {
    await rename(replacement, destination);
  } catch (error) {
    await rename(backup, destination);
    throw error;
  }
};

export const exportSpace = async (
  repository: SpaceRepository,
  id: UUID,
  destinationPath: string,
): Promise<StoredSpace | undefined> => {
  const stored = await repository.loadSpace(id);
  if (stored === undefined) return undefined;

  const destination = resolve(destinationPath);
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const stagingRoot = await mkdtemp(join(parent, `.${basename(destination)}.hyper-export-`));
  const replacement = join(stagingRoot, 'replacement');
  try {
    if (await exists(destination)) {
      await cp(destination, replacement, { recursive: true });
    } else {
      await mkdir(replacement);
    }
    await prepareReplacement(stored, replacement);
    await replaceDestination(replacement, destination);
    await repository.markExported(id, stored.revision);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }

  return stored;
};
