import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import type { SpaceAggregateError, SpaceError } from '@project/graph';
import type {
  AggregateLoadResult,
  CommitResult,
  LoadedSpace,
  SpaceChange,
  SpaceCommit,
  SpaceSummary,
} from './backend';

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
    // SAFETY: `Object.entries` widens problemCatalogue's own keys to `string`,
    // but every entry iterated here comes from problemCatalogue itself, so
    // each key is one of its HyperProblemCode literals.
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
  // SAFETY: checked above — value is a non-null, non-array object, so it is
  // safe to inspect as a string-keyed record; each value stays unknown until
  // exactRecord validates the expected keys below.
  const candidate = value as Record<string, unknown>;
  const keys =
    candidate['errors'] === undefined
      ? ['type', 'title', 'status', 'detail']
      : ['type', 'title', 'status', 'detail', 'errors'];
  const record = exactRecord(value, keys, 'problem details');
  if (typeof record['type'] !== 'string') throw new Error('problem type must be a string');
  // SAFETY: record['type'] is narrowed to `string` above, but only the `.has`
  // check below proves it is one of HyperProblemType's known literals — that
  // check is what this assertion stands in for.
  if (!problemCodeByType.has(record['type'] as HyperProblemType)) {
    throw new Error('problem details has an unknown type');
  }
  // SAFETY: the `.has` check above already confirmed record['type'] is one of
  // HyperProblemType's literals; it just couldn't narrow the index access
  // itself, since `record` is a plain string-keyed record, not a union type.
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

export type CommitRequestJson = {
  changes: readonly (
    | { kind: 'create'; spaceId: string; snapshot: SpaceSnapshot }
    | { kind: 'update'; spaceId: string; snapshot: SpaceSnapshot; expectedRevision: string }
    | { kind: 'delete'; spaceId: string; expectedRevision: string }
  )[];
};

export const encodeCommitRequest = (request: SpaceCommit): CommitRequestJson => ({
  changes: request.changes.map((change) =>
    change.kind === 'create'
      ? change
      : { ...change, expectedRevision: change.expectedRevision.toString() },
  ),
});

export type DecodedCommitRequest = SpaceCommit;

export const decodeCommitRequest = (value: unknown): DecodedCommitRequest => {
  const request = exactRecord(value, ['changes'], 'commit request');
  if (!Array.isArray(request['changes'])) throw new Error('commit changes must be an array');
  const changes = request['changes'].map((value: unknown): SpaceChange => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('commit change must be an object');
    }
    // The discriminant only, so the arm below can name the exact keys its shape
    // allows. `exactRecord` cannot do it here — the allowed set is not known
    // until `kind` is read, and passing the value's own keys would make the
    // exactness check hold for every input.
    const kind: unknown = Object.hasOwn(value, 'kind')
      ? Object.getOwnPropertyDescriptor(value, 'kind')?.value
      : undefined;
    if (kind === 'create') {
      const change = exactRecord(value, ['kind', 'spaceId', 'snapshot'], 'create change');
      return {
        kind,
        spaceId: requiredUuid(change['spaceId'], 'change Space id'),
        snapshot: decodeSnapshot(change['snapshot'], 'create change'),
      };
    }
    if (kind === 'update') {
      const change = exactRecord(
        value,
        ['kind', 'spaceId', 'snapshot', 'expectedRevision'],
        'update change',
      );
      return {
        kind,
        spaceId: requiredUuid(change['spaceId'], 'change Space id'),
        snapshot: decodeSnapshot(change['snapshot'], 'update change'),
        expectedRevision: decodeRevision(change['expectedRevision'], 'expectedRevision'),
      };
    }
    if (kind === 'delete') {
      const change = exactRecord(value, ['kind', 'spaceId', 'expectedRevision'], 'delete change');
      return {
        kind,
        spaceId: requiredUuid(change['spaceId'], 'change Space id'),
        expectedRevision: decodeRevision(change['expectedRevision'], 'expectedRevision'),
      };
    }
    throw new Error('commit change has an unknown kind');
  });
  const [first, ...rest] = changes;
  if (first === undefined) throw new Error('commit changes must be non-empty');
  const named = new Set<UUID>();
  for (const change of changes) {
    if (named.has(change.spaceId))
      throw new Error(`Space ${change.spaceId} is named more than once`);
    named.add(change.spaceId);
    if (change.kind !== 'delete' && change.snapshot.id !== change.spaceId) {
      throw new Error(`Change Space id ${change.spaceId} does not match its snapshot`);
    }
  }
  return { changes: [first, ...rest] };
};

