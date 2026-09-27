import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeTitle, uuidSchema, type Resource } from '@project/core';
import { parseResourceFile, serializeResourceFile } from '../src/index';

/**
 * `serializeResourceFile` and `parseResourceFile` are inverses, and this is the only
 * evidence that keeps them so. The reader is hand-rolled at the fence and the
 * writer is not, so the two could drift in exactly the cases nobody writes an
 * example for — a title with a colon, a body opening with a blank line, a body
 * carrying its own `---`.
 */

/**
 * A Title as a stored Resource carries it: non-empty, and already normalized, so a
 * generated trailing space is not read as a writer/reader drift when intake
 * trims it (ADR 0083). A multi-line Title is the block-scalar question
 * `multiline-title-round-trip.property.test.ts` owns.
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

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * The URLs an Image Resource may hold (ADR 0106): a web URL, or the
 * `/images/<id>` of a stored image, whose last character carries two zero bits.
 */
const imageUrlArb = fc.oneof(
  fc.webUrl({ validSchemes: ['https', 'http'], withQueryParameters: true, withFragments: true }),
  fc
    .tuple(
      fc.string({ unit: fc.constantFrom(...Array.from(BASE64URL)), minLength: 42, maxLength: 42 }),
      fc.constantFrom(...Array.from('AEIMQUYcgkosw048')),
    )
    .map(([head, last]) => `/images/${head}${last}`),
);

const dimensionArb = fc.double({ min: 1e-6, max: 1e6, noNaN: true });

const resourceArb: fc.Arbitrary<Resource> = fc.oneof(
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
    kind: fc.constant('reference' as const),
    target: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
  }),
  // Every field of a Space Resource is always written, its selection included: a
  // Space Resource names a Map of its target and a Graph that Map owns
  // from the moment it exists (ADR 0079), so there is no absent-selection case
  // for the round trip to carry.
  fc.record({
    id: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
    title: line,
    kind: fc.constant('space' as const),
    spaceId: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
    map: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
    graph: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
  }),
  fc.record(
    {
      id: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
      title: line,
      kind: fc.constant('image' as const),
      url: imageUrlArb,
      naturalSize: fc.record({ width: dimensionArb, height: dimensionArb }),
    },
    { requiredKeys: ['id', 'title', 'kind', 'url'] },
  ),
);

describe('resource file round-trip', () => {
  it('parses back to the resource it was written from', () => {
    fc.assert(
      fc.property(resourceArb, (resource) => {
        const parsed = parseResourceFile({
          path: 'resources/generated.md',
          text: serializeResourceFile(resource),
        });

        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.resource).toEqual(resource);
      }),
    );
  });
});
