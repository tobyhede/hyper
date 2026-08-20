import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import type { LoadedSpace } from '../src/backend';
import {
  decodeCommitRequest,
  decodeProblemDetails,
  decodeCommittedRevision,
  decodeLoadedSpace,
  decodeSpaceSummaries,
  encodeProblemDetails,
  encodeLoadedSpace,
  problemCodeForType,
} from '../src/http-protocol';
import type { HyperProblemCode, HyperProblemType } from '../src/http-protocol';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
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

describe('Problem Details', () => {
  it('round trips every problem identity and an RFC 6901 whole-document pointer', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<HyperProblemCode>(
          'invalid-request',
          'invalid-space-id',
          'unsupported-media-type',
          'payload-too-large',
          'not-found',
          'method-not-allowed',
          'persistence-unavailable',
          'invalid-snapshot',
          'unauthorized',
          'forbidden',
          'request-timeout',
          'rate-limited',
          'internal-error',
        ),
        fc.string({ minLength: 1 }),
        (code, detail) => {
          const encoded = encodeProblemDetails(code, detail, [
            { code: 'invalid-value', pointer: '' },
          ]);
          expect(decodeProblemDetails(JSON.parse(JSON.stringify(encoded)) as unknown)).toEqual(
            encoded,
          );
        },
      ),
    );
  });

  it('does not encode an empty errors extension', () => {
    expect(encodeProblemDetails('invalid-request', 'Correct the request.', [])).not.toHaveProperty(
      'errors',
    );
  });

  it('refuses detail or pointers that its decoder could not read back', () => {
    expect(() => encodeProblemDetails('invalid-request', '')).toThrow(
      'problem detail must be non-empty',
    );
    expect(() =>
      encodeProblemDetails('invalid-request', 'Correct the request.', [
        { code: 'invalid-value', pointer: 'snapshot/id' },
      ]),
    ).toThrow('JSON Pointer');
  });

  it('strictly rejects unknown problem types, fields, and malformed pointers', () => {
    const valid = encodeProblemDetails('invalid-request', 'Correct the request.', [
      { code: 'invalid-value', pointer: '/snapshot/id' },
    ]);
    expect(() => decodeProblemDetails({ ...valid, extra: true })).toThrow('unexpected fields');
    expect(() =>
      decodeProblemDetails({ ...valid, type: 'https://example.test/problems/nope' }),
    ).toThrow('unknown type');
    expect(() =>
      decodeProblemDetails({
        ...valid,
        errors: [{ code: 'invalid-value', pointer: 'snapshot/id' }],
      }),
    ).toThrow('JSON Pointer');
  });

  it('rejects a Problem Details value that is not an object', () => {
    expect(() => decodeProblemDetails('nope')).toThrow('problem details must be an object');
    expect(() => decodeProblemDetails(null)).toThrow('problem details must be an object');
    expect(() => decodeProblemDetails([])).toThrow('problem details must be an object');
  });

  it('rejects a Problem Details type that is not a string', () => {
    expect(() =>
      decodeProblemDetails({ type: 404, title: 'Not found', status: 404, detail: 'x' }),
    ).toThrow('problem type must be a string');
  });

  it('rejects a Problem Details title or status that disagrees with its type', () => {
    const valid = encodeProblemDetails('not-found', 'Missing.');
    expect(() => decodeProblemDetails({ ...valid, title: 'Wrong title' })).toThrow(
      'problem title does not match its type',
    );
    expect(() => decodeProblemDetails({ ...valid, status: 400 })).toThrow(
      'problem status does not match its type',
    );
  });

  it('rejects a Problem Details detail that is missing or empty', () => {
    const valid = encodeProblemDetails('not-found', 'Missing.');
    expect(() => decodeProblemDetails({ ...valid, detail: 42 })).toThrow(
      'problem detail must be non-empty',
    );
    expect(() => decodeProblemDetails({ ...valid, detail: '' })).toThrow(
      'problem detail must be non-empty',
    );
  });

  it('rejects a Problem Details errors extension that is not a non-empty array', () => {
    const valid = encodeProblemDetails('not-found', 'Missing.');
    expect(() => decodeProblemDetails({ ...valid, errors: 'nope' })).toThrow(
      'problem errors must be a non-empty array',
    );
    expect(() => decodeProblemDetails({ ...valid, errors: [] })).toThrow(
      'problem errors must be a non-empty array',
    );
  });

  it('rejects a Problem Details errors entry with an unknown code', () => {
    const valid = encodeProblemDetails('not-found', 'Missing.');
    expect(() =>
      decodeProblemDetails({ ...valid, errors: [{ code: 'nope', pointer: '/x' }] }),
    ).toThrow('problem error has an unknown code');
  });

  it('rejects an unrecognized problem type at the codeForType boundary', () => {
    expect(() => problemCodeForType('https://hyper.dev/problems/nope' as HyperProblemType)).toThrow(
      'problem details has an unknown type',
    );
  });

  it('falls back to "snapshot" when a schema failure has no field path', () => {
    expect(() => decodeCommitRequest({ snapshot: null, expectedRevision: '0' })).toThrow(
      /snapshot is invalid: snapshot /,
    );
  });
});

describe('space summaries', () => {
  it('rejects a summary with a missing or empty title', () => {
    expect(() => decodeSpaceSummaries([{ id: SPACE_ID, title: '' }])).toThrow(
      'space summary title must be non-empty',
    );
    expect(() => decodeSpaceSummaries([{ id: SPACE_ID, title: 42 }])).toThrow(
      'space summary title must be non-empty',
    );
  });
});
