import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeTitle, titleLines, titleName } from '../src/index';

/**
 * Text that reaches every rule normalization has.
 *
 * `fc.string()` alone leaves the property below nearly vacuous: its default
 * alphabet is printable ASCII, so a line break — the whole subject of this
 * feature — never occurs, and neither does the CR the fold exists for. Mixing
 * the separators and the blank runs in by hand is what makes the property say
 * something, and the counters in the test are what keep it saying it.
 */
const rawTitle = fc
  .array(
    fc.oneof(
      fc.string(),
      fc.constantFrom('\n', '\r\n', '\r', ' ', '  ', '\t', 'Auth', 'a session'),
    ),
    { maxLength: 12 },
  )
  .map((parts) => parts.join(''));

describe('normalization is the one rule, and it settles in one pass', () => {
  it('answers a Title that normalizes to itself, reads as its lines, and names its first', () => {
    let multiline = 0;
    let nameless = 0;
    let interiorBlank = 0;

    fc.assert(
      fc.property(rawTitle, (raw) => {
        const normalized = normalizeTitle(raw);

        // Idempotent: what the schema stores is what the schema would store
        // again, so a stored Title never re-normalizes on its next read.
        expect(normalizeTitle(normalized)).toBe(normalized);

        // No carriage return survives, and no line keeps trailing whitespace.
        const lines = normalized.split('\n');
        expect(normalized).not.toContain('\r');
        for (const line of lines) expect(line).toBe(line.trimEnd());

        // No leading or trailing blank line. A Title that normalizes to nothing
        // is the one exception, and it is the case the schema refuses.
        if (normalized.length > 0) {
          expect(lines.at(0)).not.toBe('');
          expect(lines.at(-1)).not.toBe('');
        }

        // The lines are the Title's, in order, at the ladder's roles.
        const read = titleLines(normalized);
        expect(read.map((line) => line.text)).toEqual(lines);
        expect(read.map((line) => line.role)).toEqual(
          lines.map((_line, index) =>
            index === 0 ? 'title' : index === 1 ? 'subtitle' : 'caption',
          ),
        );

        // The name is the first line, which is why nobody indexes for it.
        expect(titleName(normalized)).toBe(read[0]?.text);

        if (lines.length > 1) multiline += 1;
        if (normalized.length === 0) nameless += 1;
        if (lines.slice(1, -1).includes('')) interiorBlank += 1;
      }),
      { numRuns: 500 },
    );

    /*
     * The counters, after the property, because a generator that never reaches
     * a case still satisfies every assertion about it. Each of these is a rule
     * with its own branch — the ladder past its second rung, the refusal the
     * schema owes a code, and the blank line normalization deliberately keeps.
     */
    expect({
      multiline: multiline > 0,
      nameless: nameless > 0,
      interiorBlank: interiorBlank > 0,
    }).toEqual({ multiline: true, nameless: true, interiorBlank: true });
  });
});
