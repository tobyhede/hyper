import { cp, lstat, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  SPACE_FILE_VERSION,
  spaceSnapshotSchema,
  type Thing,
  type ThingPlacement,
  type SpaceFile,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot, serializeThingFile } from '@project/graph';
import type { LoadedSpace } from '@project/persistence';
import { readSingleSpace } from '../import/read-single-space';
import type { SpaceRepository } from '../persistence/space-repository';

const compareOrdinal = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/**
 * One placement, rebuilt key by key — the remembered Open Size included, on both
 * arms of the union, because a rect carried through would export whatever order
 * `jsonb` handed it back in. `Placement.point` establishes width-then-height as
 * the canonical order and this is the same order written to disk.
 */
const canonicalPlacement = (point: ThingPlacement): ThingPlacement => {
  if (point.open) {
    return {
      x: point.x,
      y: point.y,
      open: true,
      openSize: { width: point.openSize.width, height: point.openSize.height },
    };
  }
  return point.openSize === undefined
    ? { x: point.x, y: point.y, open: false }
    : {
        x: point.x,
        y: point.y,
        open: false,
        openSize: { width: point.openSize.width, height: point.openSize.height },
      };
};

/**
 * A diagram's graphs, rebuilt key by key and emitted in the order the diagram
 * holds them.
 *
 * Ordering is the one thing this does *not* impose, and the asymmetry with the
 * positions beside it comes from how the document is stored. `jsonb` reorders
 * an object's keys on write and preserves an array's order. A diagram's
 * positions are an object, so the order they were written in is gone by the
 * time they are read back and the sort below is what gives them one again —
 * without it a re-export of untouched content produces a diff. Its graphs are
 * an array, so their order survives storage intact; it is also authored content
 * (ADR 0040) — order is what the graph selector offers and what the
 * absent-`activeGraph` fallback resolves against — so sorting them here would
 * rewrite the space on its way to disk.
 *
 * Every nested value is rebuilt from a literal rather than carried through, for
 * the same reason: what `jsonb` hands back is key-ordered however it likes, and
 * a spread would export that order.
 */
const canonicalGraphs = (
  graphs: NonNullable<SpaceFile['diagrams']>[number]['graphs'],
): NonNullable<SpaceFile['diagrams']>[number]['graphs'] =>
  graphs.map((graph) => {
    const edges = graph.edges.map(({ from, to }) => ({ from, to }));
    // Two full literals rather than a base object with `color` assigned after:
    // `color` sits between `title` and `edges` in the exported key order, and an
    // assignment after construction would insert it last instead.
    return graph.color === undefined
      ? { id: graph.id, title: graph.title, edges }
      : { id: graph.id, title: graph.title, color: graph.color, edges };
  });

const canonicalSpaceFile = ({ snapshot }: LoadedSpace): SpaceFile => {
  const diagrams = snapshot.document.diagrams?.map((diagram) => {
    const diagramBase: Omit<NonNullable<SpaceFile['diagrams']>[number], 'activeGraph'> = {
      id: diagram.id,
      title: diagram.title,
      kind: diagram.kind,
      positions: Object.fromEntries(
        Object.entries(diagram.positions)
          .sort(([left], [right]) => compareOrdinal(left, right))
          // The point is rebuilt too, not passed through: a stored `{"y":…,"x":…}`
          // would otherwise export in that order. An absent value cannot come off
          // a parsed document — the optionality is the `Partial<Record>` the
          // schema's key branding produces — and dropping it matches what
          // `JSON.stringify` already did with one.
          .flatMap<readonly [string, ThingPlacement]>(([id, point]) => {
            if (point === undefined) return [];
            return [[id, canonicalPlacement(point)]];
          }),
      ),
      graphs: canonicalGraphs(diagram.graphs),
    };
    return diagram.activeGraph === undefined
      ? diagramBase
      : { ...diagramBase, activeGraph: diagram.activeGraph };
  });
  const fileBase: Pick<SpaceFile, 'version' | 'id' | 'title'> = {
    version: SPACE_FILE_VERSION,
    id: snapshot.id,
    title: snapshot.document.title,
  };
  const withDiagrams = diagrams === undefined ? fileBase : { ...fileBase, diagrams };
  return snapshot.document.defaultDiagram === undefined
    ? withDiagrams
    : { ...withDiagrams, defaultDiagram: snapshot.document.defaultDiagram };
};

