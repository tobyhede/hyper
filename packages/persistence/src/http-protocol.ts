import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { z } from 'zod';
import type { LoadedSpace, SpaceSummary } from './backend';

/**
 * A non-negative decimal with no leading zeros, bounded at 19 digits — the width
 * of a PostgreSQL `bigint` — so a hostile peer cannot hand `BigInt` an
 * arbitrarily long digit string to parse. Range is the caller's business; this
 * is only a bound on the work parsing will do, which is why the `Retry-After`
 * header in `http.ts` shares it despite being a different protocol concern.
 */
export const CANONICAL_DECIMAL = /^(0|[1-9]\d{0,18})$/;
const BIGINT_MAX = 9_223_372_036_854_775_807n;

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unexpected fields`);
  }
  return record;
};

/**
 * Zod serializes its entire issue array into `Error.message`; passing that into
 * Problem Details would expose hundreds of characters of internal schema shape
 * for one wrong field. Every decoder here throws a sentence, so this one does
 * too: the failing paths and their reasons, nothing else.
 *
 * `describeSchemaFailure` in `src/persistence/postgres-space-repository.ts`
 * summarises an import failure in this same format — first three failing paths,
 * then a count of the rest — restated rather than shared, because one
 * server-side caller does not earn a string-formatting export from a
 * browser-safe package. That format is the whole of what the two owe each other,
 * so neither moves alone: one failure should not read one way at the CLI and
 * another on the wire. `test/unit/postgres-import-decoding.test.ts` holds them
 * to it.
 *
 * That test also pins the two things this formula quietly assumes. The fold to
 * lower case loses nothing whose case is information — no message either schema
 * produces carries an acronym or a capitalised quoted identifier, Zod 3 writing
 * `Invalid uuid` rather than `Invalid UUID`. And `issues` is never empty: a
 * failed `safeParse` goes through Zod's `handleResult`, which throws rather than
 * returning a zero-issue error, so the summary always names a path and
 * `remaining` never counts below zero.
 */
const decodeSnapshot = (value: unknown, label: string): SpaceSnapshot => {
  const parsed = spaceSnapshotSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  const described = parsed.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'snapshot'} ${issue.message.toLowerCase()}`)
    .join('; ');
  const remaining = parsed.error.issues.length - 3;
  throw new Error(
    `${label} snapshot is invalid: ${described}${remaining > 0 ? ` (and ${remaining} more)` : ''}`,
  );
};

const decodeRevision = (value: unknown, label: string): bigint => {
  if (typeof value !== 'string' || !CANONICAL_DECIMAL.test(value)) {
    throw new Error(`${label} must be a canonical non-negative decimal string`);
  }
  const revision = BigInt(value);
  if (revision > BIGINT_MAX) {
    throw new Error(`${label} must be within the PostgreSQL bigint range`);
  }
  return revision;
};

const decodeNullableRevision = (value: unknown): bigint | null =>
  value === null ? null : decodeRevision(value, 'exportedRevision');

export interface LoadedSpaceJson {
  snapshot: SpaceSnapshot;
  revision: string;
  exportedRevision: string | null;
}

export const encodeLoadedSpace = (loaded: LoadedSpace): LoadedSpaceJson => ({
  snapshot: loaded.snapshot,
  revision: loaded.revision.toString(),
  exportedRevision: loaded.exportedRevision?.toString() ?? null,
});

export const decodeLoadedSpace = (value: unknown): LoadedSpace => {
  const record = exactRecord(value, ['snapshot', 'revision', 'exportedRevision'], 'loaded space');
  return {
    snapshot: decodeSnapshot(record['snapshot'], 'loaded space'),
    revision: decodeRevision(record['revision'], 'revision'),
    exportedRevision: decodeNullableRevision(record['exportedRevision']),
  };
};

export interface CommitRequestJson {
  snapshot: SpaceSnapshot;
  expectedRevision: string;
}

export const encodeCommitRequest = (
  snapshot: SpaceSnapshot,
  expectedRevision: bigint,
): CommitRequestJson => ({
  snapshot,
  expectedRevision: expectedRevision.toString(),
});

export const decodeCommitRequest = (
  value: unknown,
): { snapshot: SpaceSnapshot; expectedRevision: bigint } => {
  const record = exactRecord(value, ['snapshot', 'expectedRevision'], 'commit request');
  return {
    snapshot: decodeSnapshot(record['snapshot'], 'commit request'),
    expectedRevision: decodeRevision(record['expectedRevision'], 'expectedRevision'),
  };
};

export const decodeSpaceSummaries = (value: unknown): readonly SpaceSummary[] => {
  if (!Array.isArray(value)) throw new Error('space summaries must be an array');
  return value.map((summary) => {
    const record = exactRecord(summary, ['id', 'title'], 'space summary');
    if (typeof record['title'] !== 'string' || record['title'].length === 0) {
      throw new Error('space summary title must be non-empty');
    }
    return { id: uuidSchema.parse(record['id']), title: record['title'] };
  });
};

export const decodeCommittedRevision = (value: unknown): bigint => {
  const record = exactRecord(value, ['revision'], 'commit response');
  return decodeRevision(record['revision'], 'revision');
};

