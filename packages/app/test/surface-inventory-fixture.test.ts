import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { positions, space } from '../stories/support/fixture';

describe('the surface inventory fixture', () => {
  it('defines geometry only for Cards in the validated Space', () => {
    for (const cardId of Object.keys(positions)) {
      expect(
        space.lookup.card(uuidSchema.parse(cardId)),
        `position for unknown Card ${cardId}`,
      ).toBeDefined();
    }
  });
});
