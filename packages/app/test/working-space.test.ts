import { expect, it } from 'vitest';
import { spaceSnapshotSchema, type SpaceSnapshot } from '@project/core';
import { createWorkingSpaceReader } from '../src/snapshot';

const snapshot = (title: string): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    document: {
      version: 2,
      title,
      routes: [
        {
          id: '00000000-0000-4000-8000-000000000004',
          title: 'Main',
          edges: [
            {
              from: '00000000-0000-4000-8000-000000000002',
              to: '00000000-0000-4000-8000-000000000003',
            },
          ],
        },
      ],
    },
    cards: [
      {
        id: '00000000-0000-4000-8000-000000000002',
        document: { title: 'Card', kind: 'markdown', body: 'Body' },
      },
      {
        id: '00000000-0000-4000-8000-000000000003',
        document: { title: 'Next', kind: 'markdown', body: 'More' },
      },
    ],
  });

it('answers one validated Space however many times a working snapshot is read', () => {
  const working = snapshot('Space');
  const readWorkingSpace = createWorkingSpaceReader();

  const first = readWorkingSpace(working);

  // Identity, not equality: re-validating would build an equal but distinct
  // aggregate, which is exactly the per-render reparse this reader exists to
  // stop. It is also what lets a React memo hold across a render.
  expect(readWorkingSpace(working)).toBe(first);
  expect(readWorkingSpace(working)).toBe(first);
  expect(first.title).toBe('Space');
});

it('revalidates when the session installs a different working snapshot', () => {
  let working = snapshot('Space');
  const readWorkingSpace = createWorkingSpaceReader();
  const first = readWorkingSpace(working);

  working = snapshot('Renamed');

  const second = readWorkingSpace(working);
  expect(second).not.toBe(first);
  expect(second.title).toBe('Renamed');
  expect(readWorkingSpace(working)).toBe(second);
});

it('throws the validation failure every time an invalid snapshot is read', () => {
  // A Route naming Cards the snapshot does not carry: valid wire shape, invalid
  // aggregate, so this fails domain intake rather than the schema.
  const base = snapshot('Space');
  const dangling: SpaceSnapshot = { ...base, cards: [] };
  const readWorkingSpace = createWorkingSpaceReader();
  const valid = readWorkingSpace(base);

  expect(() => readWorkingSpace(dangling)).toThrow(/00000000-0000-4000-8000-000000000002/);
  // No poisoned cache: a reader that swallowed the failure once would answer a
  // stale Space forever after.
  expect(() => readWorkingSpace(dangling)).toThrow(/00000000-0000-4000-8000-000000000002/);

  // The failure also leaves the last good pair alone rather than clearing it,
  // so the valid snapshot still answers from the cache instead of being
  // revalidated into an equal but distinct aggregate.
  expect(readWorkingSpace(base)).toBe(valid);
});