export type LoadedAggregateJson =
  | { kind: 'uninitialized' }
  | { kind: 'loaded'; aggregate: { metaSpaceId: string; spaces: readonly LoadedSpaceJson[] } };

export const encodeLoadedAggregate = (result: AggregateLoadResult): LoadedAggregateJson =>
  result.kind === 'uninitialized'
    ? result
    : {
        kind: 'loaded',
        aggregate: {
          metaSpaceId: result.aggregate.metaSpaceId,
          spaces: result.aggregate.spaces.map(encodeLoadedSpace),
        },
      };

export const decodeLoadedAggregate = (value: unknown): AggregateLoadResult => {
  try {
    const uninitialized = exactRecord(value, ['kind'], 'uninitialized aggregate load result');
    if (uninitialized['kind'] === 'uninitialized') return { kind: 'uninitialized' };
  } catch {
    // The loaded shape is decoded below with its own exact-field diagnostic.
  }
  const record = exactRecord(value, ['kind', 'aggregate'], 'loaded aggregate load result');
  if (record['kind'] !== 'loaded') throw new Error('aggregate load result kind is invalid');
  const aggregate = exactRecord(record['aggregate'], ['metaSpaceId', 'spaces'], 'loaded aggregate');
  if (!Array.isArray(aggregate['spaces']))
    throw new Error('loaded aggregate spaces must be an array');
  return {
    kind: 'loaded',
    aggregate: {
      metaSpaceId: requiredUuid(aggregate['metaSpaceId'], 'loaded aggregate Meta Space id'),
      spaces: aggregate['spaces'].map(decodeLoadedSpace),
    },
  };
};

type Committed = Extract<CommitResult, { kind: 'committed' }>;
type Conflict = Extract<CommitResult, { kind: 'conflict' }>;
type AggregateRefused = Extract<CommitResult, { kind: 'aggregate-refused' }>;

export interface CommitResponseBody {
  readonly revisions: readonly { readonly spaceId: string; readonly revision: string }[];
  readonly deletedSpaceIds: readonly string[];
}

export const encodeCommitResponse = (result: Committed): CommitResponseBody => ({
  revisions: result.revisions.map(({ spaceId, revision }) => ({
    spaceId,
    revision: revision.toString(),
  })),
  deletedSpaceIds: result.deletedSpaceIds,
});

export const decodeCommitResponse = (value: unknown): Committed => {
  const record = exactRecord(value, ['revisions', 'deletedSpaceIds'], 'commit response');
  if (!Array.isArray(record['revisions'])) throw new Error('commit revisions must be an array');
  if (!Array.isArray(record['deletedSpaceIds'])) {
    throw new Error('deleted Space ids must be an array');
  }
  return {
    kind: 'committed',
    revisions: record['revisions'].map((entry) => {
      const revision = exactRecord(entry, ['spaceId', 'revision'], 'committed Space revision');
      return {
        spaceId: requiredUuid(revision['spaceId'], 'committed Space id'),
        revision: decodeRevision(revision['revision'], 'revision'),
      };
    }),
    deletedSpaceIds: record['deletedSpaceIds'].map((id) => requiredUuid(id, 'deleted Space id')),
  };
};

export interface CommitConflictBody {
  readonly conflicts: readonly {
    readonly spaceId: string;
    readonly current: LoadedSpaceJson | null;
  }[];
}

export const encodeCommitConflict = (result: Conflict): CommitConflictBody => ({
  conflicts: result.conflicts.map(({ spaceId, current }) => ({
    spaceId,
    current: current === undefined ? null : encodeLoadedSpace(current),
  })),
});

export const decodeCommitConflict = (value: unknown): Conflict => {
  const record = exactRecord(value, ['conflicts'], 'commit conflict');
  if (!Array.isArray(record['conflicts']) || record['conflicts'].length === 0) {
    throw new Error('commit conflicts must be a non-empty array');
  }
  return {
    kind: 'conflict',
    conflicts: record['conflicts'].map((entry) => {
      const conflict = exactRecord(entry, ['spaceId', 'current'], 'Space conflict');
      return {
        spaceId: requiredUuid(conflict['spaceId'], 'conflicted Space id'),
        current: conflict['current'] === null ? undefined : decodeLoadedSpace(conflict['current']),
      };
    }),
  };
};

