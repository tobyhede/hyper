/*
 * One independent client for `contention.ts`: its own process, its own
 * database runtime and connection pool, its own in-process
 * `createSpaceHttpApp`, committing to one Space in a closed loop.
 *
 * Its arguments are a `WorkerOrder` (`contention-protocol.ts`). It loads its
 * Space, makes a warm-up commit, prints `ready`, waits for a `go` line on
 * stdin, commits for `durationMs`, then prints one line per commit and a
 * `done` line, and exits.
 *
 * - `fast` moves one Resource per commit, a Map-internal Edit the fast path
 *   takes.
 * - `aggregate` alternately adds a Resource and removes it again, a
 *   membership change the complete-aggregate path takes, so the Space's size
 *   stays level for the whole run.
 */
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { createSpaceHttpApp } from '@project/http';
import { decodeCommitResponse, encodeCommitRequest } from '@project/persistence';
import {
  commitLine,
  doneLine,
  parseOrderArguments,
  type CommitRecord,
} from './contention-protocol';
import { applyEdit } from './scenarios';
import {
  postgresTarget,
  requiredDatabaseUrl,
  sqliteFileTarget,
  type StatementSink,
} from './targets';

const order = parseOrderArguments(process.argv.slice(2));

const sink: StatementSink = [];
const target =
  order.sqlitePath === undefined
    ? postgresTarget(requiredDatabaseUrl(), sink)
    : sqliteFileTarget(order.sqlitePath, sink);
const app = createSpaceHttpApp(target.repository, { logError: () => undefined });
const spaceId = uuidSchema.parse(order.spaceId);

const loaded = await target.repository.loadSpace(spaceId);
if (loaded === undefined) throw new Error(`Space ${spaceId} is not stored`);
let snapshot: SpaceSnapshot = loaded.snapshot;
let revision = loaded.revision;
const base = snapshot;
let step = 0;

const nextSnapshot = (): SpaceSnapshot => {
  step += 1;
  if (order.role === 'fast') return applyEdit(snapshot, 'move', step);
  return step % 2 === 1 ? applyEdit(base, 'add-resource', 0) : base;
};

const commit = async (): Promise<CommitRecord> => {
  const next = nextSnapshot();
  const body = JSON.stringify(
    encodeCommitRequest({
      changes: [{ kind: 'update', spaceId, snapshot: next, expectedRevision: revision }],
    }),
  );
  sink.length = 0;
  const started = performance.now();
  const response = await app.request('/api/spaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const text = await response.text();
  const ms = performance.now() - started;
  if (response.status === 200) {
    const parsed: unknown = JSON.parse(text);
    const committed = decodeCommitResponse(parsed).revisions[0]?.revision;
    if (committed === undefined) throw new Error('A committed response named no revision');
    snapshot = next;
    revision = committed;
  } else {
    // Keep going from what is stored, so one refusal does not stop the loop.
    const reloaded = await target.repository.loadSpace(spaceId);
    if (reloaded === undefined) throw new Error(`Space ${spaceId} disappeared`);
    snapshot = reloaded.snapshot;
    revision = reloaded.revision;
    step -= 1;
  }
  const lockMs = (mode: 'shared' | 'exclusive') =>
    sink.filter((s) => s.lock === mode).reduce((sum, s) => sum + s.ms, 0);
  return {
    status: response.status,
    ms,
    sharedLockMs: lockMs('shared'),
    exclusiveLockMs: lockMs('exclusive'),
    aggregatePath: sink.some(
      (s) => s.lock === 'exclusive' || (s.table === 'repository_state' && s.verb === 'update'),
    ),
  };
};

// One discarded commit, so no measured commit pays first-statement preparation;
// an aggregate client's warm-up is its first add, answered by its first remove.
await commit();
if (order.role === 'aggregate') await commit();

process.stdout.write('ready\n');
const lines = createInterface({ input: process.stdin });
await new Promise<void>((resolve) => {
  lines.on('line', (line) => {
    if (line.trim() === 'go') resolve();
  });
});
lines.close();

const commits: CommitRecord[] = [];
const started = performance.now();
while (performance.now() - started < order.durationMs) commits.push(await commit());
const elapsedMs = performance.now() - started;
// Leave an aggregate client's Space as it found it.
if (order.role === 'aggregate' && step % 2 === 1) await commit();
await target.close();

process.stdout.write(`${[...commits.map(commitLine), doneLine(elapsedMs)].join('\n')}\n`);
