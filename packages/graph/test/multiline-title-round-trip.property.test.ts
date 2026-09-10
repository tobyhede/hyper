import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeTitle, titleLines, type Card } from '@project/core';
import { parseCardFile, serializeCardFile } from '../src/index';
import { uuid } from './card-files';

/**
 * A multiline Title survives a Card file round trip (ADR 0083).
 *
 * The newlines in a Title are load-bearing — the first line names the Card and
 * the lines after it qualify it — and the only thing between an authored Title
 * and a stored one is `stringify`/`parse` inside the frontmatter fence. The
 * `yaml` package writes a multiline string as a block scalar, so this is
 * expected to hold rather than expected to break, which is exactly why it needs
 * a test: when it stops holding, the aggregate import/export round trip will go
 * red somewhere else entirely and say nothing about why.
 *
 * So the assertions here compare Title *Lines* rather than Titles. A dropped
 * blank line, a swallowed indent or a line the fence ate then reads as a diff
 * of one entry against another, with the role each line carries beside it,
 * rather than as two long strings a reader has to align by eye.
 */

const ID = uuid('00000000-0000-4000-8000-000000000101');
const TARGET = uuid('00000000-0000-4000-8000-000000000102');
const SPACE_ID = uuid('00000000-0000-4000-8000-000000000103');
const LAYOUT_ID = uuid('00000000-0000-4000-8000-000000000104');
const GRAPH_ID = uuid('00000000-0000-4000-8000-000000000105');

type CardKind = Card['kind'];

const EVERY_KIND: readonly CardKind[] = ['markdown', 'alias', 'space'];

/**
 * The same Title on each Card kind. Every kind writes its Title through the one
 * `cardTitleSchema`, so a Title that only survived on a Markdown Card would be
 * a fence or a field-order fault rather than a schema one — which is a thing
 * only writing all three out can tell us.
 */
function cardOf(kind: CardKind, title: string): Card {
  switch (kind) {
    case 'markdown':
      return { id: ID, title, kind, body: 'The body, which is not the Title.\n' };
    case 'alias':
      return { id: ID, title, kind, target: TARGET };
    case 'space':
      return { id: ID, title, kind, spaceId: SPACE_ID, layout: LAYOUT_ID, graph: GRAPH_ID };
  }
}

/**
 * The Title the Card file gives back, or a failure naming the file that failed.
 *
 * A round trip that does not even parse is the more likely break of the two —
 * a block scalar whose indentation the fence reader mistakes for the closing
 * `---` produces errors, not a mangled string — so the file itself goes into
 * the message. Reading it is how anyone tells the two apart.
 */
function roundTrippedTitle(card: Card): string {
  const text = serializeCardFile(card);
  const parsed = parseCardFile({ path: 'cards/multiline-title.md', text });
  if (!parsed.ok) {
    const errors = parsed.errors.map((error) => error.message).join('\n');
    throw new Error(`this Card file did not parse back:\n${text}\n${errors}`);
  }
  return parsed.card.title;
}

function expectTitleSurvives(kind: CardKind, title: string): void {
  expect(titleLines(roundTrippedTitle(cardOf(kind, title)))).toEqual(titleLines(title));
}

describe('a multiline Title survives a Card file round trip', () => {
  it.each(EVERY_KIND)('keeps all three lines of a three-line Title on a %s Card', (kind) => {
    expectTitleSurvives(kind, 'The data model\nHow a Card is stored\nADR 0020, ADR 0083');
  });

  it.each(EVERY_KIND)('keeps an interior blank line on a %s Card', (kind) => {
    // The one shape normalization deliberately preserves — an author who left a
    // gap meant it — and the one a block scalar is most likely to lose, since a
    // blank line inside one is written with no indentation at all.
    expectTitleSurvives(kind, 'The data model\n\nADR 0020');
  });

  it.each(EVERY_KIND)('keeps the leading spaces on a line of a %s Card', (kind) => {
    // Leading whitespace is a line's own and normalization leaves it alone. A
    // block scalar spends indentation on its own nesting, so the writer has to
    // say how much of it is the scalar's and how much is the author's.
    expectTitleSurvives(kind, 'The data model\n  How a Card is stored\n    ADR 0020');
  });

  it.each(EVERY_KIND)('keeps a leading space on the first line of a %s Card', (kind) => {
    // The first line is the case that needs an explicit indentation indicator
    // (`|2-`): without one a reader takes the deepest common indent as the
    // scalar's own and every line loses two spaces.
    expectTitleSurvives(kind, '  The data model\nHow a Card is stored');
  });

  it.each(EVERY_KIND)('keeps Title Lines that read as YAML syntax on a %s Card', (kind) => {
    // A leading `-` is a sequence entry, a trailing `:` is a mapping key, `---`
    // is a document break and `#` opens a comment. Inside a block scalar all
    // four are text, and this is what says so.
    expectTitleSurvives(kind, '- The data model\nHow a Card is stored:\n---\n# ADR 0020');
  });
});

