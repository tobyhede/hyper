import { describe, expect, it } from 'vitest';
import { KIND_IDS, kindFlags } from '@project/core';
import { BADGED_TARGET_GLYPH, kindNaming } from '../src';
import type { KindView } from '../src/kinds/kind-view';

describe('each kind’s view half', () => {
  it.each(KIND_IDS)(
    'names a Reference to a %s Resource exactly when one may be a Target',
    (kind) => {
      expect(kindNaming(kind).referenceName !== null).toBe(kindFlags(kind).mayBeTarget);
    },
  );

  it.each(KIND_IDS.filter((kind) => kindFlags(kind).mayBeTarget))(
    'gives a %s Resource, which may be a Target, a silhouette of its own for a Reference to badge',
    (kind) => {
      expect(kindNaming(kind).Glyph).not.toBe(BADGED_TARGET_GLYPH);
    },
  );
});

describe('a kind’s content command', () => {
  const Icon = () => null;
  const named = { name: 'Note', listName: 'Notes', referenceName: null, Glyph: Icon };

  it('is required of a kind whose operations begin an edit of its own content', () => {
    const begins: KindView<{ readonly kind: 'note'; readonly onBeginEdit?: () => void }> = {
      ...named,
      bareOperations: { kind: 'note' },
      contentCommand: { label: (name) => `Edit ${name}`, Icon },
    };
    // @ts-expect-error A begin with no command naming it would have no control to run it.
    const unnamed: KindView<{ readonly kind: 'note'; readonly onBeginEdit?: () => void }> = {
      ...named,
      bareOperations: { kind: 'note' },
    };
    const plain: KindView<{ readonly kind: 'note' }> = {
      ...named,
      bareOperations: { kind: 'note' },
    };
    expect([begins, unnamed, plain].map((view) => view.name)).toEqual(['Note', 'Note', 'Note']);
  });
});
