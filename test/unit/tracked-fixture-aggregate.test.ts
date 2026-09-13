import { titleName, uuidSchema, type Thing, type UUID } from '@project/core';
import { loadSpaceAggregate } from '@project/graph';
import { describe, expect, it } from 'vitest';
import { importFixture } from '../support/import-fixture';
import { MemorySpaceRepository } from '../support/memory-space-repository';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');

const spaceThingTargets = (things: readonly Thing[]): readonly UUID[] =>
  things.flatMap((thing) => (thing.kind === 'space' ? [thing.spaceId] : []));

/**
 * Longest Space-Thing path from Meta, and every ordinary Space that path reaches.
 *
 * Depth is the number of Spaces on the longest chain, Meta included — Meta → A → B
 * is depth three. A Space is reachable when some chain of Space Things starting
 * at Meta names it.
 */
const traverseFromMeta = (metaId: UUID, targetsBySpace: ReadonlyMap<UUID, readonly UUID[]>) => {
  const reached = new Set<UUID>([metaId]);
  let depth = 1;
  const visit = (spaceId: UUID, chainLength: number): void => {
    if (chainLength > depth) depth = chainLength;
    for (const target of targetsBySpace.get(spaceId) ?? []) {
      if (reached.has(target)) continue;
      reached.add(target);
      visit(target, chainLength + 1);
    }
  };
  visit(metaId, 1);
  return { depth, reached };
};

describe('tracked fixture aggregate', () => {
  it('imports as a complete Meta-rooted aggregate through the production importer', async () => {
    const repository = new MemorySpaceRepository();
    const meta = await importFixture(repository);

    expect(meta.snapshot.id).toBe(META_ID);
    expect(meta.snapshot.document.title).toBe('Diagram fixture');

    const listed = await repository.listSpaces();
    expect(listed.length).toBeGreaterThan(1);

    const loaded = await repository.loadAggregate();
    expect(loaded.kind).toBe('loaded');
    if (loaded.kind !== 'loaded') throw new Error('expected loaded aggregate');
    expect(loaded.aggregate.metaSpaceId).toBe(META_ID);
    expect(loaded.aggregate.spaces).toHaveLength(listed.length);
  });

  it('reaches every ordinary Space from Meta, at depth three, with one converging reference', async () => {
    const repository = new MemorySpaceRepository();
    await importFixture(repository);
    const loaded = await repository.loadAggregate();
    if (loaded.kind !== 'loaded') throw new Error('expected loaded aggregate');

    const intake = loadSpaceAggregate({
      metaSpaceId: loaded.aggregate.metaSpaceId,
      snapshots: loaded.aggregate.spaces.map(({ snapshot }) => snapshot),
    });
    expect(intake.ok).toBe(true);
    if (!intake.ok) throw new Error(intake.errors.map(({ kind }) => kind).join(', '));

    const byId = new Map(intake.aggregate.spaces.map((space) => [space.id, space]));
    const targetsBySpace = new Map(
      intake.aggregate.spaces.map((space) => [space.id, spaceThingTargets(space.things)]),
    );
    const inbound = new Map<UUID, number>();
    for (const targets of targetsBySpace.values()) {
      for (const target of targets) {
        inbound.set(target, (inbound.get(target) ?? 0) + 1);
      }
    }

    const { depth, reached } = traverseFromMeta(META_ID, targetsBySpace);
    const ordinary = intake.aggregate.spaces.filter((space) => space.id !== META_ID);

    expect(ordinary.length).toBe(3);
    expect(depth).toBe(3);
    expect(ordinary.every((space) => reached.has(space.id))).toBe(true);
    expect([...inbound.values()].some((count) => count >= 2)).toBe(true);

    const titles = new Set(ordinary.map((space) => space.title));
    expect(titles.has('Presentation')).toBe(true);
    expect(titles.has('Deep dive')).toBe(true);
    expect(titles.has('Authoring notes')).toBe(true);

    const deepDive = [...byId.values()].find((space) => space.title === 'Deep dive');
    if (deepDive === undefined) throw new Error('expected Deep dive Space');
    expect(inbound.get(deepDive.id)).toBeGreaterThanOrEqual(2);

    for (const space of ordinary) {
      for (const thing of space.things) {
        if (thing.kind !== 'markdown') continue;
        expect(titleName(thing.title).length).toBeGreaterThan(1);
        expect(thing.body.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