export interface CommitRefusalBody {
  readonly errors: readonly (
    | Extract<SpaceAggregateError, { readonly kind: 'invalid-space-snapshot' }>
    | {
        readonly kind: 'duplicate-space-id';
        readonly spaceId: string;
        readonly snapshotIndexes: readonly number[];
      }
    | {
        readonly kind: 'duplicate-card-id';
        readonly cardId: string;
        readonly spaceIds: readonly string[];
      }
    | { readonly kind: 'meta-space-missing'; readonly metaSpaceId: string }
    | {
        readonly kind: 'space-card-target-missing';
        readonly spaceId: string;
        readonly cardId: string;
        readonly targetSpaceId: string;
      }
    | {
        readonly kind: 'space-card-reference-cycle';
        readonly spaceId: string;
        readonly cardId: string;
        readonly targetSpaceId: string;
      }
    | { readonly kind: 'ordinary-space-unreferenced'; readonly spaceId: string }
    | {
        readonly kind: 'space-card-layout-missing';
        readonly spaceId: string;
        readonly cardId: string;
        readonly targetSpaceId: string;
        readonly layoutId: string | undefined;
      }
    | {
        readonly kind: 'space-card-graph-missing';
        readonly spaceId: string;
        readonly cardId: string;
        readonly targetSpaceId: string;
        readonly graphId: string;
      }
    | {
        readonly kind: 'space-card-graph-outside-layout';
        readonly spaceId: string;
        readonly cardId: string;
        readonly targetSpaceId: string;
        readonly layoutId: string;
        readonly graphId: string;
      }
  )[];
}

export const encodeCommitRefusal = (result: AggregateRefused): CommitRefusalBody => ({
  errors: result.errors,
});

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
};

