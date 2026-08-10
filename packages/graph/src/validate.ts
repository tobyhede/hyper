import {
  isBuiltInViewId,
  uuidSchema,
  type BuiltInViewId,
  type Card,
  type Layout,
  type Graph,
  type UUID,
} from '@project/core';

/**
 * The cards, graphs and layouts a reference check reads. Structural so it
 * accepts both a freshly parsed space file (inside `loadSpace`) and an
 * already-built `Space`. `layouts` and `defaultView` are optional: a space may
 * declare neither and open in an automatic view (ADR 0025).
 */
export interface Referenceable {
  readonly cards: readonly Card[];
  readonly graphs: readonly Graph[];
  readonly layouts?: readonly Layout[] | undefined;
  readonly defaultView?: BuiltInViewId | UUID | undefined;
}

export type SpaceReferenceErrorKind =
  | 'duplicate-card-id'
  | 'duplicate-graph-id'
  | 'duplicate-layout-id'
  | 'layout-position-unknown-card'
  | 'layout-unknown-graph'
  | 'layout-active-graph-not-shown'
  | 'unresolved-default-view'
  | 'unresolved-graph-edge'
  | 'duplicate-graph-edge'
  | 'unresolved-alias-target'
  | 'alias-self-reference'
  | 'alias-targets-alias';

/**
 * One failed cross-reference. Named for the space whose references it is about,
 * beside `CardFileError` and inside `SpaceError` — and deliberately not
 * `ReferenceError`, which is a JavaScript global that any file importing the
 * bare name would lose.
 */
export interface SpaceReferenceError {
  kind: SpaceReferenceErrorKind;
  /** The id that failed to resolve or was duplicated. */
  ref: string;
  /** Human-readable description, useful for surfacing in the UI or CLI. */
  message: string;
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

/**
 * Check every cross-reference resolves. Returns an empty array when the space is
 * internally consistent. Runs inside `loadSpace` over the freshly parsed file.
 */
export function validateReferences(space: Referenceable): SpaceReferenceError[] {
  const errors: SpaceReferenceError[] = [];

  const cardsById = new Map(space.cards.map((c) => [c.id, c]));
  const cardIds = new Set(space.cards.map((c) => c.id));

  for (const id of duplicates(space.cards.map((c) => c.id))) {
    errors.push({ kind: 'duplicate-card-id', ref: id, message: `Duplicate card id "${id}"` });
  }
  for (const id of duplicates(space.graphs.map((graph) => graph.id))) {
    errors.push({ kind: 'duplicate-graph-id', ref: id, message: `Duplicate graph id "${id}"` });
  }

  const layouts = space.layouts ?? [];
  for (const id of duplicates(layouts.map((l) => l.id))) {
    errors.push({ kind: 'duplicate-layout-id', ref: id, message: `Duplicate layout id "${id}"` });
  }

  // Positions are sparse: a layout may omit cards, and whoever renders it places
  // those itself. The asymmetry is that it may not name a card that does not
  // exist — a position left behind by a deleted card (ADR 0025).
  const graphIds = new Set(space.graphs.map((graph) => graph.id));

  for (const layout of layouts) {
    for (const key of Object.keys(layout.positions)) {
      const cardId = uuidSchema.parse(key);
      if (!cardIds.has(cardId)) {
        errors.push({
          kind: 'layout-position-unknown-card',
          ref: cardId,
          message: `Layout "${layout.id}" positions missing card "${cardId}"`,
        });
      }
    }

    // A Layout also points at graphs — which it shows, and which of those opens
    // active (ADR 0026). Both are references into the space's own graphs, and
    // the dependency runs one way: geometry references topology, never back.
    for (const graphId of layout.graphs ?? []) {
      if (!graphIds.has(graphId)) {
        errors.push({
          kind: 'layout-unknown-graph',
          ref: graphId,
          message: `Layout "${layout.id}" shows missing graph "${graphId}"`,
        });
      }
    }

    if (layout.activeGraph !== undefined) {
      if (!graphIds.has(layout.activeGraph)) {
        errors.push({
          kind: 'layout-unknown-graph',
          ref: layout.activeGraph,
          message: `Layout "${layout.id}" opens active on missing graph "${layout.activeGraph}"`,
        });
      } else if (layout.graphs && !layout.graphs.includes(layout.activeGraph)) {
        // The one check here that relates two fields rather than resolving one
        // against the space: both ids are real and it is still an error, because
        // the active graph must be one the Layout shows. Activating only ever
        // moves emphasis within the visible set, so a Layout opening active on a
        // graph it filters out has asked for a state nothing can reach. Absent a
        // filter every graph is visible and there is nothing left to check.
        errors.push({
          kind: 'layout-active-graph-not-shown',
          ref: layout.activeGraph,
          message: `Layout "${layout.id}" opens active on graph "${layout.activeGraph}", which it does not show`,
        });
      }
    }
  }

  // `defaultView` names a declared layout or a built-in automatic view, and
  // nothing else — it records which view opens, never how to compute one.
  if (space.defaultView !== undefined) {
    const declared = new Set(layouts.map((l) => l.id));
    if (!isBuiltInViewId(space.defaultView) && !declared.has(space.defaultView)) {
      errors.push({
        kind: 'unresolved-default-view',
        ref: space.defaultView,
        message: `defaultView "${space.defaultView}" names neither a declared layout nor a built-in view`,
      });
    }
  }

  for (const graph of space.graphs) {
    const firstEdgeIndex = new Map<string, number>();
    graph.edges.forEach((edge, index) => {
      for (const end of ['from', 'to'] as const) {
        if (!cardIds.has(edge[end])) {
          errors.push({
            kind: 'unresolved-graph-edge',
            ref: edge[end],
            message: `Graph "${graph.id}" edge ${index} references missing card "${edge[end]}" as its ${end}`,
          });
        }
      }

      const edgeKey = `${edge.from}\0${edge.to}`;
      const firstIndex = firstEdgeIndex.get(edgeKey);
      if (firstIndex === undefined) {
        firstEdgeIndex.set(edgeKey, index);
      } else {
        const ref = `${edge.from} → ${edge.to}`;
        errors.push({
          kind: 'duplicate-graph-edge',
          ref,
          message: `Graph "${graph.id}" repeats edge ${ref} at index ${index} (first at index ${firstIndex})`,
        });
      }
    });
  }

  for (const card of space.cards) {
    if (card.kind !== 'alias') continue;
    if (card.target === card.id) {
      errors.push({
        kind: 'alias-self-reference',
        ref: card.id,
        message: `Alias "${card.id}" points at itself`,
      });
      continue;
    }
    const target = cardsById.get(card.target);
    if (!target) {
      errors.push({
        kind: 'unresolved-alias-target',
        ref: card.target,
        message: `Alias "${card.id}" targets missing card "${card.target}"`,
      });
      continue;
    }
    if (target.kind === 'alias') {
      errors.push({
        kind: 'alias-targets-alias',
        ref: card.target,
        message: `Alias "${card.id}" targets alias "${card.target}"; aliasing is a single hop`,
      });
    }
  }

  return errors;
}
