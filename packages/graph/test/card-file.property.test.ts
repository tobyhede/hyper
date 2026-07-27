import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';
import type { CardFrontmatter } from '@project/core';
import { parseCardFile } from '../src/index';

/**
 * Write a card file the way an author would: a fenced frontmatter block, a blank
 * line, then the body. The parser's job is to give both back untouched, whatever
 * the body happens to contain — including a `---` line of its own.
 */
function writeCardFile(frontmatter: CardFrontmatter, body: string): string {
  return `---\n${stringifyYaml(frontmatter)}---\n\n${body}`;
}

// Single-line and non-empty, matching what the schema accepts. Newlines are
// excluded because a multi-line title is a YAML question, not a fence question.
const lineArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim().length > 0 && !s.includes('\n'));

const markdownFrontmatterArb: fc.Arbitrary<CardFrontmatter> = fc.record(
  {
    id: lineArb,
    title: lineArb,
    description: fc.option(lineArb, { nil: undefined }),
    kind: fc.constant('markdown' as const),
  },
  { requiredKeys: ['id', 'title', 'kind'] },
);

const aliasFrontmatterArb: fc.Arbitrary<CardFrontmatter> = fc.record({
  id: lineArb,
  title: lineArb,
  kind: fc.constant('alias' as const),
  target: lineArb,
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

describe('card file round-trip', () => {
  it('gives back the frontmatter it was written with, and the body verbatim', () => {
    const cardFileArb = fc.oneof(
      fc.tuple(markdownFrontmatterArb, bodyArb),
      fc.tuple(aliasFrontmatterArb, fc.constant('')),
    );
    fc.assert(
      fc.property(cardFileArb, ([frontmatter, body]) => {
        const result = parseCardFile({
          path: 'cards/generated.md',
          text: writeCardFile(frontmatter, body),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.card).toEqual(
          frontmatter.kind === 'markdown' ? { ...frontmatter, body } : frontmatter,
        );
      }),
    );
  });
});
