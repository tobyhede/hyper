import fc from 'fast-check';
import { RESOURCE_SHAPES, uuidSchema, type ResourceContent, type SpaceView } from '@project/core';
import { describe, expect, it } from 'vitest';
import {
  atRest,
  beginEditing,
  beginReplacing,
  CLOSED_DISPLAY,
  drawnResourceShape,
  spaceViewOf,
  type ResourceDisplay,
} from '../src/resource-display';
import type { CanvasResourceBodyEditor } from '../src/CanvasResource';
import type { ImageReplaceEditor } from '../src/ImageReplaceTarget';

const view: SpaceView = {
  spaceId: uuidSchema.parse('00000000-0000-4000-8000-000000000001'),
  map: uuidSchema.parse('00000000-0000-4000-8000-000000000002'),
  graph: uuidSchema.parse('00000000-0000-4000-8000-000000000003'),
  framing: undefined,
};

const via = fc.constantFrom('self' as const, 'reference' as const);

const content: fc.Arbitrary<ResourceContent> = fc.oneof(
  fc.record({ kind: fc.constant('markdown' as const), source: fc.string(), via }),
  fc.record({
    kind: fc.constant('image' as const),
    url: fc.webUrl(),
    naturalSize: fc.constant(undefined),
    via,
  }),
  fc.record({ kind: fc.constant('space' as const), view: fc.constant(view), via }),
  fc.record({ kind: fc.constant('ur' as const), via }),
  fc.constant({ kind: 'unresolved' as const, via: 'reference' as const }),
);

const editor: CanvasResourceBodyEditor = { onComplete: () => 'completed', onEnd: () => undefined };
const replacer: ImageReplaceEditor = {
  accept: 'image/png',
  onReplace: () => Promise.resolve(null),
  onEnd: () => undefined,
};

const shown: fc.Arbitrary<ResourceDisplay> = fc.oneof(
  fc.constant(CLOSED_DISPLAY),
  content.map((value) => ({ shown: 'open' as const, content: value })),
  content.map((value) => ({ shown: 'presented' as const, content: value })),
);

/** Every display, including the two only the helpers make. */
const display: fc.Arbitrary<ResourceDisplay> = fc.oneof(
  shown,
  fc.tuple(shown, fc.boolean()).map(([value, autoFocus]) => beginEditing(value, editor, autoFocus)),
  shown.map((value) => beginReplacing(value, replacer)),
);

const openOwn = (value: ResourceDisplay, kind: 'markdown' | 'image'): boolean =>
  value.shown === 'open' && value.content.kind === kind && value.content.via === 'self';

describe('the display states only a Resource’s own content enters', () => {
  it('begins editing only Open own Markdown, and returns to it at rest', () => {
    fc.assert(
      fc.property(display, fc.boolean(), (value, autoFocus) => {
        const editing = beginEditing(value, editor, autoFocus);
        if (!openOwn(value, 'markdown')) {
          expect(editing).toBe(value);
          return;
        }
        expect(editing).toMatchObject({ shown: 'editing', editor, autoFocus });
        expect(atRest(editing)).toEqual(value);
      }),
    );
  });

  it('begins replacing only an Open own image, and returns to it at rest', () => {
    fc.assert(
      fc.property(display, (value) => {
        const replacing = beginReplacing(value, replacer);
        if (!openOwn(value, 'image')) {
          expect(replacing).toBe(value);
          return;
        }
        expect(replacing).toMatchObject({ shown: 'replacing', replacer });
        expect(atRest(replacing)).toEqual(value);
      }),
    );
  });

  it('neither edits nor replaces an Open Ur Resource, its own or a Target’s', () => {
    for (const reached of ['self', 'reference'] as const) {
      const open: ResourceDisplay = { shown: 'open', content: { kind: 'ur', via: reached } };
      expect(beginEditing(open, editor, true)).toBe(open);
      expect(beginReplacing(open, replacer)).toBe(open);
    }
  });

  it('leaves every display that is neither editing nor replacing as it is at rest', () => {
    fc.assert(
      fc.property(shown, (value) => {
        expect(atRest(value)).toBe(value);
      }),
    );
  });
});

describe('the Space view a display shows', () => {
  it('answers the view and how it was reached for an Open or presented Space', () => {
    for (const shownAs of ['open', 'presented'] as const)
      for (const reached of ['self', 'reference'] as const)
        expect(
          spaceViewOf({ shown: shownAs, content: { kind: 'space', view, via: reached } }),
        ).toEqual({ view, via: reached });
  });

  it('answers nothing for a Closed display, or one showing anything but a Space', () => {
    fc.assert(
      fc.property(display, (value) => {
        const drawsSpace =
          (value.shown === 'open' || value.shown === 'presented') && value.content.kind === 'space';
        expect(spaceViewOf(value) === undefined).toBe(!drawsSpace);
      }),
    );
    expect(spaceViewOf(CLOSED_DISPLAY)).toBeUndefined();
  });
});

describe('drawnResourceShape', () => {
  const resourceShape = fc.constantFrom(...RESOURCE_SHAPES);

  it('draws a Closed Resource in its Shape', () => {
    for (const chosen of RESOURCE_SHAPES) {
      expect(drawnResourceShape(CLOSED_DISPLAY, chosen)).toBe(chosen);
    }
  });

  it('draws an Open, presented, editing or replacing Resource as the rectangle whatever its Shape', () => {
    fc.assert(
      fc.property(content, resourceShape, (drawn, chosen) => {
        const displays: readonly ResourceDisplay[] = [
          { shown: 'open', content: drawn },
          { shown: 'presented', content: drawn },
          beginEditing(
            { shown: 'open', content: { kind: 'markdown', source: '', via: 'self' } },
            editor,
            false,
          ),
          beginReplacing(
            {
              shown: 'open',
              content: {
                kind: 'image',
                url: 'https://example.test/a.png',
                naturalSize: undefined,
                via: 'self',
              },
            },
            replacer,
          ),
        ];
        for (const display of displays) {
          expect(drawnResourceShape(display, chosen)).toBe('rectangle');
        }
      }),
    );
  });
});
