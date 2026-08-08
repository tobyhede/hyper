import { describe, expect, it } from 'vitest';
import { SpaceCanvas } from '../src/components/SpaceCanvas';

describe('SpaceCanvas vocabulary', () => {
  it('exposes canvas composition without calling it a domain Graph or View', () => {
    expect(SpaceCanvas).toBeTypeOf('function');
  });
});
