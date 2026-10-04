import type { Resource, ResourceContent } from '@project/core';
import { describe, expect, it } from 'vitest';
import { loadSpaceSnapshot, resolveResourceContent, type Space } from '../src/index';
import { buildSpaceLookup } from '../src/lookup';
import { reference, resource, uuid } from './resource-files';

const MARKDOWN = uuid('00000000-0000-4000-8000-000000000061');
const IMAGE = uuid('00000000-0000-4000-8000-000000000062');
const FRAMED_SPACE = uuid('00000000-0000-4000-8000-000000000063');
const UNFRAMED_SPACE = uuid('00000000-0000-4000-8000-000000000064');
const UR = uuid('00000000-0000-4000-8000-000000000065');
const TO_MARKDOWN = uuid('00000000-0000-4000-8000-000000000071');
const TO_IMAGE = uuid('00000000-0000-4000-8000-000000000072');
const TO_SPACE = uuid('00000000-0000-4000-8000-000000000073');
const TO_UR = uuid('00000000-0000-4000-8000-000000000074');
const TARGET_SPACE = uuid('00000000-0000-4000-8000-0000000000aa');
const TARGET_MAP = uuid('00000000-0000-4000-8000-0000000000ab');
const TARGET_GRAPH = uuid('00000000-0000-4000-8000-0000000000ac');
const FRAMING = { centreX: 12, centreY: -4, zoom: 1.5 };

/** One Resource of each kind that owns content, and a Reference Resource to each. */
function everyKind(): Space {
  const result = loadSpaceSnapshot({
    id: uuid('00000000-0000-4000-8000-000000000001'),
    document: { version: 1, title: 'Every kind' },
    resources: [
      { id: MARKDOWN, document: { title: 'Notes', kind: 'markdown', body: 'Some notes.\n' } },
      {
        id: IMAGE,
        document: { title: 'Harbour', kind: 'image', url: 'https://example.com/harbour.png' },
      },
      {
        id: FRAMED_SPACE,
        document: {
          title: 'Framed',
          kind: 'space',
          spaceId: TARGET_SPACE,
          map: TARGET_MAP,
          graph: TARGET_GRAPH,
          framing: FRAMING,
        },
      },
      {
        id: UNFRAMED_SPACE,
        document: {
          title: 'Unframed',
          kind: 'space',
          spaceId: TARGET_SPACE,
          map: TARGET_MAP,
          graph: TARGET_GRAPH,
        },
      },
      { id: UR, document: { title: 'Node', kind: 'ur' } },
      { id: TO_MARKDOWN, document: { title: 'Notes, again', kind: 'reference', target: MARKDOWN } },
      { id: TO_IMAGE, document: { title: 'Harbour, again', kind: 'reference', target: IMAGE } },
      {
        id: TO_SPACE,
        document: { title: 'Framed, again', kind: 'reference', target: FRAMED_SPACE },
      },
      { id: TO_UR, document: { title: 'Node, again', kind: 'reference', target: UR } },
    ],
  });
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

/**
 * A Space carrying Resources intake refuses. The lookup is built over them
 * directly, since `loadSpace` would reject the Space before it existed.
 */
function refusedByIntake(resources: readonly Resource[]): Space {
  const built = buildSpaceLookup({ resources, maps: [] });
  if (!built.ok) throw new Error('a Space with no Maps always builds its lookup');
  return { ...everyKind(), resources, lookup: built.lookup };
}

const framedView = {
  spaceId: TARGET_SPACE,
  map: TARGET_MAP,
  graph: TARGET_GRAPH,
  framing: FRAMING,
};

describe('resolveResourceContent', () => {
  const space = everyKind();
  const of = (id: string): Resource => {
    const found = space.lookup.resource(uuid(id));
    if (found === undefined) throw new Error(`fixture has no ${id}`);
    return found;
  };

  it.each<[string, string, ResourceContent]>([
    ['a Markdown Resource', MARKDOWN, { kind: 'markdown', source: 'Some notes.\n', via: 'self' }],
    [
      'an Image Resource',
      IMAGE,
      { kind: 'image', url: 'https://example.com/harbour.png', via: 'self' },
    ],
    ['a framed Space Resource', FRAMED_SPACE, { kind: 'space', view: framedView, via: 'self' }],
    [
      'an unframed Space Resource',
      UNFRAMED_SPACE,
      {
        kind: 'space',
        view: { spaceId: TARGET_SPACE, map: TARGET_MAP, graph: TARGET_GRAPH, framing: undefined },
        via: 'self',
      },
    ],
    ['an Ur Resource', UR, { kind: 'ur', via: 'self' }],
    [
      'a Reference Resource to Markdown',
      TO_MARKDOWN,
      { kind: 'markdown', source: 'Some notes.\n', via: 'reference' },
    ],
    [
      'a Reference Resource to an image',
      TO_IMAGE,
      { kind: 'image', url: 'https://example.com/harbour.png', via: 'reference' },
    ],
    [
      'a Reference Resource to a Space',
      TO_SPACE,
      { kind: 'space', view: framedView, via: 'reference' },
    ],
    ['a Reference Resource to an Ur Resource', TO_UR, { kind: 'ur', via: 'reference' }],
  ])('resolves %s', (_, id, expected) => {
    expect(resolveResourceContent(space, of(id))).toStrictEqual(expected);
  });

  it('keeps an empty body as empty Markdown rather than as unresolved', () => {
    const empty = resource('00000000-0000-4000-8000-000000000081', 'Empty', '');
    expect(resolveResourceContent(refusedByIntake([empty]), empty)).toStrictEqual({
      kind: 'markdown',
      source: '',
      via: 'self',
    });
  });

  it('answers unresolved for a Reference Resource whose Target is missing', () => {
    const dangling = reference(
      '00000000-0000-4000-8000-000000000082',
      'Dangling',
      '00000000-0000-4000-8000-000000000099',
    );
    expect(resolveResourceContent(refusedByIntake([dangling]), dangling)).toStrictEqual({
      kind: 'unresolved',
      via: 'reference',
    });
  });

  it('answers unresolved for a Reference Resource to a Reference Resource', () => {
    const target = resource('00000000-0000-4000-8000-000000000083', 'Target', 'Body.\n');
    const first = reference('00000000-0000-4000-8000-000000000084', 'First', target.id);
    const second = reference('00000000-0000-4000-8000-000000000085', 'Second', first.id);
    expect(resolveResourceContent(refusedByIntake([target, first, second]), second)).toStrictEqual({
      kind: 'unresolved',
      via: 'reference',
    });
  });
});
