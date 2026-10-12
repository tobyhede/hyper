import { describe, expect, it } from 'vitest';
import { KIND_IDS, kindFlags } from '@project/core';
import { BADGED_TARGET_GLYPH, kindNaming } from '../src';

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
