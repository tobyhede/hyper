import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type UUID } from '@project/core';
import {
  declaredSpaceReferences,
  missingSpaceReferences,
  releasedSpaces,
  spaceReferenceCycles,
  unrootedSpaces,
  type ReferencingSpace,
} from '../src/declared-references';

const spaceOf = (index: number): UUID =>
  uuidSchema.parse(`00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`);
const resourceOf = (from: number, to: number): UUID =>
  uuidSchema.parse(`10000000-0000-4000-8000-${(from * 100 + to).toString().padStart(12, '0')}`);
const META = spaceOf(0);

/** Spaces whose Space Resources reference the Spaces `links[i]` names, by index. */
const referencingSpaces = (links: readonly (readonly number[])[]): ReferencingSpace[] =>
  links.map((targets, from) => ({
    id: spaceOf(from),
    resources: targets.map((to) => ({
      id: resourceOf(from, to),
      document: {
        kind: 'space',
        content: { spaceId: spaceOf(to), map: spaceOf(900), graph: spaceOf(901) },
      },
    })),
  }));

/** Whether the directed graph `links` has a cycle, by repeatedly removing Spaces nothing references. */
const hasCycle = (links: readonly (readonly number[])[]): boolean => {
  const inbound = links.map(() => 0);
  for (const targets of links) for (const to of targets) inbound[to] = (inbound[to] ?? 0) + 1;
  const free = inbound.flatMap((count, index) => (count === 0 ? [index] : []));
  let removed = 0;
  for (const index of free) {
    removed += 1;
    for (const to of links[index] ?? []) {
      const count = (inbound[to] ?? 0) - 1;
      inbound[to] = count;
      if (count === 0) free.push(to);
    }
  }
  return removed < links.length;
};

/** Every Space reachable from the Meta Space through `links`. */
const reachable = (links: readonly (readonly number[])[]): Set<number> => {
  const seen = new Set<number>([0]);
  for (const index of seen) for (const to of links[index] ?? []) seen.add(to);
  return seen;
};

/** Any directed graph over up to six Spaces, self-references and cycles included. */
const anyLinks = fc.integer({ min: 1, max: 6 }).chain((count) =>
  fc.array(fc.uniqueArray(fc.integer({ min: 0, max: count - 1 }), { maxLength: count }), {
    minLength: count,
    maxLength: count,
  }),
);

/*
 * An aggregate as the lifecycle builds one: references run from lower to higher
 * index and each ordinary Space has at least one, so every Space is rooted.
 */
const rootedLinks = fc.integer({ min: 2, max: 7 }).chain((count) =>
  fc
    .tuple(
      ...Array.from({ length: count - 1 }, (_, index) =>
        fc.uniqueArray(fc.integer({ min: 0, max: index }), { minLength: 1, maxLength: index + 1 }),
      ),
    )
    .chain((referrers) => {
      const links = Array.from({ length: count }, (): number[] => []);
      referrers.forEach((from, index) => {
        for (const i of from) links[i]?.push(index + 1);
      });
      const edges = links.flatMap((targets, i) => targets.map((j) => [i, j] as const));
      return fc.record({ links: fc.constant(links), removed: fc.constantFrom(...edges) });
    }),
);

describe('the Space reference rules over any graph of declared references', () => {
  it('finds a cycle exactly when the references have one', () => {
    fc.assert(
      fc.property(anyLinks, (links) => {
        const cycles = spaceReferenceCycles(declaredSpaceReferences(referencingSpaces(links)));
        expect(cycles.length > 0).toBe(hasCycle(links));
      }),
    );
  });

  it('names as unrooted every ordinary Space no lifetime reference holds', () => {
    fc.assert(
      fc.property(anyLinks, (links) => {
        const held = new Set(links.flat());
        const expected = links.flatMap((_, index) =>
          index !== 0 && !held.has(index) ? [spaceOf(index)] : [],
        );
        expect(unrootedSpaces(declaredSpaceReferences(referencingSpaces(links)), META)).toEqual(
          expected,
        );
      }),
    );
  });

  it('finds no reference missing when every target is read, and each one that is not', () => {
    fc.assert(
      fc.property(anyLinks, (links) => {
        const declared = declaredSpaceReferences(referencingSpaces(links));
        expect(missingSpaceReferences(declared)).toEqual([]);
        const [, ...unread] = referencingSpaces(links);
        const partial = { ...declared, spaceIds: unread.map(({ id }) => id) };
        expect(missingSpaceReferences(partial).map(({ targetSpaceId }) => targetSpaceId)).toEqual(
          declared.references.map(({ targetSpaceId }) => targetSpaceId).filter((id) => id === META),
        );
      }),
    );
  });

  it('releases exactly the Spaces a removed reference leaves unreachable from the Meta Space', () => {
    fc.assert(
      fc.property(rootedLinks, ({ links, removed: [from, to] }) => {
        const remaining = links.map((targets, index) =>
          index === from ? targets.filter((target) => target !== to) : targets,
        );
        const released = releasedSpaces(
          declaredSpaceReferences(referencingSpaces(remaining)),
          [spaceOf(to)],
          META,
        );
        const kept = reachable(remaining);
        const expected = remaining.flatMap((_, index) => (kept.has(index) ? [] : [spaceOf(index)]));
        expect(new Set(released)).toEqual(new Set(expected));
        expect(released).not.toContain(META);
      }),
    );
  });
});
