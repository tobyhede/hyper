import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { AGGREGATE_FILE_VERSION, type AggregateFile, type UUID } from '@project/core';
import { loadSpaceAggregate } from '@project/graph';
import type { LoadedAggregate } from '@project/persistence';
import { describeAggregateRefusal } from '../cli/aggregate-refusal';
import {
  AGGREGATE_FILE_NAME,
  discoverSpaceDirectories,
  readAggregate,
  spaceDirectoryId,
} from '../import/read-aggregate';
import type { SpaceRepository } from '../persistence/space-repository';
import { compareOrdinal } from '../ordinal';
import { writeSpaceDirectory } from './canonical-space';
import {
  createStagingRoot,
  exists,
  rejectSymbolicLink,
  replaceDestination,
} from './replace-destination';

/** One Space whose bytes landed but whose projected revision was not recorded. */
export interface UnrecordedExport {
  readonly spaceId: UUID;
  readonly reason: unknown;
}

export type AggregateExportResult =
  /**
   * `unrecorded` is empty on the ordinary export. It is not a failure arm: the
   * bytes are complete and valid on disk either way, and a Space listed here
   * simply still reads as changed since its last export.
   */
  | { kind: 'exported'; aggregate: LoadedAggregate; unrecorded: readonly UnrecordedExport[] }
  | { kind: 'uninitialized' };

/**
 * Nothing in a canonical export is minted, because the aggregate being written
 * is already fully identified. Verification re-reads what was staged through the
 * ordinary import reader, which takes a generator for the ids a hand-authored
 * directory may omit — so the one this passes exists to prove it is never
 * reached. If it is, the export wrote a file with an id missing from it.
 */
const mintsNothing = (): UUID => {
  throw new Error('Canonical export wrote an entity with no id');
};

const aggregateFile = (metaSpaceId: UUID): AggregateFile => ({
  version: AGGREGATE_FILE_VERSION,
  metaSpaceId,
});

/**
 * Drop the Space directories the aggregate no longer holds.
 *
 * A directory named for a Space Id is one a previous export wrote, so a Space
 * deleted since then has to leave with it — otherwise the next import reads the
 * deletion back as a Space that still exists. Everything else the destination
 * carries is left alone: a directory this export did not name and cannot have
 * written is the author's, and re-export preserves it.
 *
 * `spaceDirectoryId` is what "cannot have written" means, and the canonical
 * lower-case spelling it insists on is load-bearing here: removal is recursive,
 * and `z.string().uuid()` alone would accept an upper-cased name this exporter
 * never writes — an author's own directory, destroyed for looking like ours.
 */
const removeObsoleteSpaceDirectories = async (
  directory: string,
  keep: ReadonlySet<UUID>,
): Promise<void> => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = spaceDirectoryId(entry.name);
    if (id === undefined || keep.has(id)) continue;
    await rm(join(directory, entry.name), { recursive: true, force: true });
  }
};

/**
 * Prove the staged directory reads back as the aggregate it was written from,
 * before anything replaces the destination.
 *
 * Read through the ordinary import reader and the ordinary aggregate intake,
 * rather than through a check written for export: what this needs to know is
 * that import will accept these bytes, and the only honest way to know that is
 * to ask import.
 *
 * It is not an equality check against the stored snapshots, and deliberately.
 * Canonical export is canonical rather than byte-preserving (ADR 0030) — it
 * normalizes Markdown line endings, among other things — so a stored Space and
 * its exported form may legitimately differ. What must hold is that the result
 * is a valid, Meta-rooted aggregate naming the same Meta Space.
 *
 * A refusal is rendered through `describeAggregateRefusal`, the same renderer
 * the CLI's import path uses. `loadAggregate` has already validated, so the
 * only thing that can fail here is the canonical bytes disagreeing with the
 * aggregate they were written from — a serialization defect, where the Space and
 * Thing ids are precisely what the operator needs and `error.kind` alone is one
 * word for a fault that could be anywhere in a Space.
 */
const verifyStagedAggregate = async (directory: string, metaSpaceId: UUID): Promise<void> => {
  const reread = await readAggregate(directory, mintsNothing);
  if (reread.metaSpaceId !== metaSpaceId) {
    throw new Error(
      `Exported aggregate names Meta Space ${reread.metaSpaceId} rather than ${metaSpaceId}`,
    );
  }
  const intake = loadSpaceAggregate({
    metaSpaceId: reread.metaSpaceId,
    snapshots: reread.spaces,
  });
  if (!intake.ok) {
    throw new Error(
      [
        'Exported aggregate does not read back as a valid aggregate:',
        ...describeAggregateRefusal(intake.errors, reread.spaces),
      ].join('\n'),
    );
  }
};

const stageAggregate = async (aggregate: LoadedAggregate, replacement: string): Promise<void> => {
  const spaceIds = new Set(aggregate.spaces.map(({ snapshot }) => snapshot.id));
  await removeObsoleteSpaceDirectories(replacement, spaceIds);

  await writeFile(
    join(replacement, AGGREGATE_FILE_NAME),
    `${JSON.stringify(aggregateFile(aggregate.metaSpaceId), null, 2)}\n`,
  );
  for (const space of [...aggregate.spaces].sort((left, right) =>
    compareOrdinal(left.snapshot.id, right.snapshot.id),
  )) {
    await writeSpaceDirectory(space, join(replacement, space.snapshot.id));
  }

  await verifyStagedAggregate(replacement, aggregate.metaSpaceId);
};

