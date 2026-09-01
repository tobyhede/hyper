import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import type { SpaceAggregateError, SpaceError } from '@project/graph';
import type { LoadedSpace } from '../src/backend';
import {
  decodeCommitConflict,
  decodeCommitRefusal,
  decodeCommitResponse,
  decodeCommitRequest,
  decodeProblemDetails,
  decodeCommittedRevision,
  decodeLoadedAggregate,
  decodeLoadedSpace,
  decodeSpaceSummaries,
  encodeCommitConflict,
  encodeCommitRefusal,
  encodeCommitResponse,
  encodeCommitRequest,
  encodeLoadedAggregate,
  encodeProblemDetails,
  encodeLoadedSpace,
  problemCatalogue,
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
  // SAFETY: `JSON.parse` returns `any`; the cast narrows it to `unknown` so
  // `decodeLoadedSpace`'s own runtime validation is what's under test here,
  // not an unchecked `any` flowing straight through.
  decodeLoadedSpace(JSON.parse(JSON.stringify(encodeLoadedSpace(loaded))) as unknown);

const BIGINT_MAX = 9_223_372_036_854_775_807n;

describe('aggregate wire protocol', () => {
  const loaded: LoadedSpace = { snapshot, revision: BIGINT_MAX, exportedRevision: null };
  const secondId = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
  const createdId = uuidSchema.parse('00000000-0000-4000-8000-000000000098');
  const created: SpaceSnapshot = { ...snapshot, id: createdId };
  const second: LoadedSpace = {
    ...loaded,
    snapshot: { ...snapshot, id: secondId },
  };

  it('round-trips complete reads, authored commits, successes, and complete conflicts', () => {
    const aggregate = { metaSpaceId: SPACE_ID, spaces: [loaded, second] };
    expect(decodeLoadedAggregate(encodeLoadedAggregate(aggregate))).toEqual(aggregate);

    const request = {
      changes: [
        {
          kind: 'update' as const,
          spaceId: SPACE_ID,
          snapshot,
          expectedRevision: BIGINT_MAX,
        },
        // A create carries a Space and no expected revision, so it is the one
        // arm whose encoding is not the shared `expectedRevision.toString()`
        // path the other two share.
        { kind: 'create' as const, spaceId: createdId, snapshot: created },
        { kind: 'delete' as const, spaceId: secondId, expectedRevision: 7n },
      ] as const,
    };
    expect(decodeCommitRequest(encodeCommitRequest(request))).toEqual(request);

    const committed = {
      kind: 'committed' as const,
      revisions: [{ spaceId: SPACE_ID, revision: BIGINT_MAX }],
      deletedSpaceIds: [secondId],
    };
    expect(decodeCommitResponse(encodeCommitResponse(committed))).toEqual(committed);

    const conflict = {
      kind: 'conflict' as const,
      conflicts: [
        { spaceId: SPACE_ID, current: loaded },
        { spaceId: secondId, current: undefined },
      ],
    };
    expect(decodeCommitConflict(encodeCommitConflict(conflict))).toEqual(conflict);
  });

  it('names the field in every malformed-UUID decoder error', () => {
    // Zod's own `parse` message reports its issue list rather than the field,
    // so a decoder that fell back to it answered a wire error with prose the
    // reader could not trace to a key. Every UUID on the response and refusal
    // side now goes through the same `<label> must be a UUID` shape the request
    // decoder already used.
    expect(() => decodeLoadedAggregate({ metaSpaceId: 'nope', spaces: [] })).toThrow(
      'loaded aggregate Meta Space id must be a UUID',
    );
    expect(() =>
      decodeCommitResponse({
        revisions: [{ spaceId: 'nope', revision: '1' }],
        deletedSpaceIds: [],
      }),
    ).toThrow('committed Space id must be a UUID');
    expect(() => decodeCommitResponse({ revisions: [], deletedSpaceIds: ['nope'] })).toThrow(
      'deleted Space id must be a UUID',
    );
    expect(() => decodeCommitConflict({ conflicts: [{ spaceId: 'nope', current: null }] })).toThrow(
      'conflicted Space id must be a UUID',
    );
    expect(() =>
      decodeCommitRefusal({ errors: [{ kind: 'ordinary-space-unreferenced', spaceId: 'nope' }] }),
    ).toThrow('unreferenced Space id must be a UUID');
    expect(() => decodeSpaceSummaries([{ id: 'nope', title: 'One' }])).toThrow(
      'space summary id must be a UUID',
    );
  });

  it('strictly rejects empty, duplicate, mismatched, and extra-field changes', () => {
    expect(() => decodeCommitRequest({ changes: [] })).toThrow('non-empty');
    expect(() =>
      decodeCommitRequest({
        changes: [
          { kind: 'delete', spaceId: SPACE_ID, expectedRevision: '1' },
          { kind: 'delete', spaceId: SPACE_ID, expectedRevision: '1' },
        ],
      }),
    ).toThrow('more than once');
    expect(() =>
      decodeCommitRequest({
        changes: [{ kind: 'update', spaceId: secondId, snapshot, expectedRevision: '1' }],
      }),
    ).toThrow('does not match');
    expect(() =>
      decodeCommitRequest({
        changes: [{ kind: 'delete', spaceId: SPACE_ID, expectedRevision: '1', extra: 1 }],
      }),
    ).toThrow('unexpected fields');
  });

  it.each(['create', 'update', 'delete'] as const)(
    'summarises an invalid %s change Space id',
    (kind) => {
      const value =
        kind === 'create'
          ? { kind, spaceId: 'not-a-uuid', snapshot }
          : kind === 'update'
            ? { kind, spaceId: 'not-a-uuid', snapshot, expectedRevision: '1' }
            : { kind, spaceId: 'not-a-uuid', expectedRevision: '1' };
      expect(() => decodeCommitRequest({ changes: [value] })).toThrow(
        'change Space id must be a UUID',
      );
    },
  );

  it('round-trips stable aggregate refusal identities and locations', () => {
    const refusal = {
      kind: 'aggregate-refused' as const,
      errors: [
        {
          kind: 'space-card-target-missing' as const,
          spaceId: SPACE_ID,
          cardId: CARD_ID,
          targetSpaceId: secondId,
        },
      ],
    };

    expect(decodeCommitRefusal(encodeCommitRefusal(refusal))).toEqual(refusal);
  });

  it('round-trips every aggregate and nested Space intake refusal identity', () => {
    const described = { ref: 'ref', message: 'message' };
    const intakeErrors: SpaceError[] = [
      { kind: 'invalid-shape', message: 'message' },
      { kind: 'unsupported-version', message: 'message' },
      { kind: 'retired-space-graphs', message: 'message' },
      { kind: 'missing-frontmatter', path: 'card.md', message: 'message' },
      { kind: 'unterminated-frontmatter', path: 'card.md', message: 'message' },
      { kind: 'invalid-yaml', path: 'card.md', message: 'message' },
      { kind: 'invalid-frontmatter', path: 'card.md', message: 'message' },
      { kind: 'duplicate-card-id', ...described },
      { kind: 'duplicate-graph-id', ...described },
      { kind: 'duplicate-layout-id', ...described },
      { kind: 'space-view-id-collision', ...described },
      { kind: 'layout-member-missing-card', ...described },
      { kind: 'layout-active-graph-missing', ...described },
      { kind: 'layout-active-graph-outside-layout', ...described },
      { kind: 'graph-edge-missing-card', ...described },
      { kind: 'graph-edge-card-outside-layout', ...described },
      { kind: 'unresolved-default-renderer', ...described },
      { kind: 'duplicate-graph-edge', ...described },
      { kind: 'unresolved-alias-target', ...described },
      { kind: 'alias-self-reference', ...described },
      { kind: 'alias-targets-alias', ...described },
      { kind: 'alias-target-must-own-content', ...described },
      { kind: 'space-card-reference-cycle', ...described },
    ];
    const location = { spaceId: SPACE_ID, cardId: CARD_ID, targetSpaceId: secondId };
    const errors: SpaceAggregateError[] = [
      { kind: 'invalid-space-snapshot', snapshotIndex: 0, errors: intakeErrors },
      { kind: 'duplicate-space-id', spaceId: SPACE_ID, snapshotIndexes: [0, 2] },
      { kind: 'duplicate-card-id', cardId: CARD_ID, spaceIds: [SPACE_ID, secondId] },
      { kind: 'meta-space-missing', metaSpaceId: SPACE_ID },
      { kind: 'space-card-target-missing', ...location },
      { kind: 'space-card-reference-cycle', ...location },
      { kind: 'ordinary-space-unreferenced', spaceId: secondId },
      { kind: 'space-card-space-view-missing', ...location, spaceViewId: secondId },
      { kind: 'space-card-graph-missing', ...location, graphId: secondId },
      {
        kind: 'space-card-graph-outside-space-view',
        ...location,
        spaceViewId: SPACE_ID,
        graphId: secondId,
      },
    ];
    const refusal = { kind: 'aggregate-refused' as const, errors };

    expect(decodeCommitRefusal(encodeCommitRefusal(refusal))).toEqual(refusal);
  });

  it('rejects unknown aggregate refusal identities and fields', () => {
    expect(() => decodeCommitRefusal({ errors: [{ kind: 'invented' }] })).toThrow('unknown kind');
    expect(() =>
      decodeCommitRefusal({
        errors: [
          {
            kind: 'ordinary-space-unreferenced',
            spaceId: SPACE_ID,
            extra: true,
          },
        ],
      }),
    ).toThrow('unexpected fields');
  });

  it('strictly rejects malformed aggregate refusal containers and nested values', () => {
    const malformed: readonly [unknown, string][] = [
      [{ errors: [] }, 'aggregate refusal errors must be a non-empty array'],
      [{ errors: 'nope' }, 'aggregate refusal errors must be a non-empty array'],
      [{ errors: [null] }, 'aggregate refusal must be an object with a kind'],
      [{ errors: [{ kind: 7 }] }, 'aggregate refusal kind must be a string'],
      [
        { errors: [{ kind: 'invalid-space-snapshot', snapshotIndex: 0, errors: [] }] },
        'Space intake errors must be a non-empty array',
      ],
      [
        { errors: [{ kind: 'invalid-space-snapshot', snapshotIndex: 0, errors: 'nope' }] },
        'Space intake errors must be a non-empty array',
      ],
      [
        {
          errors: [
            {
              kind: 'invalid-space-snapshot',
              snapshotIndex: 0,
              errors: [{ kind: 'invalid-shape', message: 7 }],
            },
          ],
        },
        'Space intake message must be a string',
      ],
      [
        {
          errors: [
            {
              kind: 'invalid-space-snapshot',
              snapshotIndex: 0,
              errors: [{ kind: 'invalid-yaml', path: 7, message: 'message' }],
            },
          ],
        },
        'Card file path must be a string',
      ],
      [
        {
          errors: [
            {
              kind: 'invalid-space-snapshot',
              snapshotIndex: 0,
              errors: [{ kind: 'duplicate-card-id', ref: 7, message: 'message' }],
            },
          ],
        },
        'Space reference must be a string',
      ],
      [
        {
          errors: [
            {
              kind: 'invalid-space-snapshot',
              snapshotIndex: 0,
              errors: [{ kind: 'invented' }],
            },
          ],
        },
        'Space intake error has an unknown kind',
      ],
      [
        { errors: [{ kind: 'duplicate-space-id', spaceId: SPACE_ID, snapshotIndexes: 'nope' }] },
        'snapshot indexes must be an array',
      ],
      [
        { errors: [{ kind: 'duplicate-space-id', spaceId: SPACE_ID, snapshotIndexes: [1.5] }] },
        'snapshot index must be a non-negative safe integer',
      ],
      [
        { errors: [{ kind: 'duplicate-card-id', cardId: CARD_ID, spaceIds: 'nope' }] },
        'Space ids must be an array',
      ],
    ];

    for (const [value, message] of malformed) {
      expect(() => decodeCommitRefusal(value)).toThrow(message);
    }
  });

  it('strictly rejects malformed aggregate, success, and conflict arrays', () => {
    expect(() => decodeLoadedAggregate({ metaSpaceId: SPACE_ID, spaces: 'nope' })).toThrow(
      'must be an array',
    );
    expect(() => decodeCommitResponse({ revisions: 'nope', deletedSpaceIds: [] })).toThrow(
      'must be an array',
    );
    expect(() => decodeCommitResponse({ revisions: [], deletedSpaceIds: 'nope' })).toThrow(
      'must be an array',
    );
    expect(() => decodeCommitConflict({ conflicts: [] })).toThrow('non-empty array');
    expect(() => decodeSpaceSummaries('nope')).toThrow('must be an array');
  });
});

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
        // SAFETY: `Object.keys` widens problemCatalogue's own keys to
        // `string[]`, but every key iterated here comes from problemCatalogue
        // itself, so each one is a HyperProblemCode literal.
        fc.constantFrom<HyperProblemCode>(...(Object.keys(problemCatalogue) as HyperProblemCode[])),
        fc.string({ minLength: 1 }),
        (code, detail) => {
          const encoded = encodeProblemDetails(code, detail, [
            { code: 'invalid-value', pointer: '' },
          ]);
          // SAFETY: `JSON.parse`'s return type is `any`; asserting `unknown`
          // stops that `any` from propagating past this call so
          // decodeProblemDetails has to validate the shape instead of
          // trusting it.
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
    // SAFETY: deliberately invalid input for problemCodeForType's own runtime
    // check to reject.
    expect(() => problemCodeForType('https://hyper.dev/problems/nope' as HyperProblemType)).toThrow(
      'problem details has an unknown type',
    );
  });

  it('falls back to "snapshot" when a schema failure has no field path', () => {
    expect(() =>
      decodeCommitRequest({
        changes: [{ kind: 'create', spaceId: SPACE_ID, snapshot: null }],
      }),
    ).toThrow(/snapshot is invalid: snapshot /);
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
