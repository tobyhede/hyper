import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { describe, expect, it } from 'vitest';
import { spaceDirectoryFiles } from '../../src/aggregate-directory/write-space-directory';

const SPACE_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000001');
const TARGET_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000004');
const EMBED_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000005');
const PICTURE_ID = uuidSchema.parse('50000000-0000-4000-8000-000000000006');

const space = (resources: SpaceSnapshot['resources']): SpaceSnapshot => ({
  id: SPACE_ID,
  document: { version: 1, title: 'Talk' },
  resources,
});

const resourceFile = (snapshot: SpaceSnapshot, id: string): string | undefined =>
  spaceDirectoryFiles({ snapshot, revision: 0n, exportedRevision: null }).get(`resources/${id}.md`);

/**
 * A stored document's keys can arrive in any order (`jsonb` reorders them on
 * write), and Export writes a Resource's content whole, so the order a file's
 * keys are written in has to come from somewhere other than the document.
 */
describe("a Resource file's keys", () => {
  it('are written in one order however a Space and Image Resource were stored', () => {
    const ordered = space([
      {
        id: EMBED_ID,
        document: {
          title: 'Embed',
          kind: 'space',
          content: {
            spaceId: TARGET_ID,
            map: MAP_ID,
            graph: GRAPH_ID,
            framing: { centreX: 1, centreY: 2, zoom: 0.5 },
          },
        },
      },
      {
        id: PICTURE_ID,
        document: {
          title: 'Picture',
          kind: 'image',
          content: { url: 'https://example.com/a.png', naturalSize: { width: 4, height: 3 } },
        },
      },
    ]);
    const shuffled = space([
      {
        id: PICTURE_ID,
        document: {
          content: { naturalSize: { height: 3, width: 4 }, url: 'https://example.com/a.png' },
          kind: 'image',
          title: 'Picture',
        },
      },
      {
        id: EMBED_ID,
        document: {
          content: {
            framing: { zoom: 0.5, centreY: 2, centreX: 1 },
            graph: GRAPH_ID,
            map: MAP_ID,
            spaceId: TARGET_ID,
          },
          kind: 'space',
          title: 'Embed',
        },
      },
    ]);

    expect(resourceFile(ordered, EMBED_ID)).toBe(
      [
        '---',
        `id: ${EMBED_ID}`,
        'title: Embed',
        'kind: space',
        `spaceId: ${TARGET_ID}`,
        `map: ${MAP_ID}`,
        `graph: ${GRAPH_ID}`,
        'framing:',
        '  centreX: 1',
        '  centreY: 2',
        '  zoom: 0.5',
        '---',
        '',
        '',
      ].join('\n'),
    );
    for (const id of [EMBED_ID, PICTURE_ID]) {
      expect(resourceFile(shuffled, id), id).toBe(resourceFile(ordered, id));
    }
  });
});
