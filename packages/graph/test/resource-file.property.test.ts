import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Resource } from '@project/core';
import { parseResourceFiles, type ResourceFile } from '../src/index';
import type { Json } from './resource-files';

/**
 * A Resource file as an author writes it by hand, rather than as
 * `serializeResource` does: keys in any order, any indentation, the media type
 * in any case, and the file under any name, since identity is inside the file
 * and never its name (ADR 0128). Intake reads every such file as the same
 * Resource, and a Markdown Resource's source as its sidecar holds it.
 */

const uuidArb = fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value));

const titleArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter(
    (title) => title.trim().length > 0 && title === title.trimEnd() && !/[\r\n]/u.test(title),
  );

/** Sources built from the lines that make a frontmatter or line-ending reader wrong. */
const sourceArb = fc
  .array(
    fc.oneof(
      fc.constant('---'),
      fc.constant('kind: ur'),
      fc.constant(''),
      fc.constant('# A heading'),
      fc.string({ maxLength: 20 }),
    ),
    { maxLength: 8 },
  )
  .chain((lines) => fc.constantFrom('\n', '\r\n').map((lineBreak) => lines.join(lineBreak)));

/** `text/markdown` with each letter's case drawn independently. */
const mediaTypeArb = fc
  .array(fc.boolean(), { minLength: 13, maxLength: 13 })
  .map((upper) =>
    Array.from('text/markdown', (char, index) => (upper[index] ? char.toUpperCase() : char)).join(
      '',
    ),
  );

/** An object's entries in a drawn order, which JSON keeps. */
const shuffled = (value: Record<string, Json>): fc.Arbitrary<Record<string, Json>> =>
  fc
    .shuffledSubarray(Object.entries(value), { minLength: Object.keys(value).length })
    .map((entries) => Object.fromEntries(entries));

const indentArb = fc.constantFrom(0, 1, 2, 4, '\t');

const fileNameArb = fc.stringMatching(/^[a-z0-9-]{1,12}$/u);

interface Authored {
  readonly files: readonly ResourceFile[];
  readonly resource: Resource;
}

const authoredArb: fc.Arbitrary<Authored> = fc
  .record({
    id: uuidArb,
    title: titleArb,
    source: sourceArb,
    mediaType: mediaTypeArb,
    indent: indentArb,
    name: fileNameArb,
  })
  .chain(({ id, title, source, mediaType, indent, name }) =>
    shuffled({ path: `${id}.md`, mediaType })
      .chain((content) => shuffled({ id, title, kind: 'markdown', content }))
      .map((envelope) => ({
        files: [
          { path: `resources/${name}.json`, text: JSON.stringify(envelope, null, indent) },
          { path: `resources/${id}.md`, text: source },
        ],
        resource: { id, title, kind: 'markdown', content: { source } },
      })),
  );

describe('a hand-written Resource file', () => {
  it('reads as its Resource, with the sidecar as its source verbatim', () => {
    fc.assert(
      fc.property(authoredArb, ({ files, resource }) => {
        const result = parseResourceFiles(files);
        expect(result.ok && result.resources.map((decoded) => decoded.resource)).toEqual([
          resource,
        ]);
      }),
    );
  });
});
