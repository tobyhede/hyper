import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeTitle, titleLines, type Resource } from '@project/core';
import { parseResourceFiles, serializeResource } from '../src/index';
import { uuid } from './resource-files';

/**
 * A multiline Title survives a Resource file round trip (ADR 0083).
 *
 * The newlines in a Title are load-bearing — the first line names the Resource and
 * the lines after it qualify it — and the only transformation between an authored Title
 * and a stored one is the Resource file's JSON string and the schema's
 * normalization. When it stops holding, the aggregate import/export round trip
 * will go red somewhere else entirely and say nothing about why.
 *
 * So the assertions here compare Title *Lines* rather than Titles. A dropped
 * blank line, a swallowed indent or a mis-escaped character then reads as a diff
 * of one entry against another, with the role each line carries beside it,
 * rather than as two long strings a reader has to align by eye.
 */

const ID = uuid('00000000-0000-4000-8000-000000000101');
const TARGET = uuid('00000000-0000-4000-8000-000000000102');
const SPACE_ID = uuid('00000000-0000-4000-8000-000000000103');
const MAP_ID = uuid('00000000-0000-4000-8000-000000000104');
const GRAPH_ID = uuid('00000000-0000-4000-8000-000000000105');

type ResourceKind = Resource['kind'];

const EVERY_KIND: readonly ResourceKind[] = ['markdown', 'reference', 'space', 'image', 'ur'];

/**
 * The same Title on each Resource kind. Every kind writes its Title through the one
 * `resourceTitleSchema`, so a Title that only survived on a Markdown Resource would be
 * a codec fault rather than a schema one — which is a result only writing
 * every kind out can tell us.
 */
function resourceOf(kind: ResourceKind, title: string): Resource {
  switch (kind) {
    case 'markdown':
      return { id: ID, title, kind, content: { source: 'The body, which is not the Title.\n' } };
    case 'reference':
      return { id: ID, title, kind, content: { target: TARGET } };
    case 'space':
      return { id: ID, title, kind, content: { spaceId: SPACE_ID, map: MAP_ID, graph: GRAPH_ID } };
    case 'image':
      return { id: ID, title, kind, content: { url: 'https://example.com/figure.png' } };
    case 'ur':
      return { id: ID, title, kind, content: {} };
  }
}

/**
 * The Title the Resource files give back, or a failure naming the files that
 * failed, so a round trip that does not parse at all shows what was written.
 */
function roundTrippedTitle(resource: Resource): string {
  const files = serializeResource(resource);
  const parsed = parseResourceFiles(files);
  if (!parsed.ok) {
    const written = files.map(({ path, text }) => `${path}:\n${text}`).join('\n');
    const errors = parsed.errors.map((error) => error.message).join('\n');
    throw new Error(`these Resource files did not parse back:\n${written}\n${errors}`);
  }
  const [decoded] = parsed.resources;
  if (decoded === undefined) throw new Error('no Resource parsed back');
  return decoded.resource.title;
}

function expectTitleSurvives(kind: ResourceKind, title: string): void {
  expect(titleLines(roundTrippedTitle(resourceOf(kind, title)))).toEqual(titleLines(title));
}

describe('a multiline Title survives a Resource file round trip', () => {
  it.each(EVERY_KIND)('keeps all three lines of a three-line Title on a %s Resource', (kind) => {
    expectTitleSurvives(kind, 'The data model\nHow a Resource is stored\nADR 0020, ADR 0083');
  });

  it.each(EVERY_KIND)('keeps an interior blank line on a %s Resource', (kind) => {
    // The one shape normalization deliberately preserves — an author who left a
    // gap meant it.
    expectTitleSurvives(kind, 'The data model\n\nADR 0020');
  });

  it.each(EVERY_KIND)('keeps the leading spaces on a line of a %s Resource', (kind) => {
    // Leading whitespace is a line's own and normalization leaves it alone.
    expectTitleSurvives(kind, 'The data model\n  How a Resource is stored\n    ADR 0020');
  });

  it.each(EVERY_KIND)('keeps a leading space on the first line of a %s Resource', (kind) => {
    // Normalization trims blank lines from the ends of a Title, never the
    // leading spaces of its first line.
    expectTitleSurvives(kind, '  The data model\nHow a Resource is stored');
  });

  it.each(EVERY_KIND)('keeps Title Lines that JSON has to escape on a %s Resource', (kind) => {
    // Quotes, backslashes and a tab are each written as an escape in the
    // Resource file's JSON string, and read back as themselves.
    expectTitleSurvives(kind, '"The data model"\nC:\\Resources\\stored\n\tADR 0020 \\n');
  });
});

/**
 * Title Lines drawn from the shapes that make a writer or a reader of Titles
 * wrong. Left to `fc.string()` alone the generator would essentially never emit
 * a blank line, an indent or an escaped character, and the property would pass without ever
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
  fc.constant('"a quoted line"'),
  fc.constant('a back\\slash'),
  fc.constant('\u2028a line separator'),
  fc.constant('---'),
  fc.constant('trailing whitespace   '),
  fc.string({ maxLength: 24 }).filter((line) => !line.includes('\n')),
);

/** A Title as an author might have typed it, before the schema normalizes it. */
const drawnTitleArb = fc
  .array(titleLineArb, { minLength: 1, maxLength: 6 })
  .chain((lines) => fc.constantFrom('\n', '\r\n').map((lineBreak) => lines.join(lineBreak)));

const kindArb: fc.Arbitrary<ResourceKind> = fc.constantFrom(...EVERY_KIND);

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
  aLineJsonEscapes: number;
  aTitleNormalizationChanged: number;
}

const jsonEscapes = (line: string): boolean => JSON.stringify(line) !== `"${line}"`;

describe('the property over generated Titles', () => {
  it('round-trips any Title that survives normalization', () => {
    const reached: CasesReached = {
      moreThanOneLine: 0,
      anInteriorBlankLine: 0,
      aLineWithLeadingWhitespace: 0,
      aLineJsonEscapes: 0,
      aTitleNormalizationChanged: 0,
    };

    fc.assert(
      fc.property(drawnTitleArb, kindArb, (drawn, kind) => {
        const title = normalizeTitle(drawn);
        // A Title that normalizes to nothing carries no name and the schema
        // refuses it, so there is no stored Resource for it to round-trip as.
        fc.pre(title.length > 0);

        const lines = title.split('\n');
        if (lines.length > 1) reached.moreThanOneLine += 1;
        if (title.includes('\n\n')) reached.anInteriorBlankLine += 1;
        if (lines.some((line) => /^[ \t]/u.test(line))) reached.aLineWithLeadingWhitespace += 1;
        if (lines.some(jsonEscapes)) reached.aLineJsonEscapes += 1;
        if (drawn !== title) reached.aTitleNormalizationChanged += 1;

        expect(titleLines(roundTrippedTitle(resourceOf(kind, title)))).toEqual(titleLines(title));
      }),
      { numRuns: 1000 },
    );

    const missed = Object.entries(reached)
      .filter(([, count]) => count === 0)
      .map(([caseName]) => caseName);
    expect(missed).toEqual([]);
  });
});
