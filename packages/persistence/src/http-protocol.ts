import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
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

export const problemCatalogue = {
  'invalid-request': {
    type: 'https://hyper.dev/problems/invalid-request',
    title: 'Invalid request',
    status: 400,
  },
  'invalid-space-id': {
    type: 'https://hyper.dev/problems/invalid-space-id',
    title: 'Invalid Space id',
    status: 400,
  },
  'unsupported-media-type': {
    type: 'https://hyper.dev/problems/unsupported-media-type',
    title: 'Unsupported media type',
    status: 415,
  },
  'payload-too-large': {
    type: 'https://hyper.dev/problems/payload-too-large',
    title: 'Payload too large',
    status: 413,
  },
  'not-found': { type: 'https://hyper.dev/problems/not-found', title: 'Not found', status: 404 },
  'method-not-allowed': {
    type: 'https://hyper.dev/problems/method-not-allowed',
    title: 'Method not allowed',
    status: 405,
  },
  'persistence-unavailable': {
    type: 'https://hyper.dev/problems/persistence-unavailable',
    title: 'Persistence unavailable',
    status: 503,
  },
  'invalid-snapshot': {
    type: 'https://hyper.dev/problems/invalid-snapshot',
    title: 'Invalid Space snapshot',
    status: 422,
  },
  unauthorized: {
    type: 'https://hyper.dev/problems/unauthorized',
    title: 'Unauthorized',
    status: 401,
  },
  forbidden: { type: 'https://hyper.dev/problems/forbidden', title: 'Forbidden', status: 403 },
  'request-timeout': {
    type: 'https://hyper.dev/problems/request-timeout',
    title: 'Request timed out',
    status: 408,
  },
  'rate-limited': {
    type: 'https://hyper.dev/problems/rate-limited',
    title: 'Rate limited',
    status: 429,
  },
  'internal-error': {
    type: 'https://hyper.dev/problems/internal-error',
    title: 'Internal server error',
    status: 500,
  },
} as const;

export type HyperProblemCode = keyof typeof problemCatalogue;
export type HyperProblemStatus = (typeof problemCatalogue)[HyperProblemCode]['status'];
export type HyperProblemType = (typeof problemCatalogue)[HyperProblemCode]['type'];

export interface ProblemError {
  code: 'invalid-value';
  pointer: string;
}

export interface ProblemDetails {
  type: HyperProblemType;
  title: string;
  status: HyperProblemStatus;
  detail: string;
  errors?: ProblemError[];
}

const JSON_POINTER = /^(?:|(?:\/(?:[^~]|~[01])*)+)$/;

const problemCodeByType = new Map<HyperProblemType, HyperProblemCode>(
  Object.entries(problemCatalogue).map(([code, problem]) => [
    problem.type,
    code as HyperProblemCode,
  ]),
);

export const problemCodeForType = (type: HyperProblemType): HyperProblemCode => {
  const code = problemCodeByType.get(type);
  if (code === undefined) throw new Error('problem details has an unknown type');
  return code;
};

export const encodeProblemDetails = (
  code: HyperProblemCode,
  detail: string,
  errors?: readonly ProblemError[],
): ProblemDetails => {
  if (detail.length === 0) throw new Error('problem detail must be non-empty');
  for (const error of errors ?? []) {
    if (!JSON_POINTER.test(error.pointer)) {
      throw new Error('problem error pointer must be an RFC 6901 JSON Pointer');
    }
  }
  const problem = problemCatalogue[code];
  const result: ProblemDetails = { ...problem, detail };
  if (errors !== undefined && errors.length > 0) result.errors = [...errors];
  return result;
};

export const decodeProblemDetails = (value: unknown): ProblemDetails => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('problem details must be an object');
  }
  const candidate = value as Record<string, unknown>;
  const keys =
    candidate['errors'] === undefined
      ? ['type', 'title', 'status', 'detail']
      : ['type', 'title', 'status', 'detail', 'errors'];
  const record = exactRecord(value, keys, 'problem details');
  if (typeof record['type'] !== 'string') throw new Error('problem type must be a string');
  if (!problemCodeByType.has(record['type'] as HyperProblemType)) {
    throw new Error('problem details has an unknown type');
  }
  const code = problemCodeForType(record['type'] as HyperProblemType);
  const expected = problemCatalogue[code];
  if (record['title'] !== expected.title) throw new Error('problem title does not match its type');
  if (record['status'] !== expected.status)
    throw new Error('problem status does not match its type');
  if (typeof record['detail'] !== 'string' || record['detail'].length === 0) {
    throw new Error('problem detail must be non-empty');
  }
  let errors: readonly ProblemError[] | undefined;
  if (record['errors'] !== undefined) {
    if (!Array.isArray(record['errors']) || record['errors'].length === 0) {
      throw new Error('problem errors must be a non-empty array');
    }
    errors = record['errors'].map((value) => {
      const error = exactRecord(value, ['code', 'pointer'], 'problem error');
      if (error['code'] !== 'invalid-value') throw new Error('problem error has an unknown code');
      if (typeof error['pointer'] !== 'string' || !JSON_POINTER.test(error['pointer'])) {
        throw new Error('problem error pointer must be an RFC 6901 JSON Pointer');
      }
      return { code: error['code'], pointer: error['pointer'] };
    });
  }
  return encodeProblemDetails(code, record['detail'], errors);
};

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  // SAFETY: checked above — value is a non-null, non-array object, so it is
  // safe to inspect as a string-keyed record; each value stays unknown until
  // the caller-specific decoders below validate it.
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unexpected fields`);
  }
  return record;
};

/**
 * Zod serializes its entire issue array into `Error.message`. The wire codec
 * needs concise corrective detail instead: the failing paths and their reasons,
 * nothing else.
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

export interface DecodedCommitRequest {
  snapshot: SpaceSnapshot;
  expectedRevision: bigint;
}

export const decodeCommitRequest = (value: unknown): DecodedCommitRequest => {
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
