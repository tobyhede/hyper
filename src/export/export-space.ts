import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Card, SpaceFile, UUID } from '@project/core';
import { serializeCardFile } from '@project/graph';
import type { SpaceRepository, StoredSpace } from '../persistence/space-repository';

const compareOrdinal = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const canonicalSpaceFile = ({ snapshot }: StoredSpace): SpaceFile => ({
  version: 2,
  id: snapshot.id,
  title: snapshot.document.title,
  routes: snapshot.document.routes,
  ...(snapshot.document.layouts === undefined ? {} : { layouts: snapshot.document.layouts }),
  ...(snapshot.document.defaultView === undefined
    ? {}
    : { defaultView: snapshot.document.defaultView }),
});

export const exportSpace = async (
  repository: SpaceRepository,
  id: UUID,
  destination: string,
): Promise<StoredSpace | undefined> => {
  const stored = await repository.loadSpace(id);
  if (stored === undefined) return undefined;

  const cardsDirectory = join(destination, 'cards');
  await mkdir(cardsDirectory, { recursive: true });
  await writeFile(
    join(destination, 'space.json'),
    `${JSON.stringify(canonicalSpaceFile(stored), null, 2)}\n`,
  );
  for (const card of [...stored.snapshot.cards].sort((left, right) =>
    compareOrdinal(left.id, right.id),
  )) {
    const value: Card = { id: card.id, ...card.document };
    await writeFile(join(cardsDirectory, `${card.id}.md`), serializeCardFile(value));
  }

  return stored;
};
