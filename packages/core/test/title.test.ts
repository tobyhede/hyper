import { describe, expect, it } from 'vitest';
import type { ZodIssue, ZodType, ZodTypeDef } from 'zod';
import {
  THING_TITLE_REQUIRED,
  aliasThingFrontmatterSchema,
  thingDocumentSchema,
  thingFrontmatterSchema,
  thingSchema,
  graphSchema,
  importAliasThingFrontmatterSchema,
  importThingFrontmatterSchema,
  importMarkdownThingFrontmatterSchema,
  importSpaceThingFrontmatterSchema,
  markdownThingFrontmatterSchema,
  normalizeTitle,
  positionedDiagramSchema,
  spaceThingFrontmatterSchema,
  spaceFileSchema,
  titleLines,
  titleName,
} from '../src/index';

const THING_ID = '00000000-0000-4000-8000-000000000001';
const TARGET_ID = '00000000-0000-4000-8000-000000000002';
const SPACE_ID = '00000000-0000-4000-8000-000000000003';
const DIAGRAM_ID = '00000000-0000-4000-8000-000000000004';
const GRAPH_ID = '00000000-0000-4000-8000-000000000005';

/**
 * Any schema that reads a Thing's Title, written so the three kinds and the
 * three unions can sit in one list. Only the Title is under test here, so what
 * each one answers with is `unknown` and the assertions read the Title off it.
 */
type ThingTitleSchema = ZodType<unknown, ZodTypeDef, unknown>;

/**
 * A Thing frontmatter as it arrives at a schema, before one has read it: every
 * field a Thing of any kind declares is written down, and all of them are text.
 */
type ThingFrontmatterDraft = Readonly<Record<string, string>>;

const markdownFrontmatter = (title: string) => ({
  id: THING_ID,
  title,
  kind: 'markdown',
  body: '',
});
const aliasFrontmatter = (title: string) => ({
  id: THING_ID,
  title,
  kind: 'alias',
  target: TARGET_ID,
});
const spaceFrontmatter = (title: string) => ({
  id: THING_ID,
  title,
  kind: 'space',
  spaceId: SPACE_ID,
  diagram: DIAGRAM_ID,
  graph: GRAPH_ID,
});

/** The schemas that read one Thing kind, each beside the frontmatter it reads. */
const kindSchemas: readonly {
  readonly label: string;
  readonly schema: ThingTitleSchema;
  readonly frontmatter: (title: string) => ThingFrontmatterDraft;
}[] = [
  {
    label: 'markdown thing',
    schema: markdownThingFrontmatterSchema,
    frontmatter: markdownFrontmatter,
  },
  { label: 'alias thing', schema: aliasThingFrontmatterSchema, frontmatter: aliasFrontmatter },
  { label: 'space thing', schema: spaceThingFrontmatterSchema, frontmatter: spaceFrontmatter },
  {
    label: 'imported markdown thing',
    schema: importMarkdownThingFrontmatterSchema,
    frontmatter: markdownFrontmatter,
  },
  {
    label: 'imported alias thing',
    schema: importAliasThingFrontmatterSchema,
    frontmatter: aliasFrontmatter,
  },
  {
    label: 'imported space thing',
    schema: importSpaceThingFrontmatterSchema,
    frontmatter: spaceFrontmatter,
  },
];

/** The unions and the stored document, each of which reads every kind. */
const unionSchemas: readonly { readonly label: string; readonly schema: ThingTitleSchema }[] = [
  { label: 'thing frontmatter', schema: thingFrontmatterSchema },
  { label: 'thing', schema: thingSchema },
  { label: 'thing document', schema: thingDocumentSchema },
  { label: 'imported thing frontmatter', schema: importThingFrontmatterSchema },
];

/**
 * Every door a Thing's Title arrives through, carrying one Title.
 *
 * A rule that reaches only the three declared shapes is visibly not the rule at
 * every door: the union, the stored document and the import variants have to
 * answer the same way, which is what makes a stored Title and an imported one
 * the same Title.
 */
const titleCases = (
  title: string,
): readonly {
  readonly label: string;
  readonly schema: ThingTitleSchema;
  readonly value: ThingFrontmatterDraft;
}[] => [
  ...kindSchemas.map(({ label, schema, frontmatter }) => ({
    label,
    schema,
    value: frontmatter(title),
  })),
  ...unionSchemas.flatMap(({ label, schema }) =>
    [markdownFrontmatter, aliasFrontmatter, spaceFrontmatter].map((frontmatter) => ({
      label,
      schema,
      value: frontmatter(title),
    })),
  ),
];

/**
 * Whether a refusal carries the domain's stable identity for a Title with no
 * name.
 *
 * Read off the custom issue's `params` rather than its `message`, because the
 * message is prose the application owns and the code is what the domain
 * promises (ADR 0057).
 */
