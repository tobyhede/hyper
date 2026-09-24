import { describe, expect, it } from 'vitest';
import { toJsonValue } from '../../src/persistence/sql-store';

describe('toJsonValue', () => {
  it.each([Infinity, -Infinity, NaN])('still refuses %s at the storage boundary', (value) => {
    expect(() => toJsonValue({ x: value })).toThrow('JSON numbers must be finite');
  });

  it('keeps finite geometry', () => {
    expect(toJsonValue({ x: -12.5, y: 1e300 })).toEqual({ x: -12.5, y: 1e300 });
  });
});
