import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  authorsContent,
  embedsMap,
  drawsContentArea,
  uuidSchema,
  type ContentVia,
  type ResourceContent,
} from '../src/index';

const id = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const contents = (via: ContentVia): ResourceContent[] => [
  { kind: 'markdown', source: 'Body', via },
  { kind: 'image', url: 'https://example.com/image.png', via },
  { kind: 'space', view: { spaceId: id, map: id, graph: id, framing: undefined }, via },
  { kind: 'ur', via },
];
const UNRESOLVED: ResourceContent = { kind: 'unresolved', via: 'target' };

const viaArbitrary = fc.constantFrom<ContentVia>('self', 'target');
const contentArbitrary: fc.Arbitrary<ResourceContent> = fc.oneof(
  fc.record({ kind: fc.constant('markdown' as const), source: fc.string(), via: viaArbitrary }),
  fc.record({
    kind: fc.constant('image' as const),
    url: fc.webUrl(),
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
  it('offers authoring only for own content of a kind that authors it', () => {
    fc.assert(
      fc.property(contentArbitrary, (content) => {
        const offered = authorsContent(content);
        // `unresolved` is always `via: 'target'`, so `via` alone excludes it.
        expect(offered).toBe(content.via === 'self' && content.kind !== 'ur');
      }),
    );
  });

  it('answers Map embedding and content area regardless of via', () => {
    fc.assert(
      fc.property(contentArbitrary, (content) => {
        const self = asSelf(content);
        expect(embedsMap(content)).toBe(embedsMap(self));
        expect(drawsContentArea(content)).toBe(drawsContentArea(self));
      }),
    );
  });

  it('answers each kind’s own authoring and content facts', () => {
    expect(contents('self').map(authorsContent)).toEqual([true, true, true, false]);
    expect(authorsContent(UNRESOLVED)).toBe(false);
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
  });
});