const refusesNamelessTitle = (issues: readonly ZodIssue[]): boolean =>
  issues.some(
    (issue) => issue.code === 'custom' && issue.params?.['code'] === THING_TITLE_REQUIRED,
  );

describe('a Title is one or more Title Lines', () => {
  it('gives a single-line Title one line at the title role', () => {
    expect(titleLines('Auth')).toEqual([{ role: 'title', text: 'Auth' }]);
  });

  it('gives the second line the subtitle role and the third the caption role', () => {
    expect(titleLines('Auth\nHow a session begins\nOAuth only')).toEqual([
      { role: 'title', text: 'Auth' },
      { role: 'subtitle', text: 'How a session begins' },
      { role: 'caption', text: 'OAuth only' },
    ]);
  });

  it('has no fourth role and no cap: every line after the third is a caption too', () => {
    expect(titleLines('one\ntwo\nthree\nfour\nfive\nsix').map((line) => line.role)).toEqual([
      'title',
      'subtitle',
      'caption',
      'caption',
      'caption',
      'caption',
    ]);
  });

  it('keeps an interior blank line as a Title Line of its own', () => {
    expect(titleLines('Auth\n\nOAuth only')).toEqual([
      { role: 'title', text: 'Auth' },
      { role: 'subtitle', text: '' },
      { role: 'caption', text: 'OAuth only' },
    ]);
  });
});

describe('the first line is the name', () => {
  it('answers the whole of a single-line Title', () => {
    expect(titleName('Auth')).toBe('Auth');
  });

  it('answers only the first line of a Title written on several', () => {
    expect(titleName('Auth\nHow a session begins\nOAuth only')).toBe('Auth');
  });

  it('is the text of the first Title Line, so nobody indexes the lines for it', () => {
    const title = 'Auth\nHow a session begins';

    expect(titleName(title)).toBe(titleLines(title)[0]?.text);
  });
});

describe('normalizing a Title', () => {
  it('leaves an ordinary single-line Title alone', () => {
    expect(normalizeTitle('Auth')).toBe('Auth');
  });

  it('folds CRLF and a lone CR to LF', () => {
    expect(normalizeTitle('Auth\r\nsession\rOAuth')).toBe('Auth\nsession\nOAuth');
  });

  it('trims the trailing whitespace of every line and keeps the leading whitespace', () => {
    expect(normalizeTitle('Auth  \n  session\t')).toBe('Auth\n  session');
  });

  it('drops leading and trailing blank lines, whitespace-only ones included', () => {
    expect(normalizeTitle('\n   \nAuth\nsession\n \n\n')).toBe('Auth\nsession');
  });

  it('keeps an interior blank line verbatim, because an author who left a gap meant it', () => {
    expect(normalizeTitle('Auth\n\n\nsession')).toBe('Auth\n\n\nsession');
  });

  it('answers a Title of nothing but whitespace with no name at all', () => {
    expect(normalizeTitle(' \r\n\t\n ')).toBe('');
  });
});

describe('a Thing Title carries at least one non-empty line', () => {
  it('normalizes the Title at every door a Thing arrives through', () => {
    for (const { label, schema, value } of titleCases('Auth  \r\n\n  session \n\n')) {
      const parsed = schema.safeParse(value);

      expect(parsed.success, `${label} refused a normalizable Title`).toBe(true);
      expect(parsed.success ? parsed.data : null, label).toMatchObject({
        title: 'Auth\n\n  session',
      });
    }
  });

  it('refuses a Title that normalizes to nothing, under one stable code', () => {
    for (const blank of ['', ' ', '   ', '\n', ' \r\n \n', '\t']) {
      for (const { label, schema, value } of titleCases(blank)) {
        const parsed = schema.safeParse(value);
        const where = `${label} accepted ${JSON.stringify(blank)}`;

        expect(parsed.success, where).toBe(false);
        expect(parsed.success ? false : refusesNamelessTitle(parsed.error.issues), where).toBe(
          true,
        );
      }
    }
  });
});

describe('Space, Diagram and Graph titles are untouched', () => {
  it('keeps a Space title exactly as written', () => {
    const parsed = spaceFileSchema.parse({ version: 1, id: SPACE_ID, title: 'Deck  ' });

    expect(parsed.title).toBe('Deck  ');
  });

  it('keeps a Graph title exactly as written', () => {
    expect(graphSchema.parse({ id: GRAPH_ID, title: ' Main \r\n', edges: [] }).title).toBe(
      ' Main \r\n',
    );
  });

  it('keeps a Diagram title exactly as written', () => {
    const parsed = positionedDiagramSchema.parse({
      id: DIAGRAM_ID,
      title: 'Working ',
      kind: 'positioned',
      positions: {},
      graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
    });

    expect(parsed.title).toBe('Working ');
  });

  it('still accepts the whitespace-only title a Thing no longer may have', () => {
    expect(graphSchema.safeParse({ id: GRAPH_ID, title: '  ', edges: [] }).success).toBe(true);
  });
});
