/*
 * Aggregate-lock contention between independent clients (ticket 17,
 * `.scratch/code-quality/issues/17-measure-persistence-work-for-small-edits.md`).
 *
 * A diagnostic, never a gate. Every client is a separate `contention-worker.ts`
 * process with its own runtime, connection pool and in-process HTTP app, so
 * clients meet only in the database, as separate hosts would. Each commits to
 * its own Space in a closed loop, so no two clients ever conflict on a
 * revision: whatever one client's latency gains from another is the aggregate
 * lock, the database and the shared machine.
 *
 * Fast-path commits take the aggregate lock shared; complete-aggregate commits
 * take it shared for their fast attempt and then exclusive
 * (`src/persistence/sql-space-repository.ts`). The phases below put fast
 * clients beside each other and beside aggregate clients.
 *
 * Run from the repository root, against a migrated PostgreSQL whose content it
 * deletes:
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/persistence-cost/contention.ts
 *
 * `PERSISTENCE_COST_DURATION_MS` (default 10000) is each phase's length and
 * `PERSISTENCE_COST_ROUNDS` (default 3) how many times the phase list runs,
 * interleaved so that drift in the machine spreads across every phase.
 * `PERSISTENCE_COST_CONTENTION_TARGET=sqlite` runs the same phases over one
 * migrated temporary SQLite file instead, whose writers serialise on the file.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { cpus, loadavg, platform, release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  orderArguments,
  reportReader,
  type CommitRecord,
  type Role,
  type WorkerOrder,
  type WorkerReport,
} from './contention-protocol';
import { scenario } from './scenarios';
import { percentile } from './statistics';
import { postgresTarget, requiredDatabaseUrl, sqliteTarget, type Target } from './targets';

const DURATION_MS = Number(process.env['PERSISTENCE_COST_DURATION_MS'] ?? '10000');
const ROUNDS = Number(process.env['PERSISTENCE_COST_ROUNDS'] ?? '3');
const ON_SQLITE = process.env['PERSISTENCE_COST_CONTENTION_TARGET'] === 'sqlite';
const WORKER = fileURLToPath(new URL('./contention-worker.ts', import.meta.url));

const WORKLOAD = {
  editedResources: 100,
  unrelatedSpaces: 10,
  unrelatedResources: 100,
  bodyLength: 600,
} as const;

interface Phase {
  readonly name: string;
  readonly fast: number;
  readonly aggregate: number;
}

const PHASES: readonly Phase[] = [
  { name: 'fast ×1', fast: 1, aggregate: 0 },
  { name: 'fast ×4', fast: 4, aggregate: 0 },
  { name: 'aggregate ×1', fast: 0, aggregate: 1 },
  { name: 'aggregate ×2', fast: 0, aggregate: 2 },
  { name: 'fast ×1 + aggregate ×1', fast: 1, aggregate: 1 },
  { name: 'fast ×4 + aggregate ×1', fast: 4, aggregate: 1 },
];

interface Client {
  readonly order: WorkerOrder;
  readonly ready: Promise<void>;
  readonly report: Promise<WorkerReport>;
  readonly go: () => void;
}

const startClient = (order: WorkerOrder): Client => {
  const child = spawn(
    process.execPath,
    ['--disable-warning=DEP0205', '--import', 'tsx', WORKER, ...orderArguments(order)],
    { stdio: ['pipe', 'pipe', 'inherit'] },
  );
  const lines = createInterface({ input: child.stdout });
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const reader = reportReader(order);
  const report = new Promise<WorkerReport>((resolve, reject) => {
    lines.on('line', (line) => {
      if (line === 'ready') {
        markReady();
        return;
      }
      try {
        const finished = reader.read(line);
        if (finished !== undefined) resolve(finished);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`contention worker exited ${String(code)}`));
    });
  });
  return {
    order,
    ready: Promise.race([ready, report.then(() => undefined)]),
    report,
    go: () => child.stdin.end('go\n'),
  };
};

interface PhaseRun {
  readonly phase: Phase;
  readonly round: number;
  readonly reports: readonly WorkerReport[];
}

const runPhase = async (
  phase: Phase,
  round: number,
  spaces: readonly string[],
  sqlitePath: string | undefined,
): Promise<PhaseRun> => {
  const roles: Role[] = [
    ...Array.from({ length: phase.fast }, (): Role => 'fast'),
    ...Array.from({ length: phase.aggregate }, (): Role => 'aggregate'),
  ];
  const clients = roles.map((role, index) => {
    const spaceId = spaces[index];
    if (spaceId === undefined) throw new Error(`No Space for client ${index}`);
    return startClient(
      sqlitePath === undefined
        ? { role, spaceId, durationMs: DURATION_MS }
        : { role, spaceId, durationMs: DURATION_MS, sqlitePath },
    );
  });
  await Promise.all(clients.map((client) => client.ready));
  for (const client of clients) client.go();
  const reports = await Promise.all(clients.map((client) => client.report));
  console.error(
    `round ${round + 1} ${phase.name}: ${reports.map((r) => r.commits.length).join(', ')} commits`,
  );
  return { phase, round, reports };
};

// ---------------------------------------------------------------- report

const ms = (value: number): string => value.toFixed(1);

/** `median / p90 / p99 / max` of `values`, in milliseconds. */
const distribution = (values: readonly number[]): string =>
  values.length === 0
    ? '—'
    : [50, 90, 99].map((p) => ms(percentile(values, p))).join(' / ') +
      ` / ${ms(Math.max(...values))}`;

