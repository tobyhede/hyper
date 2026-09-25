/*
 * Persistence cost harness for small Edits (ticket 17,
 * `.scratch/code-quality/issues/17-measure-persistence-work-for-small-edits.md`).
 *
 * A diagnostic, never a gate: nothing here asserts a threshold, and no job in
 * `ci.yml` runs it. `.github/workflows/persistence-cost.yml` runs it against
 * CI's PostgreSQL for the numbers, and reports without judging them. It drives
 * the real `createSpaceHttpApp` commit route in process, over the real
 * `SqlSpaceRepository` on PostgreSQL and on a migrated temporary SQLite file,
 * and over `MemorySpaceRepository`, and reports per commit:
 *
 * - request and response bytes, against `MAX_COMMIT_BODY_BYTES`;
 * - SQL statements the runtime executed, by verb and table (the first table the
 *   statement names, so the one-statement `include` read of a Space and its
 *   Resources is listed under `resources`), the rows they
 *   answered and the bytes of the parameters they carried (a middleware on the
 *   `@prisma-next` runtime; the driver's own BEGIN/COMMIT are not plans and are
 *   not counted);
 * - which commit path ran (`fast` or `aggregate`, read off the statements);
 * - the time the aggregate-lock statements took, which on PostgreSQL includes
 *   any wait for the lock;
 * - complete Space snapshot parses (`spaceSnapshotSchema.safeParse` calls) and
 *   the Resource documents those parses covered;
 * - wall-clock latency, which is only as good as the machine is quiet.
 *
 * Run from the repository root:
 *
 *   pnpm exec tsx scripts/persistence-cost/measure.ts
 *
 * `PERSISTENCE_COST_TARGETS` (default `sqlite,memory`) chooses the
 * repositories, from `postgres`, `sqlite` and `memory`; `postgres` needs
 * `DATABASE_URL` naming a migrated database, whose content every scenario
 * deletes. `PERSISTENCE_COST_SAMPLES` (default 5) sets samples per Edit kind,
 * and `PERSISTENCE_COST_QUICK=1` runs only the smallest scenarios.
 * `PERSISTENCE_COST_TRACE=1` writes every commit's SQL to stderr.
 *
 * Contention between independent clients is `contention.ts`.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { cpus, loadavg, platform, release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spaceSnapshotSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { createSpaceHttpApp, MAX_COMMIT_BODY_BYTES } from '@project/http';
import { decodeCommitResponse, encodeCommitRequest, type SpaceCommit } from '@project/persistence';
import {
  applyEdit,
  EDIT_KINDS,
  scenario,
  type EditKind,
  type Scenario,
  type Workload,
} from './scenarios';
import {
  memoryTarget,
  postgresTarget,
  requiredDatabaseUrl,
  sqliteTarget,
  type StatementSink,
  type Target,
  type TargetName,
} from './targets';
import { spread } from './statistics';

const SAMPLES = Number(process.env['PERSISTENCE_COST_SAMPLES'] ?? '5');
const QUICK = process.env['PERSISTENCE_COST_QUICK'] === '1';
const TRACE = process.env['PERSISTENCE_COST_TRACE'] === '1';
const TARGETS = (process.env['PERSISTENCE_COST_TARGETS'] ?? 'sqlite,memory')
  .split(',')
  .map((name) => name.trim())
  .filter((name): name is TargetName => {
    if (name === 'postgres' || name === 'sqlite' || name === 'memory') return true;
    throw new Error(`Unknown PERSISTENCE_COST_TARGETS entry "${name}"`);
  });
const BODY_LENGTH = 600;

// ---------------------------------------------------------------- counters

const statements: StatementSink = [];
let snapshotParses = 0;
let resourcesParsed = 0;

/*
 * Every complete snapshot intake — `loadSpaceSnapshot`, and through it
 * `loadSpaceAggregate`, plus the HTTP decoder — calls this one schema's
 * `safeParse`. Wrapping it on the shared schema instance counts them without
 * replacing what it answers.
 */
const originalSafeParse = spaceSnapshotSchema.safeParse.bind(spaceSnapshotSchema);
spaceSnapshotSchema.safeParse = (data, params) => {
  const result = originalSafeParse(data, params);
  snapshotParses += 1;
  if (result.success) resourcesParsed += result.data.resources.length;
  return result;
};

const resetCounters = (): void => {
  statements.length = 0;
  snapshotParses = 0;
  resourcesParsed = 0;
};

// ---------------------------------------------------------------- one commit

type Outcome = 'committed' | 'conflict' | 'refused' | 'too-large' | 'other';

