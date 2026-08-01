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

const decodeRevision = (value: unknown, label: string): bigint => {
  if (typeof value !== 'string' || !CANONICAL_DECIMAL.test(value)) {
    throw new Error(`${label} must be a canonical non-negative decimal string`);
  }
  return BigInt(value);
};

const decodeNullableRevision = (value: unknown): bigint | null =>
  value === null ? null : decodeRevision(value, 'exportedRevision');

export const encodeLoadedSpace = (loaded: LoadedSpace): unknown => ({
  snapshot: loaded.snapshot,
  revision: loaded.revision.toString(),
  exportedRevision: loaded.exportedRevision?.toString() ?? null,
});

export const decodeLoadedSpace = (value: unknown): LoadedSpace => {
  const record = exactRecord(value, ['snapshot', 'revision', 'exportedRevision'], 'loaded space');
  return {
    snapshot: spaceSnapshotSchema.parse(record['snapshot']),
    revision: decodeRevision(record['revision'], 'revision'),
    exportedRevision: decodeNullableRevision(record['exportedRevision']),
  };
};

export const encodeCommitRequest = (
  snapshot: SpaceSnapshot,
  expectedRevision: bigint,
): unknown => ({
  snapshot,
  expectedRevision: expectedRevision.toString(),
});

export const decodeCommitRequest = (
  value: unknown,
): { snapshot: SpaceSnapshot; expectedRevision: bigint } => {
  const record = exactRecord(value, ['snapshot', 'expectedRevision'], 'commit request');
  return {
    snapshot: spaceSnapshotSchema.parse(record['snapshot']),
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
