import {
  SPACE_FILE_VERSION,
  type ThingId,
  type Graph,
  type GraphId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot, Placement, type Space } from '@project/graph';

/**
 * Read a working snapshot as the validated aggregate, revalidating only when
 * handed a different one.
 *
 * Domain intake parses and reindexes the whole Space, and the runtime reads it
 * on paths that run per render — `navigation.moves()` is called during every
 * App render, including the per-pointer-frame renders a drag produces. Caching
 * on the snapshot's identity restores what the store used to give for free by
 * holding an installed `Space`, and is sound because a session publishes a
 * fresh `working` clone on a new state object rather than mutating one.
 *
 * The snapshot is an argument rather than something the reader fetches, so each
 * caller says which one it means: the render path reads the snapshot React is
 * rendering, and Navigation reads the session's live one. Sharing one reader
 * then gives both the same `Space` identity, which is what lets the render path
 * memoize on it.
 *
 * A failure is never cached: the reader keeps the last good pair untouched and
 * throws again on the next read, so an invalid snapshot cannot leave a stale
 * Space answering as the current one.
 */
export const createWorkingSpaceReader = (): ((snapshot: SpaceSnapshot) => Space) => {
  let validated: { snapshot: SpaceSnapshot; space: Space } | null = null;
  return (snapshot) => {
    if (validated !== null && validated.snapshot === snapshot) return validated.space;
    const loaded = loadSpaceSnapshot(snapshot);
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('; '));
    validated = { snapshot, space: loaded.space };
    return loaded.space;
  };
};

/**
 * Convert the validated runtime aggregate into the complete persistence seam.
 *
 * `space.graphs` is deliberately not written: it is a *derived* flatten across
 * the diagrams that own them (ADR 0040, ADR 0045), and the document has no
 * space-level collection for it to go back into. Every graph reaches the wire
 * inside the diagram that owns it, which `space.diagrams` already carries.
 */
export const snapshotFromSpace = (space: Space): SpaceSnapshot => {
  const document: SpaceSnapshot['document'] = {
    version: SPACE_FILE_VERSION,
    title: space.title,
  };
  if (space.diagrams.length > 0) document.diagrams = [...space.diagrams];
  if (space.defaultDiagram !== undefined) document.defaultDiagram = space.defaultDiagram;
  return {
    id: space.id,
    document,
    things: space.things.map(({ id, ...rest }) => ({
      id,
      document: rest,
    })),
  };
};

/**
 * The graphs a Thing has left, with every Edge incident to it gone.
 *
 * A Thing that is not a member of a Diagram cannot be an endpoint of a Graph that
 * Diagram owns (ADR 0040), so this is what both removals owe: Remove from
 * Diagram, which applies it to the one Diagram the Edit writes, and Delete Thing
 * from Space, which applies it to every Diagram through
 * {@link withThingRemovedFromDiagrams}. One rule, in one place, so the two
 * scopes of the same deletion cannot come to disagree about what an incident
 * Edge is. The graphs themselves stay, empty ones included: deleting a graph is
 * its own action.
 */
export const withoutIncidentEdges = (graphs: readonly Graph[], thingId: ThingId): Graph[] =>
  graphs.map((graph) => ({
    ...graph,
    edges: graph.edges.filter((edge) => edge.from !== thingId && edge.to !== thingId),
  }));

/**
 * The snapshot with one Thing gone from every Diagram: its membership, its
 * position and every Edge incident to it, in every Graph every Diagram owns.
 *
 * The cascade half of Delete Thing from Space, and the one write in this module
 * that is not about a single Diagram — which is exactly why it is here rather
 * than folded into {@link updatePositionedDiagram}. The Thing itself stays in
 * `things`: this answers what the Diagrams hold, and removing the Thing is the
 * caller's own statement in the same Edit. Empty Graphs and empty Diagrams
 * remain, because deleting a Thing is not an instruction to delete either
 * (ADR 0040).
 *
 * Every Diagram that held the Thing **Open** also gets the room it was holding
 * back, through the same `Placement.reclaim` the single-Diagram removal uses.
 * Under the derivation ADR 0084 removed, dropping the entry dropped its
 * displacement with it and this could be a filter; now the room lives in the
 * neighbours' own stored coordinates, so a Diagram the Edit is not drawing would
 * otherwise keep it forever — with no Thing left on that canvas to Close and no
 * Edit that could give it back. Open/Closed is Diagram-owned (ADR 0064), so
 * whether there is any room to reclaim is asked of each Diagram separately and
 * is not what the drawing one answered.
 *
 * Answers the snapshot it was given when no Diagram held the Thing, so a deletion
 * that only ever affected the current Diagram — which the caller writes
 * separately — does not rebuild every other Diagram to say nothing about them.
 */
export const withThingRemovedFromDiagrams = (
  base: SpaceSnapshot,
  thingId: ThingId,
): SpaceSnapshot => {
  const diagrams = base.document.diagrams ?? [];
  const affected = diagrams.some(
    (diagram) =>
      Object.hasOwn(diagram.positions, thingId) ||
      diagram.graphs.some((graph) =>
        graph.edges.some((edge) => edge.from === thingId || edge.to === thingId),
      ),
  );
  if (!affected) return base;
  return {
    ...base,
    document: {
      ...base.document,
      diagrams: diagrams.map((diagram) => ({
        ...diagram,
        positions: Placement.toPositions(
          Placement.remove(Placement.reclaim(Placement.fromDiagram(diagram), thingId), thingId),
        ),
        graphs: withoutIncidentEdges(diagram.graphs, thingId),
      })),
    },
  };
};

/** Everything a completed Edit writes into one Diagram. */
export interface PositionedDiagramEdit {
  readonly diagramId: UUID;
  readonly title: string;
  readonly positions: Placement;
  /**
   * The graphs this Diagram owns after the Edit, in author order (ADR 0040).
   *
   * Replaced whole rather than merged, for the same reason the positions are:
   * the editor holds the whole truth of them. A graph is a nested owned value
   * of exactly one Diagram, so there is nowhere else for this Edit's graphs to
   * be written and nothing at the space level left to reconcile them with.
   */
  readonly graphs: readonly Graph[];
  /** The Graph the Diagram opens on. */
  readonly activeGraphId: GraphId | null;
}

/** Fold a completed placement edit into a complete authoritative snapshot. */
export const updatePositionedDiagram = (
  base: SpaceSnapshot,
  { diagramId, title, positions, graphs, activeGraphId }: PositionedDiagramEdit,
): SpaceSnapshot => {
  const existing = (base.document.diagrams ?? []).find((diagram) => diagram.id === diagramId);
  const diagram = {
    id: diagramId,
    title,
    kind: 'positioned' as const,
    positions: Placement.toPositions(positions),
    graphs: [...graphs],
    // An Edit with no active Graph says nothing about the authored one, so the
    // existing value carries through. Only a named Graph replaces it.
    ...(activeGraphId !== null
      ? { activeGraph: activeGraphId }
      : existing?.activeGraph !== undefined
        ? { activeGraph: existing.activeGraph }
        : {}),
  };
  const diagrams = [...(base.document.diagrams ?? [])];
  const existingIndex = diagrams.findIndex((candidate) => candidate.id === diagramId);
  if (existingIndex === -1) diagrams.push(diagram);
  else diagrams[existingIndex] = diagram;
  return {
    ...base,
    document: {
      ...base.document,
      diagrams,
      defaultDiagram: diagramId,
    },
  };
};
