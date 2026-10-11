import { describe, expect, it } from 'vitest';
import {
  imageKind,
  markdownFileContentSchema,
  markdownKind,
  referenceKind,
  resourceDocumentSchema,
  resourceFileSchema,
  resourceSchema,
  spaceKind,
  urKind,
} from '../src/index';

/**
 * A kind's module is the one parser of its content (ADR 0128): the Resource,
 * its stored document and its Resource file each parse `content` through the
 * registered kind's schema, so the three doors answer one rule. What differs
 * is the envelope: the document has no id, and the file is strict and holds
 * the kind's file content, which for Markdown is a locator.
 */
const RESOURCE_ID = '00000000-0000-4000-8000-000000000001';
const TARGET_ID = '00000000-0000-4000-8000-000000000002';
const SPACE_ID = '00000000-0000-4000-8000-000000000003';
const MAP_ID = '00000000-0000-4000-8000-000000000004';
const GRAPH_ID = '00000000-0000-4000-8000-000000000005';

/** One document of each kind whose file holds its content as it is. */
const asWritten = [
  {
    title: 'Picture',
    kind: 'image',
    content: { url: 'https://example.com/a.png', naturalSize: { width: 4, height: 3 } },
  },
  { title: 'Again', kind: 'reference', content: { target: TARGET_ID } },
  {
    title: 'Nested',
    kind: 'space',
    content: {
      spaceId: SPACE_ID,
      map: MAP_ID,
      graph: GRAPH_ID,
      framing: { centreX: 1, centreY: 2, zoom: 0.5 },
    },
  },
  { title: 'Box', kind: 'ur', content: {} },
] as const;

const markdown = { title: 'Prose', kind: 'markdown', content: { source: '# Prose' } } as const;

/** A document as it arrives at a door, before one has read it. */
interface Draft {
  readonly title: string;
  readonly kind: string;
  readonly content: Readonly<Record<string, Readonly<Record<string, number>> | number | string>>;
}

/** Each door, given a document, as it would read it. */
const doors = [
  { door: 'document', parse: (document: Draft) => resourceDocumentSchema.safeParse(document) },
  {
    door: 'resource',
    parse: (document: Draft) => resourceSchema.safeParse({ ...document, id: RESOURCE_ID }),
  },
  {
    door: 'file',
    parse: (document: Draft) => resourceFileSchema.safeParse({ ...document, id: RESOURCE_ID }),
  },
] as const;

describe('a stored document is the Resource less its id', () => {
  const titles = ['', ' ', 'A', ' A '];
  const sources = [undefined, '', 'source'];
  const kinds = [undefined, 'markdown', 'reference', 'vnd.example.unregistered'];

  /** One combination from the title/source/kind product, present only when drawn. */
  interface CandidateDocument {
    title: string;
    content?: { source: string };
    kind?: string;
  }

  it('accepts a document exactly when the Resource accepts it with an id', () => {
    const disagreements: string[] = [];
    let examined = 0;
    for (const title of titles) {
      for (const source of sources) {
        for (const kind of kinds) {
          const document: CandidateDocument = { title };
          if (source !== undefined) document.content = { source };
          if (kind !== undefined) document.kind = kind;
          examined += 1;
          const asDocument = resourceDocumentSchema.safeParse(document);
          const asResource = resourceSchema.safeParse({ ...document, id: RESOURCE_ID });
          if (asDocument.success !== asResource.success) {
            disagreements.push(`${JSON.stringify(document)}: document ${asDocument.success}`);
            continue;
          }
          if (asDocument.success && asResource.success) {
            expect(asResource.data).toEqual({ ...asDocument.data, id: RESOURCE_ID });
          }
        }
      }
    }

    expect(disagreements).toEqual([]);
    // Asserted as a literal, because a loop that visits nothing agrees with itself.
    expect(examined).toBe(48);
  });
});

describe("each kind's content is parsed by its module at every door", () => {
  it.each(asWritten)('reads a $kind Resource the same way at every door', (document) => {
    for (const { door, parse } of doors) {
      const parsed = parse(document);
      expect(parsed.success, door).toBe(true);
      expect(parsed.data?.content, door).toEqual(document.content);
    }
  });

  it.each(asWritten)('refuses an unknown $kind content key at every door', (document) => {
    for (const { door, parse } of doors) {
      const parsed = parse({ ...document, content: { ...document.content, extra: 1 } });
      expect(parsed.success, door).toBe(false);
      expect(parsed.error?.issues[0]?.path, door).toEqual(['content']);
    }
  });

  it('refuses an unknown key inside a nested content object at every door', () => {
    const [image, , space] = asWritten;
    for (const { door, parse } of doors) {
      expect(
        parse({
          ...image,
          content: { ...image.content, naturalSize: { width: 1, height: 2, w: 3 } },
        }).success,
        door,
      ).toBe(false);
      expect(
        parse({
          ...space,
          content: { ...space.content, framing: { centreX: 0, centreY: 0, zoom: 1, z: 1 } },
        }).success,
        door,
      ).toBe(false);
    }
  });

  it.each([
    ['https://example.com/a.png', true],
    ['/images/47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU', true],
    ['data:image/png;base64,AA==', false],
    ['a.png', false],
  ])('answers the image URL %j the same way at every door', (url, accepted) => {
    for (const { door, parse } of doors) {
      expect(parse({ title: 'A', kind: 'image', content: { url } }).success, door).toBe(accepted);
    }
  });

  it('refuses a kind no module registers at every door, under its kind', () => {
    for (const { door, parse } of doors) {
      const parsed = parse({ title: 'A', kind: 'vnd.example.unregistered', content: {} });
      expect(parsed.success, door).toBe(false);
      expect(
        parsed.error?.issues.map(({ path }) => path),
        door,
      ).toEqual([['kind']]);
    }
  });
});

describe("a Resource file holds the kind's file content", () => {
  it("parses a kind whose file holds its content as it is with that kind's own schema", () => {
    for (const kind of [imageKind, referenceKind, spaceKind, urKind]) {
      expect(kind.file.contentSchema, kind.id).toBe(kind.contentSchema);
    }
  });

  it("holds a Markdown Resource's sidecar locator in place of its source", () => {
    expect(markdownKind.file.contentSchema).toBe(markdownFileContentSchema);
    const locator = { path: `${RESOURCE_ID}.md`, mediaType: 'text/markdown' };
    expect(
      resourceFileSchema.safeParse({ ...markdown, id: RESOURCE_ID, content: locator }).success,
    ).toBe(true);
    expect(resourceFileSchema.safeParse({ ...markdown, id: RESOURCE_ID }).success).toBe(false);
    expect(
      resourceSchema.safeParse({ ...markdown, id: RESOURCE_ID, content: locator }).success,
    ).toBe(false);
  });

  it('refuses a key beside the envelope that the Resource strips', () => {
    const [, reference] = asWritten;
    const resource = { ...reference, id: RESOURCE_ID, extra: 1 };
    expect(resourceFileSchema.safeParse(resource).success).toBe(false);
    expect(resourceSchema.safeParse(resource).success).toBe(true);
  });
});