interface Sample {
  readonly target: string;
  readonly scenario: string;
  readonly edit: string;
  readonly outcome: Outcome;
  readonly status: number;
  readonly requestBytes: number;
  readonly responseBytes: number;
  readonly statements: number;
  readonly byVerb: string;
  readonly rowsRead: number;
  readonly rowsWritten: number;
  readonly paramBytesWritten: number;
  readonly path: string;
  readonly snapshotParses: number;
  readonly resourcesParsed: number;
  /** Time spent in aggregate-lock statements, including any wait for the lock. */
  readonly lockMs: number;
  readonly ms: number;
}

const outcomeOf = (status: number): Outcome => {
  if (status === 200) return 'committed';
  if (status === 409) return 'conflict';
  if (status === 422) return 'refused';
  if (status === 413) return 'too-large';
  return 'other';
};

const commitPath = (target: Target): string => {
  if (target.name === 'memory') return 'decideCommit';
  if (statements.length === 0) return 'none';
  if (
    statements.some(
      (s) => s.lock === 'exclusive' || (s.table === 'repository_state' && s.verb === 'update'),
    )
  ) {
    return 'aggregate';
  }
  return statements.some((s) => s.verb === 'update' || s.verb === 'insert')
    ? 'fast'
    : 'fast (answer)';
};

const post = async (
  target: Target,
  app: ReturnType<typeof createSpaceHttpApp>,
  request: SpaceCommit,
  labels: { readonly scenario: string; readonly edit: string },
): Promise<{ readonly sample: Sample; readonly revision: bigint | undefined }> => {
  const body = JSON.stringify(encodeCommitRequest(request));
  resetCounters();
  const started = performance.now();
  const response = await app.request('/api/spaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const text = await response.text();
  const ms = performance.now() - started;
  if (TRACE) {
    console.error(`-- ${target.name} ${labels.scenario} ${labels.edit} -> ${response.status}`);
    for (const statement of statements) console.error(`   ${statement.sql.slice(0, 160)}`);
  }
  const verbs = new Map<string, number>();
  for (const statement of statements) {
    const key = `${statement.verb} ${statement.table}`;
    verbs.set(key, (verbs.get(key) ?? 0) + 1);
  }
  const writes = statements.filter((s) => s.verb !== 'select');
  let revision: bigint | undefined;
  if (response.status === 200) {
    const parsed: unknown = JSON.parse(text);
    revision = decodeCommitResponse(parsed).revisions[0]?.revision;
  }
  return {
    revision,
    sample: {
      target: target.name,
      scenario: labels.scenario,
      edit: labels.edit,
      outcome: outcomeOf(response.status),
      status: response.status,
      requestBytes: Buffer.byteLength(body),
      responseBytes: Buffer.byteLength(text),
      statements: statements.length,
      byVerb: [...verbs.entries()].map(([key, count]) => `${count}× ${key}`).join(', '),
      rowsRead: statements.filter((s) => s.verb === 'select').reduce((sum, s) => sum + s.rows, 0),
      rowsWritten: writes.reduce((sum, s) => sum + s.rows, 0),
      paramBytesWritten: writes.reduce((sum, s) => sum + s.paramBytes, 0),
      path: commitPath(target),
      snapshotParses,
      resourcesParsed,
      lockMs: statements.filter((s) => s.lock !== undefined).reduce((sum, s) => sum + s.ms, 0),
      ms,
    },
  };
};

// ---------------------------------------------------------------- one scenario

interface Held {
  snapshot: SpaceSnapshot;
  revision: bigint;
}

const update = (spaceId: UUID, snapshot: SpaceSnapshot, revision: bigint): SpaceCommit => ({
  changes: [{ kind: 'update', spaceId, snapshot, expectedRevision: revision }],
});

const runScenario = async (target: Target, subject: Scenario): Promise<readonly Sample[]> => {
  const seeded = await target.repository.initializeAggregate({
    metaSpaceId: subject.metaSpaceId,
    spaces: subject.spaces,
  });
  if (seeded.kind !== 'initialized')
    throw new Error(`Seeding ${subject.name} answered ${seeded.kind}`);
  const app = createSpaceHttpApp(target.repository, { logError: () => undefined });
  const held = new Map<UUID, Held>(
    subject.spaces.map((snapshot) => [snapshot.id, { snapshot, revision: 0n }]),
  );
  const samples: Sample[] = [];

  const edit = async (
    spaceId: UUID,
    kind: EditKind,
    sample: number,
    label: string,
  ): Promise<void> => {
    const current = held.get(spaceId);
    if (current === undefined) throw new Error(`Space ${spaceId} is not held`);
    const next = applyEdit(current.snapshot, kind, sample);
    const result = await post(target, app, update(spaceId, next, current.revision), {
      scenario: subject.name,
      edit: label,
    });
    if (result.sample.outcome !== 'committed' || result.revision === undefined) {
      throw new Error(`${subject.name} ${label} answered HTTP ${result.sample.status}`);
    }
    held.set(spaceId, { snapshot: next, revision: result.revision });
    samples.push(result.sample);
  };

  // One discarded commit, so a sample never pays first-statement preparation.
  await edit(subject.editedSpaceId, 'rename', SAMPLES + 7, 'warm-up');
  samples.pop();

  for (const kind of EDIT_KINDS) {
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      await edit(subject.editedSpaceId, kind, sample, kind);
    }
  }

  // A stale revision, for an Edit the fast path would take and one it would not.
  for (const kind of ['rename', 'move'] as const) {
    const current = held.get(subject.editedSpaceId);
    if (current === undefined) throw new Error('edited Space is not held');
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const next = applyEdit(current.snapshot, kind, sample);
      const result = await post(
        target,
        app,
        update(subject.editedSpaceId, next, current.revision - 1n),
        { scenario: subject.name, edit: `stale ${kind}` },
      );
      if (result.sample.outcome !== 'conflict') {
        throw new Error(`${subject.name} stale ${kind} answered HTTP ${result.sample.status}`);
      }
      samples.push(result.sample);
    }
  }

  // An Edit to a different Space than the large one.
  const [unrelated] = subject.unrelatedSpaceIds;
  if (unrelated !== undefined) {
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      await edit(unrelated, 'move', sample, 'move (unrelated Space)');
    }
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      await edit(unrelated, 'rename', sample, 'rename (unrelated Space)');
    }
  }
  return samples;
};

