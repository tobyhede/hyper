import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadSpace } from '../src/index';
import { cardFile } from './card-files';

/**
 * Cards come from files now (ADR 0020), so the set a space ends up with is
 * decided by which files were handed in — never by the space file, and never by
 * the order they arrived. Distinct ids, arbitrary titles, arbitrary order in.
 */
const cardsArb = fc
  .uniqueArray(
    fc.record({
      // Ids as they are actually written: a leading letter, then slug
      // characters. Unconstrained, the generator emits `0` and `-`, which YAML
      // reads as a number and as null — pinned in `card-file.test.ts`.
      id: fc.string({ minLength: 1, maxLength: 8 }).filter((s) => /^[a-z][a-z0-9-]*$/.test(s)),
      // `cardFile` quotes what it emits, so a title needs no constraint beyond
      // being single-line and non-blank.
      title: fc
        .string({ minLength: 1, maxLength: 12 })
        .filter((s) => s.trim().length > 0 && !s.includes('\n')),
    }),
    { selector: (c) => c.id, minLength: 1, maxLength: 10 },
  )
  .map((cards) => ({ cards, files: cards.map((c) => cardFile(c.id, c.title)) }));

const emptySpaceFile = { version: 1, id: 's', title: 'Generated', routes: [] };

describe('loadSpace over card files', () => {
  it('loads exactly the cards it was handed, ordered by title', () => {
    fc.assert(
      fc.property(cardsArb, ({ cards, files }) => {
        const result = loadSpace(emptySpaceFile, files);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // The same set: nothing dropped, nothing invented.
        const loaded = result.space.cards;
        expect(loaded.map((c) => c.id).sort()).toEqual(cards.map((c) => c.id).sort());

        // Ordered by title, whatever order the files arrived in.
        const titles = loaded.map((c) => c.title);
        expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
      }),
    );
  });

  it('breaks a title tie on id, so two cards sharing a title still order totally', () => {
    // Sorting by title alone is *stable*, not total: cards with equal titles keep
    // the order they arrived in, which is the directory's. That would make the
    // arrangement depend on scan order — the thing the sort exists to prevent.
    const same = (id: string) => cardFile(id, 'Same title');
    const forwards = loadSpace(emptySpaceFile, [same('c'), same('a'), same('b')]);
    const backwards = loadSpace(emptySpaceFile, [same('b'), same('a'), same('c')]);

    expect(forwards.ok && backwards.ok).toBe(true);
    if (!forwards.ok || !backwards.ok) return;
    expect(forwards.space.cards.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(backwards.space.cards.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('is indifferent to the order the files arrive in', () => {
    fc.assert(
      fc.property(cardsArb, ({ files }) => {
        const forwards = loadSpace(emptySpaceFile, files);
        const backwards = loadSpace(emptySpaceFile, [...files].reverse());
        expect(forwards.ok && backwards.ok).toBe(true);
        if (!forwards.ok || !backwards.ok) return;
        expect(forwards.space.cards.map((c) => c.id)).toEqual(
          backwards.space.cards.map((c) => c.id),
        );
      }),
    );
  });
});
