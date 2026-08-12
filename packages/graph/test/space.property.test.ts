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
      id: fc.uuid({ version: 4 }),
      // `cardFile` quotes what it emits, so a title needs no constraint beyond
      // being single-line and non-blank.
      title: fc
        .string({ minLength: 1, maxLength: 12 })
        .filter((s) => s.trim().length > 0 && !s.includes('\n')),
    }),
    { selector: (c) => c.id, minLength: 1, maxLength: 10 },
  )
  .map((cards) => ({ cards, files: cards.map((c) => cardFile(c.id, c.title)) }));

// No layouts, and so no graphs: these properties are about which cards a space
// ends up with, and a layout would only constrain them (ADR 0040).
const emptySpaceFile = {
  version: 1,
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Generated',
};

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
    const forwards = loadSpace(emptySpaceFile, [
      same('00000000-0000-4000-8000-000000000005'),
      same('00000000-0000-4000-8000-000000000002'),
      same('00000000-0000-4000-8000-000000000003'),
    ]);
    const backwards = loadSpace(emptySpaceFile, [
      same('00000000-0000-4000-8000-000000000003'),
      same('00000000-0000-4000-8000-000000000002'),
      same('00000000-0000-4000-8000-000000000005'),
    ]);

    expect(forwards.ok && backwards.ok).toBe(true);
    if (!forwards.ok || !backwards.ok) return;
    expect(forwards.space.cards.map((c) => c.id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000005',
    ]);
    expect(backwards.space.cards.map((c) => c.id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000005',
    ]);
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