// ---------------------------------------------------------------- 1 MiB range

const requestBytesFor = (workload: Workload, kind: EditKind): number => {
  const subject = scenario(workload);
  const edited = subject.spaces.find((snapshot) => snapshot.id === subject.editedSpaceId);
  if (edited === undefined) throw new Error('edited Space missing');
  const next = applyEdit(edited, kind, 0);
  return Buffer.byteLength(
    JSON.stringify(
      encodeCommitRequest({
        changes: [{ kind: 'update', spaceId: edited.id, snapshot: next, expectedRevision: 0n }],
      }),
    ),
  );
};

/** The most Resources one Space can hold before an Open commit exceeds the limit. */
const largestAccepted = (bodyLength: number): number => {
  let low = 3;
  let high = 20_000;
  const workload = (editedResources: number): Workload => ({
    editedResources,
    unrelatedSpaces: 0,
    unrelatedResources: 0,
    bodyLength,
  });
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (requestBytesFor(workload(middle), 'open') <= MAX_COMMIT_BODY_BYTES) low = middle;
    else high = middle - 1;
  }
  return low;
};

// ---------------------------------------------------------------- report

const deterministic = (sample: Sample): string =>
  [
    sample.outcome,
    sample.path,
    sample.statements,
    sample.rowsRead,
    sample.rowsWritten,
    sample.snapshotParses,
    sample.resourcesParsed,
  ].join('|');

const report = (samples: readonly Sample[]): void => {
  const groups = new Map<string, Sample[]>();
  for (const sample of samples) {
    const key = `${sample.target}\u0000${sample.scenario}\u0000${sample.edit}`;
    const group = groups.get(key) ?? [];
    group.push(sample);
    groups.set(key, group);
  }
  console.log(
    '| repo | scenario | edit | outcome | path | req bytes | resp bytes | stmts | rows read | rows written | param bytes written | snapshot parses | resource docs parsed | n | ms median / p90 (min–max) | lock stmt ms median / p90 (min–max) | statements |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const group of groups.values()) {
    const [first] = group;
    if (first === undefined) continue;
    const stable = group.every((sample) => deterministic(sample) === deterministic(first));
    const locked = group.some((sample) => sample.lockMs > 0);
    const range = (values: readonly number[]) => `${Math.min(...values)}–${Math.max(...values)}`;
    console.log(
      `| ${first.target} | ${first.scenario} | ${first.edit} | ${first.outcome} | ${first.path}${stable ? '' : ' (varies)'} | ${range(group.map((s) => s.requestBytes))} | ${range(group.map((s) => s.responseBytes))} | ${range(group.map((s) => s.statements))} | ${range(group.map((s) => s.rowsRead))} | ${range(group.map((s) => s.rowsWritten))} | ${range(group.map((s) => s.paramBytesWritten))} | ${range(group.map((s) => s.snapshotParses))} | ${range(group.map((s) => s.resourcesParsed))} | ${group.length} | ${spread(group.map((s) => s.ms))} | ${locked ? spread(group.map((s) => s.lockMs)) : '—'} | ${first.byVerb} |`,
    );
  }
};

