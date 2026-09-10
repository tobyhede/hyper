import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadSpace } from '../src/index';
import { thingFile } from './thing-files';

/**
 * Things come from files now (ADR 0020), so the set a space ends up with is
 * decided by which files were handed in — never by the space file, and never by
 * the order they arrived. Distinct ids, arbitrary titles, arbitrary order in.
 */
const thingsArb = fc
  .uniqueArray(
    fc.record({
      id: fc.uuid({ version: 4 }),
      // `thingFile` quotes what it emits, so a title needs no constraint beyond
      // being single-line and non-blank.
      title: fc
        .string({ minLength: 1, maxLength: 12 })
        .filter((s) => s.trim().length > 0 && !s.includes('\n')),
    }),
    { selector: (t) => t.id, minLength: 1, maxLength: 10 },
  )
  .map((things) => ({ things, files: things.map((t) => thingFile(t.id, t.title)) }));

// No diagrams, and so no graphs: these properties are about which things a space
// ends up with, and a diagram would only constrain them (ADR 0040).
const emptySpaceFile = {
  version: 1,
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Generated',
};

describe('loadSpace over thing files', () => {
  it('loads exactly the things it was handed, ordered by title', () => {
    fc.assert(
      fc.property(thingsArb, ({ things, files }) => {
        const result = loadSpace(emptySpaceFile, files);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // The same set: nothing dropped, nothing invented.
        const loaded = result.space.things;
        expect(loaded.map((t) => t.id).sort()).toEqual(things.map((t) => t.id).sort());

        // Ordered by title, whatever order the files arrived in.
        const titles = loaded.map((t) => t.title);
        expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
      }),
    );
  });

  it('breaks a title tie on id, so two things sharing a title still order totally', () => {
    // Sorting by title alone is *stable*, not total: things with equal titles keep
    // the order they arrived in, which is the directory's. That would make the
    // resulting order depend on scan order — the thing the sort exists to prevent.
    const same = (id: string) => thingFile(id, 'Same title');
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
    expect(forwards.space.things.map((t) => t.id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000005',
    ]);
    expect(backwards.space.things.map((t) => t.id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000005',
    ]);
  });

  it('is indifferent to the order the files arrive in', () => {
    fc.assert(
      fc.property(thingsArb, ({ files }) => {
        const forwards = loadSpace(emptySpaceFile, files);
        const backwards = loadSpace(emptySpaceFile, [...files].reverse());
        expect(forwards.ok && backwards.ok).toBe(true);
        if (!forwards.ok || !backwards.ok) return;
        expect(forwards.space.things.map((t) => t.id)).toEqual(
          backwards.space.things.map((t) => t.id),
        );
      }),
    );
  });
});
