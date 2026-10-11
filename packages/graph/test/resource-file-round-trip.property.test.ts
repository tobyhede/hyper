import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeTitle, uuidSchema, type Resource } from '@project/core';
import { parseResourceFiles, serializeResource } from '../src/index';

/**
 * `serializeResource` and `parseResourceFiles` are inverses (ADR 0128): every
 * kind's Resource written as its files reads back as the same Resource, a
 * Markdown Resource's source byte for byte through its sidecar.
 */

const uuidArb = fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value));

/**
 * A Title as a stored Resource carries it: normalized, non-empty, and drawn
 * from lines that carry more than one line, blank lines, indents, quotes and
 * backslashes, all of which JSON has to escape.
 */
const titleArb = fc
  .array(
    fc.oneof(
      fc.constant(''),
      fc.constant('  an indented line'),
      fc.constant('"quoted" \\ back\\slashed'),
      fc.constant('---'),
      fc.string({ unit: 'binary', maxLength: 20 }),
    ),
    { minLength: 1, maxLength: 4 },
  )
  .map((lines) => normalizeTitle(lines.join('\n')))
  .filter((title) => title.length > 0);

/**
 * Markdown sources built from arbitrary characters and the lines a frontmatter
 * or line-ending reader would get wrong: a `---` rule, YAML that reads as
 * frontmatter, a carriage return, a blank line. The sidecar holds them all
 * verbatim.
 */
const sourceArb = fc
  .array(
    fc.oneof(
      fc.constant('---'),
      fc.constant('title: not frontmatter'),
      fc.constant(''),
      fc.constant('\r'),
      fc.constant('# A heading'),
      fc.string({ unit: 'binary', maxLength: 30 }),
    ),
    { maxLength: 8 },
  )
  .chain((lines) => fc.constantFrom('', '\n', '\r\n').map((end) => lines.join('\n') + end));

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

/** JSON writes `-0` as `0`, and no framing distinguishes the two. */
const finiteArb = fc.double({ min: -1e6, max: 1e6, noNaN: true }).map((value) => value + 0);

const resourceArb: fc.Arbitrary<Resource> = fc.oneof(
  fc.record({
    id: uuidArb,
    title: titleArb,
    kind: fc.constant('markdown' as const),
    content: fc.record({ source: sourceArb }),
  }),
  fc.record({
    id: uuidArb,
    title: titleArb,
    kind: fc.constant('reference' as const),
    content: fc.record({ target: uuidArb }),
  }),
  // A Space Resource names a Map of its target and a Graph that Map owns from
  // the moment it exists (ADR 0079), so only its framing is optional.
  fc.record({
    id: uuidArb,
    title: titleArb,
    kind: fc.constant('space' as const),
    content: fc.record(
      {
        spaceId: uuidArb,
        map: uuidArb,
        graph: uuidArb,
        framing: fc.record({ centreX: finiteArb, centreY: finiteArb, zoom: dimensionArb }),
      },
      { requiredKeys: ['spaceId', 'map', 'graph'] },
    ),
  }),
  fc.record({
    id: uuidArb,
    title: titleArb,
    kind: fc.constant('image' as const),
    content: fc.record(
      { url: imageUrlArb, naturalSize: fc.record({ width: dimensionArb, height: dimensionArb }) },
      { requiredKeys: ['url'] },
    ),
  }),
  fc.record({
    id: uuidArb,
    title: titleArb,
    kind: fc.constant('ur' as const),
    content: fc.constant({}),
  }),
);

describe('resource file round-trip', () => {
  it('parses back to the resource it was written from', () => {
    fc.assert(
      fc.property(resourceArb, (resource) => {
        const files = serializeResource(resource);
        expect(parseResourceFiles(files)).toEqual({
          ok: true,
          resources: [{ path: `resources/${resource.id}.json`, resource }],
        });
      }),
      { numRuns: 500 },
    );
  });

  it("writes a Markdown Resource's source to its sidecar verbatim", () => {
    fc.assert(
      fc.property(uuidArb, sourceArb, (id, source) => {
        const files = serializeResource({ id, title: 'A', kind: 'markdown', content: { source } });
        expect(files.find(({ path }) => path === `resources/${id}.md`)?.text).toBe(source);
      }),
    );
  });

  it('reads back every Resource of a Space written together', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(resourceArb, { selector: ({ id }) => id, maxLength: 6 }),
        (resources) => {
          const result = parseResourceFiles(resources.flatMap(serializeResource));
          expect(result.ok && result.resources.map(({ resource }) => resource)).toEqual(resources);
        },
      ),
    );
  });
});