const committedIn = (report: WorkerReport): readonly CommitRecord[] =>
  report.commits.filter((c) => c.status === 200);

const report = (runs: readonly PhaseRun[]): void => {
  console.log(
    '| phase | client role | clients | committed / attempted | committed/s per client, median (min–max over clients × rounds) | total committed/s per round (min–max) | committed latency ms median / p90 / p99 / max | shared-lock ms median / p90 / p99 / max | exclusive-lock ms median / p90 / p99 / max | on aggregate path | refused (status × count) |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const phase of PHASES) {
    const mine = runs.filter((run) => run.phase === phase);
    const totals = mine.map(
      (run) =>
        run.reports.reduce((sum, r) => sum + committedIn(r).length, 0) /
        (Math.max(...run.reports.map((r) => r.elapsedMs)) / 1000),
    );
    for (const role of ['fast', 'aggregate'] as const) {
      const reports = mine.flatMap((run) => run.reports.filter((r) => r.role === role));
      if (reports.length === 0) continue;
      const attempted = reports.flatMap((r) => r.commits);
      const committed = reports.flatMap(committedIn);
      const rates = reports.map((r) => committedIn(r).length / (r.elapsedMs / 1000));
      const lockOf = (key: 'sharedLockMs' | 'exclusiveLockMs') =>
        committed.filter((c) => c[key] > 0).map((c) => c[key]);
      const refused = new Map<number, number>();
      for (const c of attempted) {
        if (c.status !== 200) refused.set(c.status, (refused.get(c.status) ?? 0) + 1);
      }
      const refusedText =
        refused.size === 0
          ? '0'
          : [...refused.entries()].map(([status, count]) => `${status} × ${count}`).join(', ');
      console.log(
        `| ${phase.name} | ${role} | ${role === 'fast' ? phase.fast : phase.aggregate} | ${committed.length} / ${attempted.length} | ${percentile(rates, 50).toFixed(1)} (${Math.min(...rates).toFixed(1)}–${Math.max(...rates).toFixed(1)}) | ${Math.min(...totals).toFixed(1)}–${Math.max(...totals).toFixed(1)} | ${distribution(committed.map((c) => c.ms))} | ${distribution(lockOf('sharedLockMs'))} | ${distribution(lockOf('exclusiveLockMs'))} | ${committed.filter((c) => c.aggregatePath).length} | ${refusedText} |`,
      );
    }
  }
};

// ---------------------------------------------------------------- main

const main = async (): Promise<void> => {
  const [cpu] = cpus();
  const runner = process.env['RUNNER_NAME'];
  console.log('## Contention environment\n');
  console.log(`- database: ${ON_SQLITE ? 'sqlite (one temporary file)' : 'postgres'}`);
  console.log(`- node ${process.version}, ${platform()} ${release()}`);
  console.log(`- ${cpus().length} logical CPUs, ${cpu?.model ?? 'unknown model'}`);
  if (runner !== undefined) console.log(`- GitHub Actions runner: ${runner}`);
  console.log(
    `- load average at start: ${loadavg()
      .map((value) => value.toFixed(1))
      .join(' ')}`,
  );
  console.log(
    `- workload: ${WORKLOAD.unrelatedSpaces + 1} ordinary Spaces of ${WORKLOAD.editedResources} Markdown Resources (${WORKLOAD.bodyLength}-character bodies) under Meta; each client owns one Space`,
  );
  console.log(
    `- ${ROUNDS} rounds of ${PHASES.length} phases, ${DURATION_MS} ms each, closed loop (each client commits again as soon as it is answered)\n`,
  );

  const subject = scenario(WORKLOAD);
  const directory = await mkdtemp(join(tmpdir(), 'hyper-persistence-contention-'));
  let seeder: Target;
  if (ON_SQLITE) {
    seeder = await sqliteTarget(directory, 'contention', []);
  } else {
    const postgres = postgresTarget(requiredDatabaseUrl(), []);
    await postgres.clear();
    seeder = postgres;
  }
  const sqlitePath = ON_SQLITE ? join(directory, 'contention.db') : undefined;
  const runs: PhaseRun[] = [];
  try {
    const seeded = await seeder.repository.initializeAggregate({
      metaSpaceId: subject.metaSpaceId,
      spaces: subject.spaces,
    });
    if (seeded.kind !== 'initialized') throw new Error(`Seeding answered ${seeded.kind}`);
    for (let round = 0; round < ROUNDS; round += 1) {
      for (const phase of PHASES) {
        runs.push(await runPhase(phase, round, subject.unrelatedSpaceIds, sqlitePath));
      }
    }
  } finally {
    await seeder.close();
    await rm(directory, { recursive: true, force: true });
  }

  console.log('## Contention\n');
  report(runs);
  console.log(
    `\n- load average at end: ${loadavg()
      .map((value) => value.toFixed(1))
      .join(' ')}`,
  );
};

await main();
