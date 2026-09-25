/*
 * What `contention.ts` and each `contention-worker.ts` process say to each
 * other: a worker's order as its command-line arguments, and its report as
 * plain text lines on stdout.
 *
 *   ready
 *   commit <status> <ms> <shared-lock ms> <exclusive-lock ms> <0|1 aggregate path>
 *   done <elapsed ms>
 */

export type Role = 'fast' | 'aggregate';

export interface WorkerOrder {
  readonly role: Role;
  readonly spaceId: string;
  readonly durationMs: number;
  /** A migrated SQLite file to contend on instead of `DATABASE_URL`'s PostgreSQL. */
  readonly sqlitePath?: string;
}

export interface CommitRecord {
  readonly status: number;
  readonly ms: number;
  /** Time in `pg_advisory_xact_lock_shared` statements, including any wait. */
  readonly sharedLockMs: number;
  /** Time in `pg_advisory_xact_lock` statements, including any wait. */
  readonly exclusiveLockMs: number;
  readonly aggregatePath: boolean;
}

export interface WorkerReport {
  readonly role: Role;
  readonly spaceId: string;
  readonly elapsedMs: number;
  readonly commits: readonly CommitRecord[];
}

const parseRole = (text: string | undefined): Role => {
  if (text === 'fast' || text === 'aggregate') return text;
  throw new Error(`Unknown contention role "${String(text)}"`);
};

const parseNumber = (text: string | undefined): number => {
  const value = Number(text);
  if (text === undefined || text === '' || !Number.isFinite(value)) {
    throw new Error(`"${String(text)}" is not a number`);
  }
  return value;
};

export const orderArguments = (order: WorkerOrder): readonly string[] => {
  const args = [order.role, order.spaceId, String(order.durationMs)];
  if (order.sqlitePath !== undefined) args.push(order.sqlitePath);
  return args;
};

export const parseOrderArguments = (args: readonly string[]): WorkerOrder => {
  const [role, spaceId, durationMs, sqlitePath] = args;
  if (spaceId === undefined) throw new Error('A contention worker needs a Space id');
  const order = { role: parseRole(role), spaceId, durationMs: parseNumber(durationMs) };
  return sqlitePath === undefined ? order : { ...order, sqlitePath };
};

export const commitLine = (record: CommitRecord): string =>
  `commit ${record.status} ${record.ms} ${record.sharedLockMs} ${record.exclusiveLockMs} ${record.aggregatePath ? 1 : 0}`;

export const doneLine = (elapsedMs: number): string => `done ${elapsedMs}`;

/** Collects one worker's report from its stdout lines. */
export const reportReader = (order: WorkerOrder) => {
  const commits: CommitRecord[] = [];
  return {
    /** Answers the finished report on the `done` line, and nothing before it. */
    read(line: string): WorkerReport | undefined {
      const [kind, ...fields] = line.trim().split(' ');
      if (kind === 'commit') {
        const [status, ms, shared, exclusive, aggregate] = fields;
        commits.push({
          status: parseNumber(status),
          ms: parseNumber(ms),
          sharedLockMs: parseNumber(shared),
          exclusiveLockMs: parseNumber(exclusive),
          aggregatePath: aggregate === '1',
        });
        return undefined;
      }
      if (kind === 'done') {
        return {
          role: order.role,
          spaceId: order.spaceId,
          elapsedMs: parseNumber(fields[0]),
          commits,
        };
      }
      throw new Error(`Unexpected contention worker line "${line}"`);
    },
  };
};
