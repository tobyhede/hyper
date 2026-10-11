import { describe, expect, it } from 'vitest';
import type { ZodIssue, ZodType, ZodTypeDef } from 'zod';
import {
  RESOURCE_TITLE_REQUIRED,
  graphSchema,
  markdownResourceSchema,
  normalizeTitle,
  positionedMapSchema,
  referenceResourceSchema,
  resourceDocumentSchema,
  resourceFileSchema,
  resourceSchema,
  shortTitle,
  spaceFileSchema,
  spaceResourceSchema,
  titleLines,
  titleName,
} from '../src/index';

const RESOURCE_ID = '00000000-0000-4000-8000-000000000001';
const TARGET_ID = '00000000-0000-4000-8000-000000000002';
const SPACE_ID = '00000000-0000-4000-8000-000000000003';
const MAP_ID = '00000000-0000-4000-8000-000000000004';
const GRAPH_ID = '00000000-0000-4000-8000-000000000005';

/**
 * Any schema that reads a Resource's Title, written so the kind schemas and the
 * unions can sit in one list. Only the Title is under test here, so what
 * each one answers with is `unknown` and the assertions read the Title off it.
 */
type ResourceTitleSchema = ZodType<unknown, ZodTypeDef, unknown>;

/**
 * A Resource as it arrives at a schema, before one has read it: the envelope,
 * with the kind's fields under `content`, all of them text.
 */
interface ResourceDraft {
  readonly id?: string;
  readonly title: string;
  readonly kind: string;
  readonly content: Readonly<Record<string, string>>;
}

const markdownResource = (title: string): ResourceDraft => ({
  id: RESOURCE_ID,
  title,
  kind: 'markdown',
  content: { source: '' },
});
/** The same Markdown Resource as its file holds it: a locator naming its sidecar. */
const markdownFile = (title: string): ResourceDraft => ({
  ...markdownResource(title),
  content: { path: `${RESOURCE_ID}.md`, mediaType: 'text/markdown' },
});
const referenceResource = (title: string): ResourceDraft => ({
  id: RESOURCE_ID,
  title,
  kind: 'reference',
  content: { target: TARGET_ID },
});
const spaceResource = (title: string): ResourceDraft => ({
  id: RESOURCE_ID,
  title,
  kind: 'space',
  content: { spaceId: SPACE_ID, map: MAP_ID, graph: GRAPH_ID },
});
/** A draft as the stored document holds it, which has no id. */
const withoutId =
  (draft: (title: string) => ResourceDraft) =>
  (title: string): ResourceDraft => {
    const { id: _id, ...document } = draft(title);
    return document;
  };

/**
 * Every schema a Resource's Title arrives through, beside the drafts it reads:
 * each kind's own schema, the Resource union, the stored document and the
 * Resource file, which holds a Markdown Resource's content as a locator.
 */
const doors: readonly {
  readonly label: string;
  readonly schema: ResourceTitleSchema;
  readonly drafts: readonly ((title: string) => ResourceDraft)[];
}[] = [
  { label: 'markdown resource', schema: markdownResourceSchema, drafts: [markdownResource] },
  { label: 'reference resource', schema: referenceResourceSchema, drafts: [referenceResource] },
  { label: 'space resource', schema: spaceResourceSchema, drafts: [spaceResource] },
  {
    label: 'resource',
    schema: resourceSchema,
    drafts: [markdownResource, referenceResource, spaceResource],
  },
  {
    label: 'resource document',
    schema: resourceDocumentSchema,
    drafts: [markdownResource, referenceResource, spaceResource].map(withoutId),
  },
  {
    label: 'resource file',
    schema: resourceFileSchema,
    drafts: [markdownFile, referenceResource, spaceResource],
  },
];

/**
 * Every door a Resource's Title arrives through, carrying one Title.
 *
 * A rule that reaches only the per-kind schemas is visibly not the rule at
 * every door: the union, the stored document and the Resource file have to
 * answer the same way, which is what makes a stored Title and an imported one
 * the same Title.
 */
const titleCases = (
  title: string,
): readonly {
  readonly label: string;
  readonly schema: ResourceTitleSchema;
  readonly value: ResourceDraft;
}[] =>
  doors.flatMap(({ label, schema, drafts }) =>
    drafts.map((draft) => ({ label, schema, value: draft(title) })),
  );

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
    (issue) => issue.code === 'custom' && issue.params?.['code'] === RESOURCE_TITLE_REQUIRED,
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

describe('the short name stands for the whole Title on one line', () => {
  it('answers a single-line Title unchanged', () => {
    expect(shortTitle('Auth')).toBe('Auth');
  });

  it('answers the first line and an ellipsis for a Title written on several', () => {
    expect(shortTitle('Resource Title\nThat\nSpans\nLines')).toBe('Resource Title…');
  });

  it('marks a two-line Title as shortened too', () => {
    expect(shortTitle('Auth\nHow a session begins')).toBe('Auth…');
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

describe('a Resource Title carries at least one non-empty line', () => {
  it('normalizes the Title at every door a Resource arrives through', () => {
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

describe('Space, Map and Graph titles are untouched', () => {
  it('keeps a Space title exactly as written', () => {
    const parsed = spaceFileSchema.parse({ version: 1, id: SPACE_ID, title: 'Deck  ' });

    expect(parsed.title).toBe('Deck  ');
  });

  it('keeps a Graph title exactly as written', () => {
    expect(graphSchema.parse({ id: GRAPH_ID, title: ' Main \r\n', edges: [] }).title).toBe(
      ' Main \r\n',
    );
  });

  it('keeps a Map title exactly as written', () => {
    const parsed = positionedMapSchema.parse({
      id: MAP_ID,
      title: 'Working ',
      kind: 'positioned',
      positions: {},
      graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
    });

    expect(parsed.title).toBe('Working ');
  });

  it('still accepts the whitespace-only title a Resource no longer may have', () => {
    expect(graphSchema.safeParse({ id: GRAPH_ID, title: '  ', edges: [] }).success).toBe(true);
  });
});
