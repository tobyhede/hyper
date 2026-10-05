import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newUuid, uuidSchema } from '@project/core';
import { HttpSpaceBackend } from '@project/http';
import { afterEach, describe, expect, it } from 'vitest';
import { AGGREGATE_FILE_NAME, readSingleSpace } from '../../src/aggregate-directory';
import {
  RUN_QUIET_MILLISECONDS,
  startRun,
  type Run,
  type RunEvent,
  type RunStart,
} from '../../src/run/run';
import { admitted, pngBytes } from '../support/stored-images';

const FIXTURE = fileURLToPath(new URL('../../packages/app/fixture', import.meta.url));
const META_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');

/**
 * A clock the test advances by hand: `startRun` takes its scheduler at
 * composition (ADR 0109), so the quiet period passes when the test says so.
 */
const manualClock = () => {
  let now = 0;
  let pending: { readonly at: number; readonly callback: () => void }[] = [];
  return {
    schedule: (callback: () => void, milliseconds: number) => {
      const entry = { at: now + milliseconds, callback };
      pending.push(entry);
      return () => {
        pending = pending.filter((candidate) => candidate !== entry);
      };
    },
    advance: (milliseconds: number) => {
      now += milliseconds;
      const due = pending.filter(({ at }) => at <= now);
      pending = pending.filter(({ at }) => at > now);
      for (const { callback } of due) callback();
    },
  };
};

const temporaryRoots: string[] = [];

const temporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'hyper-run-'));
  temporaryRoots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const fixtureCopy = async (): Promise<string> => {
  const directory = join(await temporaryRoot(), 'talk');
  await cp(FIXTURE, directory, { recursive: true });
  return directory;
};

/** Every file under `directory`, by relative path, with its bytes. */
const filesUnder = async (directory: string): Promise<Record<string, string>> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files: Record<string, string> = {};
  for (const entry of entries.filter((candidate) => candidate.isFile())) {
    const path = join(entry.parentPath, entry.name);
    files[relative(directory, path)] = await readFile(path, 'base64');
  }
  return files;
};

/** The Space's title as the ordinary Space directory reader reads it back. */
const spaceTitle = async (directory: string, spaceId: string): Promise<string> =>
  (await readSingleSpace(join(directory, spaceId))).document.title;

/** A started run, the clock driving it and every event it has reported. */
const started = async (directory: string) => {
  const clock = manualClock();
  const events: RunEvent[] = [];
  const waiting: (() => void)[] = [];
  const start = await startRun(directory, {
    newId: newUuid,
    schedule: clock.schedule,
    report: (event) => {
      events.push(event);
      waiting.splice(0).forEach((resolve) => resolve());
    },
  });
  const nextEvent = () => new Promise<void>((resolve) => waiting.push(resolve));
  return { clock, events, start, nextEvent };
};

const running = (start: RunStart): Run => {
  if (start.kind !== 'running') throw new Error(`Expected a run, got ${start.kind}`);
  return start.run;
};

const backendFor = (run: Run) =>
  new HttpSpaceBackend('http://hyper.test', {
    fetch: (input, init) => Promise.resolve(run.host.fetch(new Request(input, init))),
  });

/** Rename the Meta Space through the Fetch app, exactly as the browser commits. */
const renameMeta = async (run: Run, title: string): Promise<void> => {
  const backend = backendFor(run);
  const loaded = await backend.loadSpace(META_SPACE_ID);
  if (loaded === undefined) throw new Error('Expected the Meta Space');
  const result = await backend.commit({
    changes: [
      {
        kind: 'update',
        spaceId: META_SPACE_ID,
        snapshot: { ...loaded.snapshot, document: { ...loaded.snapshot.document, title } },
        expectedRevision: loaded.revision,
      },
    ],
  });
  expect(result.kind).toBe('committed');
};

const writes = (events: readonly RunEvent[]) => events.filter(({ kind }) => kind === 'written');

