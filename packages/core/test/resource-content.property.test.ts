import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  contentAction,
  firstOpenSize,
  openSizeFloor,
  embedsMap,
  drawsContentArea,
  uuidSchema,
  type ContentVia,
  type ResourceContent,
} from '../src/index';

const id = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const contents = (via: ContentVia, source: string): ResourceContent[] => [
  { kind: 'markdown', source, via },
  { kind: 'image', url: 'https://example.com/image.png', naturalSize: undefined, via },
  { kind: 'space', view: { spaceId: id, map: id, graph: id, framing: undefined }, via },
  { kind: 'ur', via },
];

describe('content facts', () => {
  it('offers only the content owner its kind’s authoring action', () => {
    fc.assert(
      fc.property(fc.string(), (source) => {
        expect(contents('self', source).map(contentAction)).toEqual([
          'edit-markdown',
          'replace-image',
          'author-space-view',
          'none',
        ]);
        expect(contents('reference', source).map(contentAction)).toEqual([
          'none',
          'none',
          'none',
          'none',
        ]);
        expect(contentAction({ kind: 'unresolved', via: 'reference' })).toBe('none');
      }),
    );
  });
});

it('takes the floor, Map embedding and content area from content regardless of reference', () => {
  fc.assert(
    fc.property(fc.string(), (source) => {
      for (const via of ['self', 'reference'] as const) {
        const values = contents(via, source);
        expect(values.map(openSizeFloor)).toEqual([
          { width: 260, height: 146 },
          { width: 260, height: 146 },
          { width: 292, height: 266 },
          { width: 260, height: 146 },
        ]);
        expect(values.map(embedsMap)).toEqual([false, false, true, false]);
        expect(values.map(drawsContentArea)).toEqual([true, true, false, false]);
      }
      const unresolved: ResourceContent = { kind: 'unresolved', via: 'reference' };
      expect(openSizeFloor(unresolved)).toEqual({ width: 260, height: 146 });
      expect(embedsMap(unresolved)).toBe(false);
      expect(drawsContentArea(unresolved)).toBe(false);
    }),
  );
});

it('opens at content geometry, using recorded image size synchronously for either origin', () => {
  for (const via of ['self', 'reference'] as const) {
    expect(contents(via, '').map(firstOpenSize)).toEqual([
      { width: 560, height: 420 },
      { width: 560, height: 420 },
      { width: 960, height: 720 },
      { width: 560, height: 420 },
    ]);
    expect(
      firstOpenSize({
        kind: 'image',
        url: 'https://example.com/image.png',
        via,
        naturalSize: { width: 640, height: 480 },
      }),
    ).toEqual({ width: 648, height: 539 });
    expect(
      firstOpenSize({
        kind: 'image',
        url: 'https://example.com/image.png',
        via,
        naturalSize: { width: 2560, height: 1920 },
      }),
    ).toEqual({ width: 1288, height: 1019 });
    expect(
      firstOpenSize({
        kind: 'image',
        url: 'https://example.com/image.png',
        via,
        naturalSize: { width: 1, height: 1 },
      }),
    ).toEqual({ width: 260, height: 146 });
  }
  expect(firstOpenSize({ kind: 'unresolved', via: 'reference' })).toEqual({
    width: 560,
    height: 420,
  });
});
