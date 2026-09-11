import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SPACE_FILE_VERSION,
  type SpaceFile,
  type Thing,
  type ThingPlacement,
  type UUID,
} from '@project/core';
import { serializeThingFile } from '@project/graph';
import type { LoadedSpace } from '@project/persistence';

export const compareOrdinal = (left: string, right: string): number =>
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

export const canonicalSpaceFile = ({ snapshot }: LoadedSpace): SpaceFile => {
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

export const canonicalThing = (
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

const removeMarkdownFiles = async (directory: string): Promise<void> => {
  if (!(await exists(directory))) return;
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => rm(join(directory, entry.name))),
  );
};

/**
 * Write one Space's canonical files into a directory, replacing whatever the
 * reader would have discovered there and leaving everything else alone.
 *
 * What it removes is exactly what `readSingleSpace` scans — `*.md` beside the
 * space file, `things/*.md`, and `space.json` — so a Thing deleted since the
 * last export leaves no file behind to be read back as a Thing that still
 * exists. Anything the reader would not have looked at survives, which is what
 * lets a Space directory carry notes, assets or a README across a round trip.
 */
export const writeSpaceDirectory = async (
  stored: LoadedSpace,
  directory: string,
): Promise<void> => {
  await mkdir(directory, { recursive: true });
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
};
