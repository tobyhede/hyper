import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AGGREGATE_FILE_VERSION, uuidSchema, type AggregateFile, type UUID } from '@project/core';
import { loadSpaceAggregate } from '@project/graph';
import type { LoadedAggregate } from '@project/persistence';
import { AGGREGATE_FILE_NAME, readAggregate } from '../import/read-aggregate';
import type { SpaceRepository } from '../persistence/space-repository';
import { compareOrdinal, writeSpaceDirectory } from './canonical-space';
import {
  createStagingRoot,
  exists,
  rejectSymbolicLink,
  replaceDestination,
} from './replace-destination';

export type AggregateExportResult =
  { kind: 'exported'; aggregate: LoadedAggregate } | { kind: 'uninitialized' };

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
 * A directory named for a UUID is one a previous export wrote, so a Space
 * deleted since then has to leave with it — otherwise the next import reads the
 * deletion back as a Space that still exists. Everything else the destination
 * carries is left alone: a directory this export did not name and cannot have
 * written is the author's, and re-export preserves it.
 */
const removeObsoleteSpaceDirectories = async (
  directory: string,
  keep: ReadonlySet<UUID>,
): Promise<void> => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const named = uuidSchema.safeParse(entry.name);
    if (!named.success || keep.has(named.data)) continue;
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
    throw new Error(intake.errors.map(({ kind }) => kind).join('\n'));
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
 */
const markAggregateExported = async (
  repository: SpaceRepository,
  aggregate: LoadedAggregate,
): Promise<void> => {
  const results = await Promise.allSettled(
    aggregate.spaces.map(({ snapshot, revision }) =>
      repository.markExported(snapshot.id, revision),
    ),
  );
  // SAFETY: PromiseRejectedResult.reason is typed `any` by lib.es; asserting
  // `unknown` stops that `any` from propagating into `failures`.
  const failures: unknown[] = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'The aggregate was exported but its projected revisions were not all recorded',
    );
  }
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

  const stagingRoot = await createStagingRoot(destination);
  const replacement = join(stagingRoot, 'replacement');
  try {
    if (await exists(destination)) {
      await cp(destination, replacement, { recursive: true });
    } else {
      await mkdir(replacement);
    }
    await stageAggregate(aggregate, replacement);
    await replaceDestination(replacement, destination);
    await markAggregateExported(repository, aggregate);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
  }

  return { kind: 'exported', aggregate };
};