describe('Running an Aggregate directory', () => {
  it('serves the directory it was started on', async () => {
    const directory = await fixtureCopy();
    const { start } = await started(directory);
    const run = running(start);

    await expect(backendFor(run).loadSpace(META_SPACE_ID)).resolves.toMatchObject({
      snapshot: { document: { title: 'Map fixture' } },
    });
    await run.stop();
  });

  it('writes a committed edit to the directory once the quiet period passes', async () => {
    const directory = await fixtureCopy();
    const { clock, start, nextEvent } = await started(directory);
    const run = running(start);

    await renameMeta(run, 'Renamed during the run');
    clock.advance(RUN_QUIET_MILLISECONDS - 1);
    expect(await spaceTitle(directory, META_SPACE_ID)).toBe('Map fixture');

    const written = nextEvent();
    clock.advance(1);
    await written;
    expect(await spaceTitle(directory, META_SPACE_ID)).toBe('Renamed during the run');
    await run.stop();
  });

  /*
   * A shell, an editor or a file watcher inside the directory keeps working
   * across a write, because the write replaces files and never the directory
   * or a Space directory inside it.
   */
  it('writes into the directory it was started on, keeping it and its Space directory', async () => {
    const directory = await fixtureCopy();
    const before = {
      directory: (await stat(directory)).ino,
      space: (await stat(join(directory, META_SPACE_ID))).ino,
    };
    const { clock, start, nextEvent } = await started(directory);
    const run = running(start);

    await renameMeta(run, 'Renamed in place');
    const written = nextEvent();
    clock.advance(RUN_QUIET_MILLISECONDS);
    await written;

    expect(await spaceTitle(directory, META_SPACE_ID)).toBe('Renamed in place');
    expect({
      directory: (await stat(directory)).ino,
      space: (await stat(join(directory, META_SPACE_ID))).ino,
    }).toEqual(before);
    await run.stop();
  });

  it('waits for quiet: an edit inside the period restarts it', async () => {
    const directory = await fixtureCopy();
    const { clock, start, events } = await started(directory);
    const run = running(start);

    await renameMeta(run, 'First');
    clock.advance(RUN_QUIET_MILLISECONDS - 1);
    await renameMeta(run, 'Second');
    clock.advance(RUN_QUIET_MILLISECONDS - 1);

    expect(writes(events)).toHaveLength(0);
    await run.stop();
    expect(writes(events)).toHaveLength(1);
    expect(await spaceTitle(directory, META_SPACE_ID)).toBe('Second');
  });

  it('flushes a pending edit when stopped, and waits for the write', async () => {
    const directory = await fixtureCopy();
    const { start } = await started(directory);
    const run = running(start);

    await renameMeta(run, 'Written on stop');
    await expect(run.stop()).resolves.toEqual({ kind: 'stopped' });

    expect(await spaceTitle(directory, META_SPACE_ID)).toBe('Written on stop');
  });

  it('serialises writes: edits during a write cause exactly one further write', async () => {
    const directory = await fixtureCopy();
    const { clock, start, events } = await started(directory);
    const run = running(start);

    await renameMeta(run, 'First');
    clock.advance(RUN_QUIET_MILLISECONDS);
    // The first write is under way; two more edits each pass their quiet
    // period before it finishes.
    await renameMeta(run, 'Second');
    clock.advance(RUN_QUIET_MILLISECONDS);
    await renameMeta(run, 'Third');
    clock.advance(RUN_QUIET_MILLISECONDS);
    await run.stop();

    expect(writes(events)).toHaveLength(2);
    expect(await spaceTitle(directory, META_SPACE_ID)).toBe('Third');
  });

  it('tries a failed write again once another quiet period passes', async () => {
    const directory = await fixtureCopy();
    const { clock, start, events, nextEvent } = await started(directory);
    const run = running(start);
    // Export refuses a destination whose aggregate file is a symbolic link, so
    // the first write fails until the file is put back.
    const aggregatePath = join(directory, AGGREGATE_FILE_NAME);
    const aside = join(await temporaryRoot(), AGGREGATE_FILE_NAME);
    await rename(aggregatePath, aside);
    await symlink(aside, aggregatePath);

    await renameMeta(run, 'Written on the retry');
    const failed = nextEvent();
    clock.advance(RUN_QUIET_MILLISECONDS);
    await failed;
    expect(events.map(({ kind }) => kind)).toEqual(['write-failed']);

    await rm(aggregatePath);
    await rename(aside, aggregatePath);
    const written = nextEvent();
    clock.advance(RUN_QUIET_MILLISECONDS);
    await written;

    expect(events.map(({ kind }) => kind)).toEqual(['write-failed', 'written']);
    expect(await spaceTitle(directory, META_SPACE_ID)).toBe('Written on the retry');
    await expect(run.stop()).resolves.toEqual({ kind: 'stopped' });
    expect(writes(events)).toHaveLength(1);
  });

  it('leaves the directory byte-for-byte unchanged when nothing is edited', async () => {
    const directory = await fixtureCopy();
    await writeFile(join(directory, 'NOTES.txt'), 'kept\n');
    const before = await filesUnder(directory);
    const { start, events } = await started(directory);

    await running(start).stop();

    expect(events).toEqual([]);
    expect(await filesUnder(directory)).toEqual(before);
  });

  it.each([
    ['missing', (root: string) => Promise.resolve(join(root, 'new-talk'))],
    [
      'empty',
      async (root: string) => {
        const directory = join(root, 'new-talk');
        await mkdir(directory);
        return directory;
      },
    ],
    [
      'dot-entries-only',
      async (root: string) => {
        const directory = join(root, 'new-talk');
        await mkdir(join(directory, '.git'), { recursive: true });
        await writeFile(join(directory, '.git', 'HEAD'), 'ref: refs/heads/main\n');
        await writeFile(join(directory, '.DS_Store'), 'finder\n');
        return directory;
      },
    ],
  ])('establishes the new Space in a %s directory and writes it at once', async (_, make) => {
    const directory = await make(await temporaryRoot());
    const { start } = await started(directory);
    const run = running(start);

    const aggregateFile: unknown = JSON.parse(
      await readFile(join(directory, AGGREGATE_FILE_NAME), 'utf8'),
    );
    expect(aggregateFile).toMatchObject({ version: 1 });
    const spaces = await backendFor(run).listSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0]?.title).toBe('New space');
    const spaceId = spaces[0]?.id ?? '';
    expect(await spaceTitle(directory, spaceId)).toBe('New space');
    await run.stop();
  });

  /*
   * A fresh `git init` leaves only `.git`, and Finder leaves `.DS_Store`:
   * neither is content, so the run establishes the new Space beside them and
   * leaves them as it found them.
   */
  it('keeps the dot-entries of a directory it establishes the new Space in', async () => {
    const directory = join(await temporaryRoot(), 'new-talk');
    await mkdir(join(directory, '.git'), { recursive: true });
    await writeFile(join(directory, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await writeFile(join(directory, '.DS_Store'), 'finder\n');
    const { start } = await started(directory);
    await running(start).stop();

    await expect(readFile(join(directory, AGGREGATE_FILE_NAME), 'utf8')).resolves.toContain(
      '"version"',
    );
    await expect(readFile(join(directory, '.git', 'HEAD'), 'utf8')).resolves.toBe(
      'ref: refs/heads/main\n',
    );
    await expect(readFile(join(directory, '.DS_Store'), 'utf8')).resolves.toBe('finder\n');
  });

  it('writes a picture uploaded during the run to images/', async () => {
    const directory = await fixtureCopy();
    const { clock, start, nextEvent } = await started(directory);
    const run = running(start);
    const backend = backendFor(run);
    const bytes = pngBytes(42);
    const id = (await admitted(bytes)).id;

    const stored = await backend.storeImage(new Blob([bytes], { type: 'image/png' }));
    expect(stored).toEqual({ kind: 'stored', url: `/images/${id}` });
    if (stored.kind !== 'stored') return;
    const loaded = await backend.loadSpace(META_SPACE_ID);
    if (loaded === undefined) throw new Error('Expected the Meta Space');
    const resourceId = newUuid();
    const committed = await backend.commit({
      changes: [
        {
          kind: 'update',
          spaceId: META_SPACE_ID,
          snapshot: {
            ...loaded.snapshot,
            resources: [
              ...loaded.snapshot.resources,
              { id: resourceId, document: { title: 'Uploaded', kind: 'image', url: stored.url } },
            ],
          },
          expectedRevision: loaded.revision,
        },
      ],
    });
    expect(committed.kind).toBe('committed');

    const written = nextEvent();
    clock.advance(RUN_QUIET_MILLISECONDS);
    await written;

    expect(new Uint8Array(await readFile(join(directory, 'images', `${id}.png`)))).toEqual(bytes);
    await expect(
      readFile(join(directory, META_SPACE_ID, 'resources', `${resourceId}.md`), 'utf8'),
    ).resolves.toContain(`url: /images/${id}`);
    await run.stop();
  });

  it('refuses a single Space directory, naming the missing aggregate file', async () => {
    const directory = join(await fixtureCopy(), META_SPACE_ID);
    const { start } = await started(directory);

    expect(start.kind).toBe('unreadable');
    if (start.kind !== 'unreadable') return;
    expect(start.diagnostics.join('\n')).toContain(AGGREGATE_FILE_NAME);
  });

  it('refuses a directory the aggregate intake refuses, with its errors', async () => {
    const directory = await fixtureCopy();
    await writeFile(
      join(directory, AGGREGATE_FILE_NAME),
      JSON.stringify({ version: 1, metaSpaceId: '00000000-0000-4000-8000-0000000000ff' }),
    );
    const before = await filesUnder(directory);
    const { start } = await started(directory);

    expect(start.kind).toBe('aggregate-refused');
    if (start.kind !== 'aggregate-refused') return;
    expect(start.diagnostics.length).toBeGreaterThan(0);
    expect(await filesUnder(directory)).toEqual(before);
  });
});