const canonicalThing = (
  id: UUID,
  document: LoadedSpace['snapshot']['things'][number]['document'],
): Thing => {
  const common = {
    id,
    title: document.title,
  };
  if (document.kind === 'alias') return { ...common, kind: 'alias', target: document.target };
  if (document.kind === 'space')
    return {
      ...common,
      kind: 'space',
      spaceId: document.spaceId,
      diagram: document.diagram,
      graph: document.graph,
    };
  return { ...common, kind: 'markdown', body: document.body.replace(/\r\n?/g, '\n') };
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
};

const rejectSymbolicLink = async (path: string): Promise<void> => {
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      throw new Error(`Export destination contains a symbolic link: ${path}`);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
};

const removeMarkdownFiles = async (directory: string): Promise<void> => {
  if (!(await exists(directory))) return;
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => rm(join(directory, entry.name))),
  );
};

const prepareReplacement = async (stored: LoadedSpace, directory: string): Promise<void> => {
  await removeMarkdownFiles(directory);
  await removeMarkdownFiles(join(directory, 'things'));
  await rm(join(directory, 'space.json'), { force: true });

  const thingsDirectory = join(directory, 'things');
  await mkdir(thingsDirectory, { recursive: true });
  await writeFile(
    join(directory, 'space.json'),
    `${JSON.stringify(canonicalSpaceFile(stored), null, 2)}\n`,
  );
  for (const thing of [...stored.snapshot.things].sort((left, right) =>
    compareOrdinal(left.id, right.id),
  )) {
    await writeFile(
      join(thingsDirectory, `${thing.id}.md`),
      serializeThingFile(canonicalThing(thing.id, thing.document)),
    );
  }

  const imported = await readSingleSpace(directory);
  const snapshot = spaceSnapshotSchema.parse({
    id: imported.id,
    document: imported.document,
    things: imported.things,
  });
  const intake = loadSpaceSnapshot(snapshot);
  if (!intake.ok) {
    throw new Error(intake.errors.map(({ message }) => message).join('\n'));
  }
};

const replaceDestination = async (replacement: string, destination: string): Promise<void> => {
  if (!(await exists(destination))) {
    await rename(replacement, destination);
    return;
  }

  const backupRoot = await mkdtemp(
    join(dirname(destination), `.${basename(destination)}.hyper-export-backup-`),
  );
  const backup = join(backupRoot, 'previous');
  try {
    await rename(destination, backup);
    try {
      await rename(replacement, destination);
    } catch (replacementError) {
      try {
        await rename(backup, destination);
      } catch (restoreError) {
        throw new AggregateError(
          [replacementError, restoreError],
          `Export replacement failed; the previous destination remains at ${backup}`,
          { cause: restoreError },
        );
      }
      throw replacementError;
    }
    // Both renames landed, so the export is complete and the recovery copy is
    // now housekeeping. Letting its removal fail the call would report a
    // finished export as a failure and skip `markExported`, leaving the
    // projected revision behind the bytes already on disk.
    await rm(backupRoot, { recursive: true, force: true }).catch(() => undefined);
  } catch (error) {
    if (!(await exists(backup))) await rm(backupRoot, { recursive: true, force: true });
    throw error;
  }
};

export const exportSpace = async (
  repository: SpaceRepository,
  id: UUID,
  destinationPath: string,
): Promise<LoadedSpace | undefined> => {
  const stored = await repository.loadSpace(id);
  if (stored === undefined) return undefined;

  const destination = resolve(destinationPath);
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  await rejectSymbolicLink(destination);
  await rejectSymbolicLink(join(destination, 'things'));
  await Promise.all(
    stored.snapshot.things.map(({ id: thingId }) =>
      rejectSymbolicLink(join(destination, 'things', `${thingId}.md`)),
    ),
  );
  const stagingRoot = await mkdtemp(join(parent, `.${basename(destination)}.hyper-export-`));
  const replacement = join(stagingRoot, 'replacement');
  try {
    if (await exists(destination)) {
      await cp(destination, replacement, { recursive: true });
    } else {
      await mkdir(replacement);
    }
    await prepareReplacement(stored, replacement);
    await replaceDestination(replacement, destination);
    await repository.markExported(id, stored.revision);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
  }

  return stored;
};
