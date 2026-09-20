import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_DECIMAL,
  decodeStoredRevision,
  encodeStoredRevision,
  REVISION_CEILING,
  RevisionCodecError,
} from '../src/revision-codec';

describe('revision codec', () => {
  it('decodes a canonical decimal to the matching bigint', () => {
    expect(decodeStoredRevision('0')).toBe(0n);
    expect(decodeStoredRevision('1')).toBe(1n);
    expect(decodeStoredRevision('42')).toBe(42n);
    expect(decodeStoredRevision(REVISION_CEILING.toString())).toBe(REVISION_CEILING);
  });

  it('encodes a bigint to its canonical decimal text', () => {
    expect(encodeStoredRevision(0n)).toBe('0');
    expect(encodeStoredRevision(1n)).toBe('1');
    expect(encodeStoredRevision(42n)).toBe('42');
    expect(encodeStoredRevision(REVISION_CEILING)).toBe(REVISION_CEILING.toString());
  });

  it('round-trips every revision within the ceiling', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: REVISION_CEILING }), (revision) => {
        expect(decodeStoredRevision(encodeStoredRevision(revision))).toBe(revision);
      }),
    );
  });

  const nonCanonical = ['007', '+1', '1.0', '-1', '', ' 1', '1e3', '0x1', '1_000', '00'];
  for (const value of nonCanonical) {
    it(`refuses to decode the non-canonical revision ${JSON.stringify(value)}`, () => {
      expect(CANONICAL_DECIMAL.test(value)).toBe(false);
      expect(() => decodeStoredRevision(value)).toThrow(RevisionCodecError);
      expect(() => decodeStoredRevision(value)).toThrow('canonical non-negative decimal');
    });
  }

  it('refuses to decode a revision above the 2^63-1 ceiling', () => {
    const aboveCeiling = (REVISION_CEILING + 1n).toString();
    expect(() => decodeStoredRevision(aboveCeiling)).toThrow(RevisionCodecError);
    expect(() => decodeStoredRevision(aboveCeiling)).toThrow('exceeds the 2^63-1 ceiling');
  });

  it('refuses to decode a 19-digit revision above the ceiling but within the canonical pattern width', () => {
    // The pattern bounds parsing at 19 digits, which is the ceiling's own
    // *width* but not its range: every value from REVISION_CEILING + 1 to
    // 9999999999999999999 is 19 digits and matches the pattern, so only the
    // ceiling check (not the format check) can refuse it.
    expect(() => decodeStoredRevision('9'.repeat(19))).toThrow('exceeds the 2^63-1 ceiling');
  });

  it('refuses to encode a negative revision', () => {
    expect(() => encodeStoredRevision(-1n)).toThrow(RevisionCodecError);
    expect(() => encodeStoredRevision(-1n)).toThrow('exceeds the 2^63-1 ceiling');
  });

  it('refuses to encode a revision above the 2^63-1 ceiling', () => {
    expect(() => encodeStoredRevision(REVISION_CEILING + 1n)).toThrow(RevisionCodecError);
  });
});
