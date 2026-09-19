import { newUuid, type SpaceSnapshot, type UUID } from '@project/core';
import { MemorySpaceBackend, type MemorySpaceBackendTestControl } from '@project/persistence';
import { productDestinationPath } from '@project/http';
import { createOpenSpaces, type OpenSpace, type OpenSpaces } from '#src/open-spaces';

/** Fixture data and an isolated history adapter; all session behavior is production's. */
export function storySpaces(
  metaSpaceId: UUID,
  snapshots: readonly SpaceSnapshot[],
  control?: MemorySpaceBackendTestControl,
): OpenSpaces {
  const backend = new MemorySpaceBackend(
    metaSpaceId,
    snapshots.map((snapshot) => ({ snapshot, revision: 0n, exportedRevision: null })),
    control,
  );
  const meta = snapshots.find((snapshot) => snapshot.id === metaSpaceId);
  if (meta === undefined) throw new Error('The story fixture does not hold its Meta Space.');
  let pathname = productDestinationPath({ kind: 'space', spaceId: metaSpaceId });
  return createOpenSpaces({
    backend,
    metaSpaceId,
    metaSpaceTitle: meta.document.title,
    newId: newUuid,
    history: {
      pathname: () => pathname,
      href: () => `https://example.test${pathname}`,
      push: (next) => {
        pathname = next;
      },
      replace: (next) => {
        pathname = next;
      },
      onPopState: () => () => undefined,
    },
  });
}

export const storyOpening = (spaces: OpenSpaces, opened: OpenSpace) => ({
  kind: 'opened' as const,
  spaces,
  opened,
});
