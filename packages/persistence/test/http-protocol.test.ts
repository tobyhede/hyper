import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import type { LoadedSpace } from '../src/backend';
import {
  decodeCommittedRevision,
  decodeLoadedSpace,
  encodeLoadedSpace,
} from '../src/http-protocol';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 2, title: 'One', graphs: [] },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};

/** The wire is JSON, so a round trip that skips it would not prove anything. */
const overTheWire = (loaded: LoadedSpace): LoadedSpace =>
  decodeLoadedSpace(JSON.parse(JSON.stringify(encodeLoadedSpace(loaded))) as unknown);

const BIGINT_MAX = 9_223_372_036_854_775_807n;

describe('revision decoding', () => {
  it('rejects a revision longer than a PostgreSQL bigint can be', () => {
    expect(() => decodeCommittedRevision({ revision: '1'.repeat(40) })).toThrow(
      'canonical non-negative decimal string',
    );
  });

  it('accepts the full width of a PostgreSQL bigint', () => {
    expect(decodeCommittedRevision({ revision: BIGINT_MAX.toString() })).toBe(BIGINT_MAX);
  });

  // The canonical pattern bounds decoding at 19 digits, which is the *width* of a
  // PostgreSQL bigint but not its range: every value from BIGINT_MAX + 1 to
  // 9999999999999999999 is 19 digits and does not fit. Left unchecked it reaches
  // the repository, where `toDatabaseRevision` is a bare cast, and a client error
  // surfaces as a database failure.
  it('rejects a 19-digit revision above the PostgreSQL bigint range', () => {
    expect(() => decodeCommittedRevision({ revision: (BIGINT_MAX + 1n).toString() })).toThrow(
      'within the PostgreSQL bigint range',
    );
    expect(() => decodeCommittedRevision({ revision: '9'.repeat(19) })).toThrow(
      'within the PostgreSQL bigint range',
    );
  });

  const nonCanonical = ['007', '+1', '1.0', '-1', '', ' 1', '1e3', '0x1', '1_000', '00'];
  for (const value of nonCanonical) {
    it(`rejects the non-canonical revision ${JSON.stringify(value)}`, () => {
      expect(() => decodeCommittedRevision({ revision: value })).toThrow(
        'canonical non-negative decimal string',
      );
    });
  }
});

describe('loaded space round trip', () => {
  it('preserves any revision a PostgreSQL bigint can hold', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: BIGINT_MAX }),
        fc.option(fc.bigInt({ min: 0n, max: BIGINT_MAX }), { nil: null }),
        (revision, exportedRevision) => {
          expect(overTheWire({ snapshot, revision, exportedRevision })).toEqual({
            snapshot,
            revision,
            exportedRevision,
          });
        },
      ),
    );
  });

  it('distinguishes a zero exported revision from an absent one', () => {
    expect(overTheWire({ snapshot, revision: 0n, exportedRevision: 0n }).exportedRevision).toBe(0n);
    expect(overTheWire({ snapshot, revision: 0n, exportedRevision: null }).exportedRevision).toBe(
      null,
    );
  });
});
