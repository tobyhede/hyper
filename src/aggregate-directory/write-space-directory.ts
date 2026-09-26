import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SPACE_FILE_VERSION,
  type GraphEdge,
  type SpaceFile,
  type Resource,
  type ResourcePlacement,
  type UUID,
} from '@project/core';
import { serializeResourceFile } from '@project/graph';
import type { LoadedSpace } from '@project/persistence';
import { compareOrdinal } from '../ordinal';
import { isMissingFile } from './space-directory';

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
};

/**
 * One placement, rebuilt key by key — the remembered Open Size included, on both
 * arms of the union, because a rect carried through would export whatever order
 * `jsonb` handed it back in. `Placement.point` establishes width-then-height as
 * the canonical order and this is the same order written to disk.
 */
const canonicalPlacement = (point: ResourcePlacement): ResourcePlacement => {
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

/** Full literals, so the exported key order is fixed and an absent Title writes no key. */
const canonicalEdge = (edge: GraphEdge): GraphEdge => {
  if (edge.title === undefined) return { from: edge.from, to: edge.to };
  return edge.titleHidden === undefined
    ? { from: edge.from, to: edge.to, title: edge.title }
    : { from: edge.from, to: edge.to, title: edge.title, titleHidden: edge.titleHidden };
};

/**
 * A map's graphs, rebuilt key by key and emitted in the order the map
 * holds them.
 *
 * Ordering is the one constraint this does *not* impose, and the asymmetry with the
 * positions beside it comes from how the document is stored. `jsonb` reorders
 * an object's keys on write and preserves an array's order. A map's
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
  graphs: NonNullable<SpaceFile['maps']>[number]['graphs'],
): NonNullable<SpaceFile['maps']>[number]['graphs'] =>
  graphs.map(({ id, title, color, headShape, edges }) => {
    // Each optional field is added to the head in exported key order, and
    // `edges` is spread in after the head so it stays last.
    const head: Omit<NonNullable<SpaceFile['maps']>[number]['graphs'][number], 'edges'> = {
      id,
      title,
    };
    if (color !== undefined) head.color = color;
    if (headShape !== undefined) head.headShape = headShape;
    return { ...head, edges: edges.map(canonicalEdge) };
  });

const canonicalSpaceFile = ({ snapshot }: LoadedSpace): SpaceFile => {
  const maps = snapshot.document.maps?.map((map) => {
    const mapBase: Omit<NonNullable<SpaceFile['maps']>[number], 'activeGraph'> = {
      id: map.id,
      title: map.title,
      kind: map.kind,
      positions: Object.fromEntries(
        Object.entries(map.positions)
          .sort(([left], [right]) => compareOrdinal(left, right))
          // The point is rebuilt too, not passed through: a stored `{"y":…,"x":…}`
          // would otherwise export in that order. An absent value cannot come off
          // a parsed document — the optionality is the `Partial<Record>` the
          // schema's key branding produces — and dropping it matches what
          // `JSON.stringify` already did with one.
          .flatMap<readonly [string, ResourcePlacement]>(([id, point]) => {
            if (point === undefined) return [];
            return [[id, canonicalPlacement(point)]];
          }),
      ),
      graphs: canonicalGraphs(map.graphs),
    };
    return map.activeGraph === undefined ? mapBase : { ...mapBase, activeGraph: map.activeGraph };
  });
  const fileBase: Pick<SpaceFile, 'version' | 'id' | 'title'> = {
    version: SPACE_FILE_VERSION,
    id: snapshot.id,
    title: snapshot.document.title,
  };
  const withMaps = maps === undefined ? fileBase : { ...fileBase, maps };
  return snapshot.document.defaultMap === undefined
    ? withMaps
    : { ...withMaps, defaultMap: snapshot.document.defaultMap };
};

const canonicalResource = (
  id: UUID,
  document: LoadedSpace['snapshot']['resources'][number]['document'],
): Resource => {
  const common = {
    id,
    title: document.title,
  };
  if (document.kind === 'reference')
    return { ...common, kind: 'reference', target: document.target };
  if (document.kind === 'space')
    return {
      ...common,
      kind: 'space',
      spaceId: document.spaceId,
      map: document.map,
      graph: document.graph,
    };
  return { ...common, kind: 'markdown', body: document.body.replace(/\r\n?/g, '\n') };
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
 * space file, `resources/*.md`, and `space.json` — so a Resource deleted since the
 * last export leaves no file behind to be read back as a Resource that still
 * exists. Anything the reader would not have looked at survives, which is what
 * lets a Space directory carry notes or assets across a round trip.
 *
 * **Markdown is not among what survives, and a `README.md` here is no
 * exception.** The reader scans root `*.md` as Resource files, so a README beside
 * `space.json` is not an ignored file at all — left in place it would import as
 * a Resource, or refuse the import for having no frontmatter. Removing it is the
 * correct behaviour rather than a gap; prose that belongs with a Space directory
 * has to sit under a name the reader does not scan.
 */
export const writeSpaceDirectory = async (
  stored: LoadedSpace,
  directory: string,
): Promise<void> => {
  await mkdir(directory, { recursive: true });
  await removeMarkdownFiles(directory);
  await removeMarkdownFiles(join(directory, 'resources'));
  await rm(join(directory, 'space.json'), { force: true });

  const resourcesDirectory = join(directory, 'resources');
  await mkdir(resourcesDirectory, { recursive: true });
  await writeFile(
    join(directory, 'space.json'),
    `${JSON.stringify(canonicalSpaceFile(stored), null, 2)}\n`,
  );
  for (const resource of [...stored.snapshot.resources].sort((left, right) =>
    compareOrdinal(left.id, right.id),
  )) {
    await writeFile(
      join(resourcesDirectory, `${resource.id}.md`),
      serializeResourceFile(canonicalResource(resource.id, resource.document)),
    );
  }
};
