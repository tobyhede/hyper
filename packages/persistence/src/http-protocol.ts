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
 * Zod serializes its entire issue array into `Error.message`, and the HTTP layer
 * ships that verbatim as the `{ message: string }` error contract — hundreds of
 * characters of internal schema shape for one wrong field, JSON nested inside a
 * field clients render as prose. Every other decoder here throws a sentence, so
 * this one does too: the failing paths and their reasons, nothing else.
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

export const decodeErrorMessage = (value: unknown): string => {
  const record = exactRecord(value, ['message'], 'error response');
  if (typeof record['message'] !== 'string' || record['message'].length === 0) {
    throw new Error('error message must be non-empty');
  }
  return record['message'];
};
