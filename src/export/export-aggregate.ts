import { cp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceAggregate, type SpaceAggregateError } from '@project/graph';
import type { LoadedAggregate } from '@project/persistence';
import {
  AGGREGATE_FILE_NAME,
  assertExportableDestination,
  pruneObsoleteSpaceDirectories,
  readAggregate,
  writeAggregateDirectory,
} from '../aggregate-directory';
import type { SpaceRepository } from '../persistence/space-repository';
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
  | { kind: 'uninitialized' }
  /**
   * Staged bytes re-read as Spaces naming the expected Meta Space, but ordinary
   * Aggregate intake refused them. The destination is untouched. The CLI renders
   * `errors` through `describeAggregateRefusal`.
   */
  | {
      kind: 'invalid-staged-aggregate';
      metaSpaceId: UUID;
      spaces: readonly SpaceSnapshot[];
      errors: readonly SpaceAggregateError[];
    };

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

/**
 * Prove the staged directory reads back as the aggregate it was written from,
 * before anything replaces the destination.
 *
 * Read through the ordinary Aggregate-directory reader and the ordinary
 * aggregate intake, rather than through a check written for export: what this
 * needs to know is that import will accept these bytes, and the only honest way
 * to know that is to ask import.
 *
 * It is not an equality check against the stored snapshots, and deliberately.
 * Canonical export is canonical rather than byte-preserving (ADR 0030) — it
 * normalizes Markdown line endings, among other things — so a stored Space and
 * its exported form may legitimately differ. What must hold is that the result
 * is a valid, Meta-rooted aggregate naming the same Meta Space.
 *
 * An intake refusal is returned rather than rendered: `loadAggregate` has
 * already validated, so a refusal here means the canonical bytes disagree with
 * the aggregate they were written from — a serialization defect. The CLI owns
 * the operator sentences via `describeAggregateRefusal`, the same renderer
 * import uses. A Meta id mismatch remains a thrown Error: that is a bug in the
 * writer, not an Aggregate the operator can repair in the destination.
 */
const verifyStagedAggregate = async (
  directory: string,
  metaSpaceId: UUID,
): Promise<
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly metaSpaceId: UUID;
      readonly spaces: readonly SpaceSnapshot[];
      readonly errors: readonly SpaceAggregateError[];
    }
> => {
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
    return {
      ok: false,
      metaSpaceId,
      spaces: reread.spaces,
      errors: intake.errors,
    };
  }
  return { ok: true };
};

const stageAggregate = async (
  aggregate: LoadedAggregate,
  replacement: string,
): Promise<
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly metaSpaceId: UUID;
      readonly spaces: readonly SpaceSnapshot[];
      readonly errors: readonly SpaceAggregateError[];
    }
> => {
  const spaceIds = new Set(aggregate.spaces.map(({ snapshot }) => snapshot.id));
  await pruneObsoleteSpaceDirectories(replacement, spaceIds);
  await writeAggregateDirectory(aggregate, replacement);
  return verifyStagedAggregate(replacement, aggregate.metaSpaceId);
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
  await assertExportableDestination(destination);

  const stagingRoot = await createStagingRoot(destination);
  const replacement = join(stagingRoot, 'replacement');
  try {
    if (await exists(destination)) {
      await cp(destination, replacement, { recursive: true });
    } else {
      await mkdir(replacement);
    }
    const staged = await stageAggregate(aggregate, replacement);
    if (!staged.ok) {
      return {
        kind: 'invalid-staged-aggregate',
        metaSpaceId: staged.metaSpaceId,
        spaces: staged.spaces,
        errors: staged.errors,
      };
    }
    await replaceDestination(replacement, destination);
    const unrecorded = await markAggregateExported(repository, aggregate);
    return { kind: 'exported', aggregate, unrecorded };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
  }
};