const requiredUuid = (value: unknown, label: string): UUID => {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${label} must be a UUID`);
  return parsed.data;
};

const requiredIndex = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
};

const discriminant = (value: unknown, label: string): string => {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('kind' in value)) {
    throw new Error(`${label} must be an object with a kind`);
  }
  return requiredString(value.kind, `${label} kind`);
};

const decodeSpaceError = (value: unknown): SpaceError => {
  const kind = discriminant(value, 'Space intake error');
  switch (kind) {
    case 'invalid-shape':
    case 'unsupported-version':
    case 'retired-space-graphs': {
      const error = exactRecord(value, ['kind', 'message'], 'Space intake error');
      return { kind, message: requiredString(error['message'], 'Space intake message') };
    }
    case 'missing-frontmatter':
    case 'unterminated-frontmatter':
    case 'invalid-yaml':
    case 'invalid-frontmatter': {
      const error = exactRecord(value, ['kind', 'path', 'message'], 'Card file error');
      return {
        kind,
        path: requiredString(error['path'], 'Card file path'),
        message: requiredString(error['message'], 'Card file message'),
      };
    }
    case 'duplicate-card-id':
    case 'duplicate-graph-id':
    case 'duplicate-layout-id':
    case 'layout-member-missing-card':
    case 'layout-active-graph-missing':
    case 'layout-active-graph-outside-layout':
    case 'graph-edge-missing-card':
    case 'graph-edge-card-outside-layout':
    case 'unresolved-default-layout':
    case 'duplicate-graph-edge':
    case 'unresolved-alias-target':
    case 'alias-self-reference':
    case 'alias-targets-alias':
    case 'alias-target-must-own-content':
    case 'space-card-reference-cycle': {
      const error = exactRecord(value, ['kind', 'ref', 'message'], 'Space reference error');
      return {
        kind,
        ref: requiredString(error['ref'], 'Space reference'),
        message: requiredString(error['message'], 'Space reference message'),
      };
    }
    default:
      throw new Error('Space intake error has an unknown kind');
  }
};

const decodeSpaceCardLocation = (record: Record<string, unknown>) => ({
  spaceId: requiredUuid(record['spaceId'], 'Space Card Space id'),
  cardId: requiredUuid(record['cardId'], 'Space Card id'),
  targetSpaceId: requiredUuid(record['targetSpaceId'], 'Space Card target Space id'),
});

const decodeAggregateError = (value: unknown): SpaceAggregateError => {
  const kind = discriminant(value, 'aggregate refusal');
  switch (kind) {
    case 'invalid-space-snapshot': {
      const error = exactRecord(
        value,
        ['kind', 'snapshotIndex', 'errors'],
        'invalid Space snapshot refusal',
      );
      if (!Array.isArray(error['errors']) || error['errors'].length === 0) {
        throw new Error('Space intake errors must be a non-empty array');
      }
      return {
        kind,
        snapshotIndex: requiredIndex(error['snapshotIndex'], 'snapshot index'),
        errors: error['errors'].map(decodeSpaceError),
      };
    }
    case 'duplicate-space-id': {
      const error = exactRecord(
        value,
        ['kind', 'spaceId', 'snapshotIndexes'],
        'duplicate Space refusal',
      );
      if (!Array.isArray(error['snapshotIndexes'])) {
        throw new Error('snapshot indexes must be an array');
      }
      return {
        kind,
        spaceId: requiredUuid(error['spaceId'], 'duplicate Space id'),
        snapshotIndexes: error['snapshotIndexes'].map((index) =>
          requiredIndex(index, 'snapshot index'),
        ),
      };
    }
    case 'duplicate-card-id': {
      const error = exactRecord(value, ['kind', 'cardId', 'spaceIds'], 'duplicate Card refusal');
      if (!Array.isArray(error['spaceIds'])) throw new Error('Space ids must be an array');
      return {
        kind,
        cardId: requiredUuid(error['cardId'], 'duplicate Card id'),
        spaceIds: error['spaceIds'].map((id) => requiredUuid(id, 'duplicate Card Space id')),
      };
    }
    case 'meta-space-missing': {
      const error = exactRecord(value, ['kind', 'metaSpaceId'], 'missing Meta Space refusal');
      return { kind, metaSpaceId: requiredUuid(error['metaSpaceId'], 'Meta Space id') };
    }
    case 'space-card-target-missing':
    case 'space-card-reference-cycle': {
      const error = exactRecord(
        value,
        ['kind', 'spaceId', 'cardId', 'targetSpaceId'],
        'Space Card refusal',
      );
      return { kind, ...decodeSpaceCardLocation(error) };
    }
    case 'ordinary-space-unreferenced': {
      const error = exactRecord(value, ['kind', 'spaceId'], 'unreferenced Space refusal');
      return { kind, spaceId: requiredUuid(error['spaceId'], 'unreferenced Space id') };
    }
    case 'space-card-layout-missing': {
      const error = exactRecord(
        value,
        ['kind', 'spaceId', 'cardId', 'targetSpaceId', 'layoutId'],
        'Space Card Layout refusal',
      );
      return {
        kind,
        ...decodeSpaceCardLocation(error),
        layoutId: requiredUuid(error['layoutId'], 'Space Card Layout id'),
      };
    }
    case 'space-card-graph-missing': {
      const error = exactRecord(
        value,
        ['kind', 'spaceId', 'cardId', 'targetSpaceId', 'graphId'],
        'Space Card Graph refusal',
      );
      return {
        kind,
        ...decodeSpaceCardLocation(error),
        graphId: requiredUuid(error['graphId'], 'Space Card Graph id'),
      };
    }
    case 'space-card-graph-outside-layout': {
      const error = exactRecord(
        value,
        ['kind', 'spaceId', 'cardId', 'targetSpaceId', 'layoutId', 'graphId'],
        'Space Card Graph membership refusal',
      );
      return {
        kind,
        ...decodeSpaceCardLocation(error),
        layoutId: requiredUuid(error['layoutId'], 'Space Card Layout id'),
        graphId: requiredUuid(error['graphId'], 'Space Card Graph id'),
      };
    }
    default:
      throw new Error('aggregate refusal has an unknown kind');
  }
};

export const decodeCommitRefusal = (value: unknown): AggregateRefused => {
  const record = exactRecord(value, ['errors'], 'commit refusal');
  if (!Array.isArray(record['errors']) || record['errors'].length === 0) {
    throw new Error('aggregate refusal errors must be a non-empty array');
  }
  return { kind: 'aggregate-refused', errors: record['errors'].map(decodeAggregateError) };
};

export const decodeSpaceSummaries = (value: unknown): readonly SpaceSummary[] => {
  if (!Array.isArray(value)) throw new Error('space summaries must be an array');
  return value.map((summary) => {
    const record = exactRecord(summary, ['id', 'title'], 'space summary');
    if (typeof record['title'] !== 'string' || record['title'].length === 0) {
      throw new Error('space summary title must be non-empty');
    }
    return { id: requiredUuid(record['id'], 'space summary id'), title: record['title'] };
  });
};

export const decodeCommittedRevision = (value: unknown): bigint => {
  const record = exactRecord(value, ['revision'], 'commit response');
  return decodeRevision(record['revision'], 'revision');
};
