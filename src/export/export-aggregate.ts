import { resolve } from 'node:path';
import { type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceAggregate, type SpaceAggregateError } from '@project/graph';
import type { LoadedAggregate } from '@project/persistence';
import {
  aggregateFiles,
  assertExportableDestination,
  loadReferencedImages,
  readAggregateFiles,
  rejectSymbolicLinks,
  scannedAggregateFiles,
  writeInPlace,
  type DirectoryFiles,
} from '../aggregate-directory';
import type { SpaceRepository } from '../persistence/space-repository';

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
   * The files read back as Spaces naming the expected Meta Space, but ordinary
   * Aggregate intake refused them. Nothing was written. The CLI renders
   * `errors` through `describeAggregateRefusal`.
   */
  | {
      kind: 'would-not-read-back';
      metaSpaceId: UUID;
      spaces: readonly SpaceSnapshot[];
      errors: readonly SpaceAggregateError[];
    };

/**
 * Nothing in a canonical export is minted, because the aggregate being written
 * is already fully identified. The check reads the files through the ordinary
 * import reader, which takes a generator for the ids a hand-authored directory
 * may omit — so the one this passes exists to prove it is never reached. If it
 * is, the export would write a file with an id missing from it.
 */
const mintsNothing = (): UUID => {
  throw new Error('Canonical export wrote an entity with no id');
};

/**
 * Prove the files read back as the aggregate they were serialised from, in
 * memory, before any of them is written.
 *
 * Read through the ordinary Aggregate-directory parsers and the ordinary
 * aggregate intake, rather than through a check written for export: what this
 * needs to know is that import will accept these bytes, and the only honest way
 * to know that is to ask import.
 *
 * It is not an equality check against the stored snapshots, and deliberately.
 * Canonical export is canonical rather than byte-preserving (ADR 0030) — it
 * normalizes Markdown line endings, among other effects — so a stored Space and
 * its exported form may legitimately differ. What must hold is that the result
 * is a valid, Meta-rooted aggregate naming the same Meta Space.
 *
 * An intake refusal is returned rather than rendered: `loadAggregate` has
 * already validated, so a refusal here means the canonical bytes disagree with
 * the aggregate they were serialised from — a serialization defect. The CLI owns
 * the operator sentences via `describeAggregateRefusal`, the same renderer
 * import uses. A Meta id mismatch remains a thrown Error: that is a bug in the
 * writer, not an Aggregate the operator can repair in the destination.
 */
const checkReadsBack = async (
  destination: string,
  files: DirectoryFiles,
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
  const reread = await readAggregateFiles(destination, files, mintsNothing);
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

/**
 * Record the revision each Space was exported at, one call per Space, after the
 * bytes are already on disk.
 *
 * Every Space is attempted even when one fails, which is what "independently"
 * buys: a Space that can be marked is marked whatever happened to its
 * neighbour. An unmarked Space reads as changed since its last export, which is
 * the conservative direction — it invites an export that was already done,
 * where the opposite would hide one that never happened. So this runs after
 * every file is written and never before: a revision recorded against bytes
 * that did not land is the one failure mode there is no recovering from.
 *
 * **Answered, not thrown.** This runs after every file is written, so by the
 * time it can fail the export has already happened and no sentence
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
 * Write the complete stored aggregate to a canonical directory, in place
 * (ADR 0119).
 *
 * One `loadAggregate()` read is the whole of what gets exported, so every Space
 * in the directory comes from one consistent view rather than from a series of
 * reads a concurrent commit could fall between. The bytes of every stored image
 * the aggregate shows are written to `images/` (ADR 0118); images are read after
 * the aggregate and outside its revision, and an image's id is its content, so
 * no commit can change one between the two reads.
 *
 * The files are checked to read back before any is written, and a refusal
 * writes nothing. Then each file whose bytes differ is replaced, and each file
 * Import would read that the aggregate no longer serialises to is removed. The
 * destination and its Space directories are never renamed or recreated, and
 * nothing Import does not read is touched. A failure part-way leaves some files
 * written and some not; git, not Hyper, restores the directory.
 */
export const exportAggregate = async (
  repository: SpaceRepository,
  destinationPath: string,
): Promise<AggregateExportResult> => {
  const loaded = await repository.loadAggregate();
  if (loaded.kind === 'uninitialized') return { kind: 'uninitialized' };
  const aggregate = loaded.aggregate;
  const images = await loadReferencedImages(
    repository,
    aggregate.spaces.map(({ snapshot }) => snapshot),
  );

  const destination = resolve(destinationPath);
  const files = aggregateFiles(aggregate, images);
  await rejectSymbolicLinks(destination, files.keys());
  await assertExportableDestination(destination);

  const checked = await checkReadsBack(destination, files, aggregate.metaSpaceId);
  if (!checked.ok) {
    return {
      kind: 'would-not-read-back',
      metaSpaceId: checked.metaSpaceId,
      spaces: checked.spaces,
      errors: checked.errors,
    };
  }
  await writeInPlace(destination, files, await scannedAggregateFiles(destination));
  const unrecorded = await markAggregateExported(repository, aggregate);
  return { kind: 'exported', aggregate, unrecorded };
};
