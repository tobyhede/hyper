import { describe, expect, it } from 'vitest';
import { kindFlags } from '../src/kinds/registry';

describe('the kind registry', () => {
  it('answers the most constrained flags for a kind no module registers', () => {
    expect(kindFlags('vnd.example.unregistered')).toEqual({
      takesResourceShape: false,
      canOpen: false,
      mayBeTarget: false,
      ownsReferencedSpaces: false,
    });
  });
});
