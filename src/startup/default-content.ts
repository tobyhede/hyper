import { DEFAULT_OPEN_SIZE, type SpaceSnapshot, type UUID } from '@project/core';
import { newSpace, parseResourceFile } from '@project/graph';
import type { AggregateInput } from '../persistence/space-repository';

/**
 * The aggregate a repository is initialized from — ADR 0077's **Default
 * Content**, which is a release-fixture label rather than a domain entity.
 *
 * First load authors ordinary state: the Meta Space named `Space`, with one
 * Open Markdown Resource that shows the product logo. `.scratch/v1-release/issues/16`
 * still owns the remaining kinds, frozen identities, reset, and the shared
 * generator those must not drift from. Nothing here is protected, repaired or
 * added again once a repository is initialized.
 *
 * Identities come from `newSpace` (`packages/graph/test/new-space.test.ts`).
 * This function then authors the Space name, the first Resource's Title and body,
 * and that Resource's Open placement.
 */
export const defaultContentAggregate = (newId: () => UUID): AggregateInput => {
  const minted = newSpace(newId);
  const firstFile = minted.resourceFiles[0];
  if (firstFile === undefined) {
    throw new Error('Default Content expected newSpace to mint one Resource.');
  }
  const parsed = parseResourceFile(firstFile);
  if (!parsed.ok) throw new Error(parsed.errors.map(({ message }) => message).join('\n'));

  const first: SpaceSnapshot['resources'][number] = {
    id: parsed.resource.id,
    document: {
      title: 'Welcome to Infinity Cube',
      kind: 'markdown',
      body: '![Infinity Cube](/infinity-cube-logo.svg)',
    },
  };

  const { id, ...document } = minted.file;
  const map = document.maps?.[0];
  if (map === undefined) {
    throw new Error('Default Content expected newSpace to mint one Map.');
  }

  const meta: SpaceSnapshot = {
    id,
    document: {
      ...document,
      title: 'Space',
      maps: [
        {
          ...map,
          positions: {
            [first.id]: { x: 0, y: 0, open: true, openSize: DEFAULT_OPEN_SIZE },
          },
        },
      ],
    },
    resources: [first],
  };
  return { metaSpaceId: meta.id, spaces: [meta] };
};
