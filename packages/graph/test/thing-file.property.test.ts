import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';
import { normalizeTitle, uuidSchema, type ThingFrontmatter } from '@project/core';
import { parseThingFile } from '../src/index';

/**
 * Write a thing file the way an author would: a fenced frontmatter block, a blank
 * line, then the body. The parser's job is to give both back untouched, whatever
 * the body happens to contain — including a `---` line of its own.
 */
function writeThingFile(frontmatter: ThingFrontmatter, body: string): string {
  return `---\n${stringifyYaml(frontmatter)}---\n\n${body}`;
}

// A Title as a stored Thing carries it: non-empty, and already normalized, so a
// generated trailing space is not read as a fence fault when intake trims it
// (ADR 0083). Newlines are excluded because a multi-line Title is a YAML
// question, not a fence question.
const lineArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .map(normalizeTitle)
  .filter((s) => s.length > 0 && !s.includes('\n'));

const markdownFrontmatterArb: fc.Arbitrary<ThingFrontmatter> = fc.record(
  {
    id: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
    title: lineArb,
    kind: fc.constant('markdown' as const),
  },
  { requiredKeys: ['id', 'title', 'kind'] },
);

const aliasFrontmatterArb: fc.Arbitrary<ThingFrontmatter> = fc.record({
  id: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
  title: lineArb,
  kind: fc.constant('alias' as const),
  target: fc.uuid({ version: 4 }).map((value) => uuidSchema.parse(value)),
});

/**
 * Bodies built from the lines that make a fence parser wrong: a `---` rule, a
 * heading, a blank line, arbitrary prose. Left to `fc.string()` alone the
 * generator would essentially never emit `---` on its own line, and the property
 * would pass without ever testing the thing it is here to test.
 */
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
  .chain((lines) => fc.constantFrom(...['', '\n']).map((trailing) => lines.join('\n') + trailing));

describe('thing file round-trip', () => {
  it('gives back the frontmatter it was written with, and the body verbatim', () => {
    const thingFileArb = fc.oneof(
      fc.tuple(markdownFrontmatterArb, bodyArb),
      fc.tuple(aliasFrontmatterArb, fc.constant('')),
    );
    fc.assert(
      fc.property(thingFileArb, ([frontmatter, body]) => {
        const result = parseThingFile({
          path: 'things/generated.md',
          text: writeThingFile(frontmatter, body),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.thing).toEqual(
          frontmatter.kind === 'markdown' ? { ...frontmatter, body } : frontmatter,
        );
      }),
    );
  });
});
