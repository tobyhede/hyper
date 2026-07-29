import { describe, expect, expectTypeOf, it } from 'vitest';
import { uuidSchema, type UUID } from '../src/index';

describe('UUID identity type', () => {
  it('is minted by validation rather than assignment from a plain string', () => {
    const parsed = uuidSchema.parse('00000000-0000-4000-8000-000000000001');

    expectTypeOf(parsed).toEqualTypeOf<UUID>();
    expect(parsed).toBe('00000000-0000-4000-8000-000000000001');

    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const unchecked: UUID = '00000000-0000-4000-8000-000000000001';
    expect(unchecked).toBeTruthy();
  });
});
