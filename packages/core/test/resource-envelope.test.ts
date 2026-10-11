import { describe, expect, it } from 'vitest';
import { resourceDocumentSchema, resourceSchema } from '../src/index';

/**
 * A Resource is the envelope `{ id, title, kind, content }` (ADR 0128): the
 * core owns the first three and a kind's own fields sit under `content`. The
 * stored document is the same envelope less its id.
 */
const RESOURCE_ID = '00000000-0000-4000-8000-000000000001';
const TARGET_ID = '00000000-0000-4000-8000-000000000002';
const SPACE_ID = '00000000-0000-4000-8000-000000000003';
const MAP_ID = '00000000-0000-4000-8000-000000000004';
const GRAPH_ID = '00000000-0000-4000-8000-000000000005';

const documents = [
  { title: 'Prose', kind: 'markdown', content: { source: '# Prose' } },
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

describe('a Resource is an envelope', () => {
  it.each(documents)('stores a $kind Resource as { title, kind, content }', (document) => {
    expect(resourceDocumentSchema.parse(document)).toEqual(document);
    expect(resourceSchema.parse({ id: RESOURCE_ID, ...document })).toEqual({
      id: RESOURCE_ID,
      ...document,
    });
  });

  it('refuses a kind field written beside the envelope rather than under content', () => {
    expect(
      resourceDocumentSchema.safeParse({ title: 'Prose', kind: 'markdown', body: 'x' }).success,
    ).toBe(false);
    expect(
      resourceDocumentSchema.safeParse({ title: 'Again', kind: 'reference', target: TARGET_ID })
        .success,
    ).toBe(false);
  });

  it('refuses content that does not match its kind', () => {
    expect(
      resourceDocumentSchema.safeParse({
        title: 'Prose',
        kind: 'markdown',
        content: { target: TARGET_ID },
      }).success,
    ).toBe(false);
    expect(
      resourceDocumentSchema.safeParse({
        title: 'Picture',
        kind: 'image',
        content: { url: 'ftp://x' },
      }).success,
    ).toBe(false);
  });

  it('requires content, even for an Ur Resource whose content is empty', () => {
    expect(resourceDocumentSchema.safeParse({ title: 'Box', kind: 'ur' }).success).toBe(false);
  });
});
