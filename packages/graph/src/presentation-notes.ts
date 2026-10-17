import type { Graph, Map, ResourceId } from '@project/core';
import { outgoingEdges } from './traversal';

/**
 * A presentation's notes, found by convention rather than stored (ADR 0129).
 *
 * The **Presentation Notes Graph** is an ordinary Graph on the talk's Map whose
 * title marks it as notes: the talk Graph's title followed by a marker, or a
 * marker alone. Its Edges run from a Resource of the talk to that Resource's
 * notes, which are ordinary Resources of any kind.
 */
export interface PresentationNotes {
  /** The Presentation Notes Graph, or `null` when no Graph on the Map is one. */
  readonly graph: Graph | null;
  /** Every other Graph whose title also matched, in the order they ranked. */
  readonly passedOver: readonly Graph[];
  /** The notes for the Resource asked about, in the order they sit on the Map. */
  readonly notes: readonly ResourceId[];
}

/**
 * A title as words: compatibility-normalised, case-folded, and split on every
 * run of anything that is neither a letter nor a digit. Title Line breaks are
 * separators like any other, so how a Title is broken changes nothing.
 *
 * JavaScript has no case folding, and `toLowerCase` alone leaves "ß" apart
 * from "SS". Upper-casing first applies the full mappings that fold expands,
 * so "Straße" and "STRASSE" are one word.
 */
const words = (title: string): readonly string[] =>
  title
    .normalize('NFKC')
    .toUpperCase()
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);

/**
 * How strongly the words after the talk's title mark a Graph as notes, lower
 * winning, or `undefined` for words that are no marker.
 */
const markerRank = (marker: readonly string[]): number | undefined => {
  const [first, second, ...rest] = marker;
  if (first === 'presentationnotes' && second === undefined) return 0;
  if (first === 'presentation' && second === 'notes' && rest.length === 0) return 0;
  if (first === 'notes' && second === undefined) return 1;
  if (first === 'presentation' && second !== undefined) return 2;
  return undefined;
};

interface Candidate {
  readonly graph: Graph;
  /** 0 for a title naming the talk, 1 for a bare marker. */
  readonly naming: number;
  readonly rank: number;
  readonly order: number;
}

const startsWith = (title: readonly string[], prefix: readonly string[]): boolean =>
  prefix.length < title.length && prefix.every((word, index) => title[index] === word);

const candidate = (talk: readonly string[], graph: Graph, order: number): Candidate | undefined => {
  const title = words(graph.title);
  if (talk.length > 0 && startsWith(title, talk)) {
    const rank = markerRank(title.slice(talk.length));
    if (rank !== undefined) return { graph, naming: 0, rank, order };
  }
  const rank = markerRank(title);
  return rank === undefined ? undefined : { graph, naming: 1, rank, order };
};

const byStrength = (a: Candidate, b: Candidate): number =>
  a.naming - b.naming || a.rank - b.rank || a.order - b.order;

/**
 * The Presentation Notes Graph for `talk` on the `shown` Map, the Graphs passed over for
 * it, and the notes `resourceId` reaches in it.
 *
 * A title naming the talk beats a bare marker; then "Presentation Notes" beats
 * "Notes", which beats "Presentation" and more; then the Map's Graph order. The
 * talk is never its own notes. Notes are ordered by their placement, top edge
 * then left edge, and by Edge order where two sit at the same point.
 */
export function presentationNotes(
  shown: Map,
  talk: Graph,
  resourceId: ResourceId,
): PresentationNotes {
  const talkWords = words(talk.title);
  const ranked = shown.graphs
    .flatMap((graph, order) =>
      graph.id === talk.id ? [] : (candidate(talkWords, graph, order) ?? []),
    )
    .sort(byStrength);
  const [chosen, ...passed] = ranked;
  if (chosen === undefined) return { graph: null, passedOver: [], notes: [] };

  const targets = [...new Set(outgoingEdges(chosen.graph, resourceId).map((edge) => edge.to))];
  // Intake refuses an Edge whose endpoint the Map does not place, so every
  // target has a position; the fallback only satisfies the index type.
  const at = (id: ResourceId) => shown.positions[id] ?? { x: 0, y: 0 };
  const notes = targets.sort((a, b) => at(a).y - at(b).y || at(a).x - at(b).x);
  return { graph: chosen.graph, passedOver: passed.map((entry) => entry.graph), notes };
}