const PROBLEMS = {
  'invalid-request': { status: 400, title: 'Invalid request' },
  'authentication-required': { status: 401, title: 'Authentication required' },
  forbidden: { status: 403, title: 'Forbidden' },
  'not-found': { status: 404, title: 'Not found' },
  'method-not-allowed': { status: 405, title: 'Method not allowed' },
  'request-timeout': { status: 408, title: 'Request timeout' },
  'payload-too-large': { status: 413, title: 'Payload too large' },
  'unsupported-media-type': { status: 415, title: 'Unsupported media type' },
  'invalid-snapshot': { status: 422, title: 'Invalid Space snapshot' },
  'rate-limited': { status: 429, title: 'Rate limited' },
  'internal-error': { status: 500, title: 'Internal server error' },
  'service-unavailable': { status: 503, title: 'Service unavailable' },
} as const;

export type ProblemCode = keyof typeof PROBLEMS;
export type ProblemStatus = (typeof PROBLEMS)[ProblemCode]['status'];
export type ProblemError = {
  readonly code: 'snapshot-id-mismatch';
  readonly pointer: string;
};
type ProblemDetailsJsonFor<Code extends ProblemCode> = {
  readonly type: `urn:hyper:problem:${Code}`;
  readonly title: string;
  readonly status: (typeof PROBLEMS)[Code]['status'];
  readonly detail: string;
} & (Code extends 'invalid-request'
  ? { readonly errors?: readonly ProblemError[] }
  : { readonly errors?: never });
export type ProblemDetailsJson = {
  [Code in ProblemCode]: ProblemDetailsJsonFor<Code>;
}[ProblemCode];
export type ProblemDetails = {
  [Code in ProblemCode]: Omit<ProblemDetailsJsonFor<Code>, 'type'> & { readonly code: Code };
}[ProblemCode];

export function encodeProblemDetails<Code extends ProblemCode>(
  code: Code,
  detail: string,
): ProblemDetailsJsonFor<Code>;
export function encodeProblemDetails(
  code: 'invalid-request',
  detail: string,
  errors: readonly ProblemError[],
): ProblemDetailsJsonFor<'invalid-request'>;
export function encodeProblemDetails(
  code: ProblemCode,
  detail: string,
  errors?: readonly ProblemError[],
): ProblemDetailsJson {
  const encoded = {
    type: `urn:hyper:problem:${code}`,
    title: PROBLEMS[code].title,
    status: PROBLEMS[code].status,
    detail,
    ...(errors === undefined ? {} : { errors }),
  };
  const parsed = problemDetailsSchema.safeParse(encoded);
  if (!parsed.success) throw new Error(describeProblemFailure(parsed.error));
  return parsed.data as ProblemDetailsJson;
}

const problemErrorSchema = z
  .object({
    code: z.literal('snapshot-id-mismatch'),
    pointer: z.string().regex(/^(?:\/(?:[^~]|~[01])*)*$/),
  })
  .strict();

const problemSchema = <Code extends ProblemCode>(code: Code) =>
  z
    .object({
      type: z.literal(`urn:hyper:problem:${code}`),
      title: z.string().min(1),
      status: z.literal(PROBLEMS[code].status),
      detail: z.string().min(1),
      errors:
        code === 'invalid-request'
          ? z.array(problemErrorSchema).min(1).optional()
          : z.never().optional(),
    })
    .strict();

const problemDetailsSchema = z.discriminatedUnion('type', [
  problemSchema('invalid-request'),
  problemSchema('authentication-required'),
  problemSchema('forbidden'),
  problemSchema('not-found'),
  problemSchema('method-not-allowed'),
  problemSchema('request-timeout'),
  problemSchema('payload-too-large'),
  problemSchema('unsupported-media-type'),
  problemSchema('invalid-snapshot'),
  problemSchema('rate-limited'),
  problemSchema('internal-error'),
  problemSchema('service-unavailable'),
]);

const describeProblemFailure = (error: z.ZodError): string => {
  const issue = error.issues[0];
  if (issue?.code === 'unrecognized_keys') return 'problem details has unexpected fields';
  if (issue?.path[0] === 'type') return 'unknown problem type';
  if (issue?.path[0] === 'status') return 'problem status does not match problem type';
  if (issue?.path.at(-1) === 'pointer') {
    return 'problem error pointer must be an RFC 6901 JSON Pointer';
  }
  if (issue?.path[0] === 'errors') return 'problem errors must be a non-empty array';
  if (issue?.path[0] === 'title') return 'problem title must be non-empty';
  if (issue?.path[0] === 'detail') return 'problem detail must be non-empty';
  return 'problem details must match the Hyper problem contract';
};

export const decodeProblemDetails = (value: unknown): ProblemDetails => {
  const parsed = problemDetailsSchema.safeParse(value);
  if (!parsed.success) throw new Error(describeProblemFailure(parsed.error));
  const problem = parsed.data;
  const code = problem.type.slice('urn:hyper:problem:'.length) as ProblemCode;
  return {
    code,
    title: problem.title,
    status: problem.status,
    detail: problem.detail,
    ...(problem.errors === undefined ? {} : { errors: problem.errors }),
  } as ProblemDetails;
};
