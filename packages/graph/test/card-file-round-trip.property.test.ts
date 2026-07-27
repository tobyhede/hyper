import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Card } from '@project/core';
import { parseCardFile, serializeCardFile } from '../src/index';

/**
 * `serializeCardFile` and `parseCardFile` are inverses, and this is the only
 * thing that keeps them so. The reader is hand-rolled at the fence and the
 * writer is not, so the two could drift in exactly the cases nobody writes an
 * example for — a title with a colon, a body opening with a blank line, a body
 * carrying its own `---`.
 */

const line = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0 && !s.includes('\n'));

/** Bodies built from the lines that make a fence parser wrong. */
const bodyArb = fc
  .array(
    fc.oneof(
      fc.constant('---'),
      fc.constant(''),
      fc.constant('# A heading'),
      fc.string({ maxLength: 20 }).filter((s) => !s.includes('\n')),
    ),
    { maxLength: 8 },
  )
  .map((lines) => lines.join('\n'));

const cardArb: fc.Arbitrary<Card> = fc.oneof(
  fc.record(
    {
      id: line,
      title: line,
      description: fc.option(line, { nil: undefined }),
      kind: fc.constant('markdown' as const),
      body: bodyArb,
    },
    { requiredKeys: ['id', 'title', 'kind', 'body'] },
  ),
  fc.record({
    id: line,
    title: line,
    kind: fc.constant('alias' as const),
    target: line,
  }),
);

describe('card file round-trip', () => {
  it('parses back to the card it was written from', () => {
    fc.assert(
      fc.property(cardArb, (card) => {
        const parsed = parseCardFile({
          path: 'cards/generated.md',
          text: serializeCardFile(card),
        });

        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.card).toEqual(card);
      }),
    );
  });
});