/**
 * Title Lines drawn from the shapes that make a YAML writer or a fence reader
 * wrong. Left to `fc.string()` alone the generator would essentially never emit
 * a blank line, an indent or a `---`, and the property would pass without ever
 * reaching the cases it exists for. The whitespace-only and trailing-whitespace
 * members are there to be *normalized away*, so the property's precondition is
 * doing work rather than decorating it.
 */
const titleLineArb = fc.oneof(
  fc.constant(''),
  fc.constant(''),
  fc.constant('   '),
  fc.constant('  an indented line'),
  fc.constant('\ta tabbed line'),
  fc.constant('- a sequence entry'),
  fc.constant('a mapping key:'),
  fc.constant('---'),
  fc.constant('# a comment'),
  fc.constant('trailing whitespace   '),
  fc.string({ maxLength: 24 }).filter((line) => !line.includes('\n')),
);

/** A Title as an author might have typed it, before the schema normalizes it. */
const drawnTitleArb = fc
  .array(titleLineArb, { minLength: 1, maxLength: 6 })
  .chain((lines) => fc.constantFrom('\n', '\r\n').map((lineBreak) => lines.join(lineBreak)));

const kindArb: fc.Arbitrary<CardKind> = fc.constantFrom(...EVERY_KIND);

/**
 * How many generated Titles carried each of the cases the examples above name.
 *
 * A property whose generator only ever drew single-line Titles would pass and
 * prove nothing, and nothing in a green run says which it was. These counts are
 * asserted after the property, so the generator is held to reaching the cases
 * as firmly as the round trip is held to surviving them.
 */
interface CasesReached {
  moreThanOneLine: number;
  anInteriorBlankLine: number;
  aLineWithLeadingWhitespace: number;
  aLineThatReadsAsYamlSyntax: number;
  aTitleNormalizationChanged: number;
}

const readsAsYamlSyntax = (line: string): boolean =>
  line.startsWith('-') || line.startsWith('#') || line.endsWith(':');

describe('the property over generated Titles', () => {
  it('round-trips any Title that survives normalization', () => {
    const reached: CasesReached = {
      moreThanOneLine: 0,
      anInteriorBlankLine: 0,
      aLineWithLeadingWhitespace: 0,
      aLineThatReadsAsYamlSyntax: 0,
      aTitleNormalizationChanged: 0,
    };

    fc.assert(
      fc.property(drawnTitleArb, kindArb, (drawn, kind) => {
        const title = normalizeTitle(drawn);
        // A Title that normalizes to nothing carries no name and the schema
        // refuses it, so there is no stored Card for it to round-trip as.
        fc.pre(title.length > 0);

        const lines = title.split('\n');
        if (lines.length > 1) reached.moreThanOneLine += 1;
        if (title.includes('\n\n')) reached.anInteriorBlankLine += 1;
        if (lines.some((line) => /^[ \t]/u.test(line))) reached.aLineWithLeadingWhitespace += 1;
        if (lines.some(readsAsYamlSyntax)) reached.aLineThatReadsAsYamlSyntax += 1;
        if (drawn !== title) reached.aTitleNormalizationChanged += 1;

        expect(titleLines(roundTrippedTitle(cardOf(kind, title)))).toEqual(titleLines(title));
      }),
      { numRuns: 1000 },
    );

    const missed = Object.entries(reached)
      .filter(([, count]) => count === 0)
      .map(([caseName]) => caseName);
    expect(missed).toEqual([]);
  });
});
