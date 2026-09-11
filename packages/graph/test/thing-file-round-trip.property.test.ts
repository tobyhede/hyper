import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeTitle, uuidSchema, type Thing } from '@project/core';
import { parseThingFile, serializeThingFile } from '../src/index';

/**
 * `serializeThingFile` and `parseThingFile` are inverses, and this is the only
 * thing that keeps them so. The reader is hand-rolled at the fence and the
 * writer is not, so the two could drift in exactly the cases nobody writes an
 * example for — a title with a colon, a body opening with a blank line, a body
 * carrying its own `---`.
 */

/**
 * A Title as a stored Thing carries it: non-empty, and already normalized, so a
 * generated trailing space is not read as a writer/reader drift when intake
 * trims it (ADR 0083). A multi-line Title is the block-scalar question the
 * round trip of `.scratch/card-titles/issues/07` owns.
 */
const line = fc
  .string({ minLength: 1, maxLength: 30 })
  .map(normalizeTitle)
  .filter((s) => s.length > 0 && !s.includes('\n'));

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

const thingArb: fc.Arbitrary<Thing> = fc.oneof(
  fc.record(
    {
      id: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
      title: line,
      kind: fc.constant('markdown' as const),
      body: bodyArb,
    },
    { requiredKeys: ['id', 'title', 'kind', 'body'] },
  ),
  fc.record({
    id: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
    title: line,
    kind: fc.constant('alias' as const),
    target: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
  }),
  fc.record(
    {
      id: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
      title: line,
      kind: fc.constant('space' as const),
      spaceId: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
      diagram: fc.option(
        fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
        { nil: undefined },
      ),
      graph: fc.option(
        fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
        {
          nil: undefined,
        },
      ),
    },
    { requiredKeys: ['id', 'title', 'kind', 'spaceId'] },
  ),
);

describe('thing file round-trip', () => {
  it('parses back to the thing it was written from', () => {
    fc.assert(
      fc.property(thingArb, (thing) => {
        const parsed = parseThingFile({
          path: 'things/generated.md',
          text: serializeThingFile(thing),
        });

        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.thing).toEqual(thing);
      }),
    );
  });
});
