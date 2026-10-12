import { describe, expect, it } from 'vitest';
import { isKindId, isRegisteredKind, kindFlags } from '../src/kinds/registry';
import { imageKind } from '../src/kinds/image';
import { markdownKind } from '../src/kinds/markdown';
import { referenceKind } from '../src/kinds/reference';
import { spaceKind } from '../src/kinds/space';
import { urKind } from '../src/kinds/ur';

describe('the kind registry', () => {
  it('answers the most constrained flags for a kind no module registers', () => {
    expect(kindFlags('vnd.example.unregistered')).toEqual({
      takesResourceShape: false,
      canOpen: false,
      mayBeTarget: false,
      ownsReferencedSpaces: false,
    });
  });

  it('registers every kind module', () => {
    for (const kind of [urKind, imageKind, markdownKind, referenceKind, spaceKind]) {
      expect(isRegisteredKind(kind.id), kind.id).toBe(true);
    }
  });

  it.each(['chart', 'vnd.example.chart', 'Markdown', ''])(
    'does not register %j, which no module declares',
    (kind) => {
      expect(isRegisteredKind(kind)).toBe(false);
    },
  );
});

describe('a kind id', () => {
  it.each(['markdown', 'chart', 'a', '3d', 'x-ray', 'vnd.owner.name', 'vnd.a-b.c-1'])(
    'accepts %j',
    (id) => {
      expect(isKindId(id)).toBe(true);
    },
  );

  it.each([
    '',
    'a.b',
    'vnd.a',
    'vnd.a.b.c',
    'vnd..b',
    'a/b',
    '-a',
    'vnd.-a.b',
    'vnd.a.-b',
    'a b',
    'a_b',
    'café',
  ])('refuses %j', (id) => {
    expect(isKindId(id)).toBe(false);
  });
});
