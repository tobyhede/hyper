import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  COLLAPSED_RESOURCE_SIZE,
  DEFAULT_OPEN_SIZE,
  DEFAULT_SPACE_RESOURCE_OPEN_SIZE,
  SPACE_RESOURCE_MIN_OPEN_SIZE,
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
const contents = (via: ContentVia): ResourceContent[] => [
  { kind: 'markdown', source: 'Body', via },
  { kind: 'image', url: 'https://example.com/image.png', naturalSize: undefined, via },
  { kind: 'space', view: { spaceId: id, map: id, graph: id, framing: undefined }, via },
  { kind: 'ur', via },
];
const UNRESOLVED: ResourceContent = { kind: 'unresolved', via: 'reference' };

const viaArbitrary = fc.constantFrom<ContentVia>('self', 'reference');
const extentArbitrary = fc.record({
  width: fc.integer({ min: 1, max: 10_000 }),
  height: fc.integer({ min: 1, max: 10_000 }),
});
const contentArbitrary: fc.Arbitrary<ResourceContent> = fc.oneof(
  fc.record({ kind: fc.constant('markdown' as const), source: fc.string(), via: viaArbitrary }),
  fc.record({
    kind: fc.constant('image' as const),
    url: fc.webUrl(),
    naturalSize: fc.option(extentArbitrary, { nil: undefined }),
    via: viaArbitrary,
  }),
  fc.record({
    kind: fc.constant('space' as const),
    view: fc.constant({ spaceId: id, map: id, graph: id, framing: undefined }),
    via: viaArbitrary,
  }),
  fc.record({ kind: fc.constant('ur' as const), via: viaArbitrary }),
  fc.constant(UNRESOLVED),
);
const asSelf = (content: ResourceContent): ResourceContent =>
  content.kind === 'unresolved' ? content : { ...content, via: 'self' };

describe('content facts', () => {
  it('offers an action only for own content that has one', () => {
    fc.assert(
      fc.property(contentArbitrary, (content) => {
        const offered = contentAction(content) !== 'none';
        // `unresolved` is always `via: 'reference'`, so `via` alone excludes it.
        expect(offered).toBe(content.via === 'self' && content.kind !== 'ur');
      }),
    );
  });

  it('answers the floor, Map embedding, content area and first Open Size regardless of via', () => {
    fc.assert(
      fc.property(contentArbitrary, (content) => {
        const self = asSelf(content);
        expect(openSizeFloor(content)).toEqual(openSizeFloor(self));
        expect(embedsMap(content)).toBe(embedsMap(self));
        expect(drawsContentArea(content)).toBe(drawsContentArea(self));
        expect(firstOpenSize(content)).toEqual(firstOpenSize(self));
      }),
    );
  });

  it('answers each kind’s own action and geometry', () => {
    expect(contents('self').map(contentAction)).toEqual([
      'edit-markdown',
      'replace-image',
      'author-space-view',
      'none',
    ]);
    expect(contentAction(UNRESOLVED)).toBe('none');
    expect([...contents('self'), UNRESOLVED].map(openSizeFloor)).toEqual([
      COLLAPSED_RESOURCE_SIZE,
      COLLAPSED_RESOURCE_SIZE,
      SPACE_RESOURCE_MIN_OPEN_SIZE,
      COLLAPSED_RESOURCE_SIZE,
      COLLAPSED_RESOURCE_SIZE,
    ]);
    expect([...contents('self'), UNRESOLVED].map(embedsMap)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    // `unresolved` draws its "Target not found" notice in the content area.
    expect([...contents('self'), UNRESOLVED].map(drawsContentArea)).toEqual([
      true,
      true,
      false,
      false,
      true,
    ]);
    expect([...contents('self'), UNRESOLVED].map(firstOpenSize)).toEqual([
      DEFAULT_OPEN_SIZE,
      DEFAULT_OPEN_SIZE,
      DEFAULT_SPACE_RESOURCE_OPEN_SIZE,
      DEFAULT_OPEN_SIZE,
      DEFAULT_OPEN_SIZE,
    ]);
  });

  it('opens an image at its recorded size plus chrome, within the first-Open bound', () => {
    const image = (width: number, height: number): ResourceContent => ({
      kind: 'image',
      url: 'https://example.com/image.png',
      via: 'self',
      naturalSize: { width, height },
    });
    expect(firstOpenSize(image(640, 480))).toEqual({ width: 648, height: 539 });
    expect(firstOpenSize(image(2560, 1920))).toEqual({ width: 1288, height: 1019 });
    expect(firstOpenSize(image(1, 1))).toEqual(COLLAPSED_RESOURCE_SIZE);
  });
});