const WORKLOADS: readonly Workload[] = (
  QUICK
    ? [
        [10, 0, 0],
        [10, 2, 10],
      ]
    : [
        [10, 0, 0],
        [100, 0, 0],
        [1000, 0, 0],
        [10, 10, 100],
        [100, 10, 100],
        [1000, 10, 100],
        [10, 40, 100],
        [100, 40, 100],
        [10, 10, 10],
        [10, 4, 1000],
      ]
).map(([editedResources = 0, unrelatedSpaces = 0, unrelatedResources = 0]) => ({
  editedResources,
  unrelatedSpaces,
  unrelatedResources,
  bodyLength: BODY_LENGTH,
}));

const runner = process.env['RUNNER_NAME'];

const main = async (): Promise<void> => {
  const [cpu] = cpus();
  console.log('## Environment\n');
  console.log(`- targets: ${TARGETS.join(', ')}`);
  console.log(`- node ${process.version}, ${platform()} ${release()}`);
  console.log(`- ${cpus().length} logical CPUs, ${cpu?.model ?? 'unknown model'}`);
  if (runner !== undefined) console.log(`- GitHub Actions runner: ${runner}`);
  console.log(
    `- load average at start: ${loadavg()
      .map((value) => value.toFixed(1))
      .join(' ')}`,
  );
  console.log(
    `- samples per Edit kind: ${SAMPLES}; Markdown body length: ${BODY_LENGTH} characters`,
  );
  console.log(`- MAX_COMMIT_BODY_BYTES: ${MAX_COMMIT_BODY_BYTES}\n`);

  const directory = await mkdtemp(join(tmpdir(), 'hyper-persistence-cost-'));
  const postgres = TARGETS.includes('postgres')
    ? postgresTarget(requiredDatabaseUrl(), statements)
    : undefined;
  const open = async (name: TargetName, label: string): Promise<Target> => {
    if (name === 'sqlite') return sqliteTarget(directory, label, statements);
    if (name === 'memory') return memoryTarget();
    if (postgres === undefined) throw new Error('postgres was not opened');
    await postgres.clear();
    // The one runtime serves every scenario, so closing it waits for the end.
    return { ...postgres, close: () => Promise.resolve() };
  };
  const samples: Sample[] = [];
  try {
    for (const [index, workload] of WORKLOADS.entries()) {
      const subject = scenario(workload);
      for (const name of TARGETS) {
        const target = await open(name, `scenario-${index}`);
        try {
          samples.push(...(await runScenario(target, subject)));
        } finally {
          await target.close();
        }
      }
      console.error(`measured ${subject.name}`);
    }

    // A request past the limit, answered before any repository work.
    const oversized = scenario({
      editedResources: 1500,
      unrelatedSpaces: 0,
      unrelatedResources: 0,
      bodyLength: BODY_LENGTH,
    });
    const [first = 'memory'] = TARGETS;
    const target = await open(first, 'oversized');
    try {
      await target.repository.initializeAggregate({
        metaSpaceId: oversized.metaSpaceId,
        spaces: oversized.spaces,
      });
      const edited = oversized.spaces.find((snapshot) => snapshot.id === oversized.editedSpaceId);
      if (edited === undefined) throw new Error('edited Space missing');
      const app = createSpaceHttpApp(target.repository, { logError: () => undefined });
      const result = await post(
        target,
        app,
        {
          changes: [
            {
              kind: 'update',
              spaceId: edited.id,
              snapshot: applyEdit(edited, 'move', 0),
              expectedRevision: 0n,
            },
          ],
        },
        { scenario: oversized.name, edit: 'move (oversized)' },
      );
      samples.push(result.sample);
    } finally {
      await target.close();
    }
  } finally {
    if (postgres !== undefined) {
      await postgres.clear();
      await postgres.close();
    }
    await rm(directory, { recursive: true, force: true });
  }

  console.log('## Samples\n');
  report(samples);

  console.log('\n## Request size against the 1 MiB limit\n');
  console.log('| body chars | N=10 | N=100 | N=1000 | largest N accepted (Open) |');
  console.log('|---|---|---|---|---|');
  for (const bodyLength of [0, 600, 4000]) {
    const bytes = [10, 100, 1000].map((editedResources) =>
      requestBytesFor(
        { editedResources, unrelatedSpaces: 0, unrelatedResources: 0, bodyLength },
        'open',
      ),
    );
    console.log(`| ${bodyLength} | ${bytes.join(' | ')} | ${largestAccepted(bodyLength)} |`);
  }
  console.log(
    `\n- load average at end: ${loadavg()
      .map((value) => value.toFixed(1))
      .join(' ')}`,
  );
};

await main();