/**
 * Refuse a destination holding a Space directory import could not read back,
 * before anything is staged.
 *
 * Staging is a copy of the destination and verification re-reads the staged
 * copy, so a Space directory the author left here under a name that is not its
 * Space's id — an old flat-format Space, a hand-authored sample — fails every
 * export from then on. And the diagnostic would name a path inside a staging
 * root this function's caller deletes before the operator can read it, so the
 * path they are told to fix would not exist.
 *
 * Checked here rather than answered by having the reader skip a directory it
 * cannot name: that skip is the guard which stops a renamed Space directory
 * importing as a fresh Space, and dropping it would trade a loud failure for a
 * silent duplication.
 */
const rejectUnreadableSpaceDirectories = async (destination: string): Promise<void> => {
  if (!(await exists(destination))) return;
  const unreadable = (await discoverSpaceDirectories(destination)).filter(
    (child) => spaceDirectoryId(basename(child)) === undefined,
  );
  if (unreadable.length === 0) return;
  throw new Error(
    [
      'Export destination holds a Space directory that is not named for its Space, so the export could not be read back:',
      ...unreadable,
      'Rename each to its Space id in lower case, or move it out of the destination.',
    ].join('\n'),
  );
};

const rejectSymbolicLinks = async (
  destination: string,
  aggregate: LoadedAggregate,
): Promise<void> => {
  await rejectSymbolicLink(destination);
  await rejectSymbolicLink(join(destination, AGGREGATE_FILE_NAME));
  await Promise.all(
    aggregate.spaces.map(async ({ snapshot }) => {
      const spaceDirectory = join(destination, snapshot.id);
      await rejectSymbolicLink(spaceDirectory);
      await rejectSymbolicLink(join(spaceDirectory, 'things'));
      await Promise.all(
        snapshot.things.map(({ id }) =>
          rejectSymbolicLink(join(spaceDirectory, 'things', `${id}.md`)),
        ),
      );
    }),
  );
};

/**
 * Record the revision each Space was exported at, one call per Space, after the
 * bytes are already on disk.
 *
 * Every Space is attempted even when one fails, which is what "independently"
 * buys: a Space that can be marked is marked whatever happened to its
 * neighbour. An unmarked Space reads as changed since its last export, which is
 * the conservative direction — it invites an export that was already done,
 * where the opposite would hide one that never happened. So this runs after
 * replacement and never before it: a revision recorded against bytes that did
 * not land is the one failure mode there is no recovering from.
 *
 * **Answered, not thrown.** This runs after the destination has been replaced,
 * so by the time it can fail the export has already happened and no sentence
 * may say otherwise. Throwing made the CLI print `Export failed` with exit 1
 * for the one outcome this ordering was chosen to make safe, which invites the
 * operator to re-run or discard a destination that is complete and valid. Each
 * failure is returned against the Space it belongs to, because "which Space,
 * and why" is the whole of what the operator can act on — an `AggregateError`
 * carried neither through `describeError`, which reads only `message`.
 */
const markAggregateExported = async (
  repository: SpaceRepository,
  aggregate: LoadedAggregate,
): Promise<readonly UnrecordedExport[]> => {
  const results = await Promise.allSettled(
    aggregate.spaces.map(({ snapshot, revision }) =>
      repository.markExported(snapshot.id, revision),
    ),
  );
  return results.flatMap((result, index) => {
    const space = aggregate.spaces[index];
    if (result.status !== 'rejected' || space === undefined) return [];
    // SAFETY: PromiseRejectedResult.reason is typed `any` by lib.es; asserting
    // `unknown` stops that `any` from propagating into the result.
    return [{ spaceId: space.snapshot.id, reason: result.reason as unknown }];
  });
};

/**
 * Write the complete stored aggregate to a canonical directory.
 *
 * One `loadAggregate()` read is the whole of what gets exported, so every Space
 * in the directory comes from one consistent view rather than from a series of
 * reads a concurrent commit could fall between.
 *
 * The destination is replaced whole, from a staging copy of itself: what the
 * reader would discover is regenerated, obsolete Space directories go, and
 * everything else — root files this format ignores, and undiscovered contents
 * inside a Space directory that survives — is carried across untouched.
 */
export const exportAggregate = async (
  repository: SpaceRepository,
  destinationPath: string,
): Promise<AggregateExportResult> => {
  const loaded = await repository.loadAggregate();
  if (loaded.kind === 'uninitialized') return { kind: 'uninitialized' };
  const aggregate = loaded.aggregate;

  const destination = resolve(destinationPath);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await rejectSymbolicLinks(destination, aggregate);
  await rejectUnreadableSpaceDirectories(destination);

  const stagingRoot = await createStagingRoot(destination);
  const replacement = join(stagingRoot, 'replacement');
  let unrecorded: readonly UnrecordedExport[];
  try {
    if (await exists(destination)) {
      await cp(destination, replacement, { recursive: true });
    } else {
      await mkdir(replacement);
    }
    await stageAggregate(aggregate, replacement);
    await replaceDestination(replacement, destination);
    unrecorded = await markAggregateExported(repository, aggregate);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
  }

  return { kind: 'exported', aggregate, unrecorded };
};
