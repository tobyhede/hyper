import {
  isBuiltInViewId,
  uuidSchema,
  type BuiltInViewId,
  type Card,
  type Layout,
  type UUID,
} from '@project/core';

/**
 * The cards and layouts a reference check reads. Structural so it accepts both
 * a freshly parsed space file (inside `loadSpace`) and an already-built
 * `Space`. `layouts` and `defaultView` are optional: a space may declare
 * neither and open in an automatic view (ADR 0025).
 *
 * There is no `graphs` here, and that is the whole of ADR 0040 in one shape: a
 * graph is reached through the layout that owns it, so a check written over a
 * space-level collection could not ask the question that now matters — whether
 * an edge endpoint is a card of *that* layout.
 */
export interface Referenceable {
  readonly cards: readonly Card[];
  readonly layouts?: readonly Layout[] | undefined;
  readonly defaultView?: BuiltInViewId | UUID | undefined;
}

export type SpaceReferenceErrorKind =
  | 'duplicate-card-id'
  | 'duplicate-graph-id'
  | 'duplicate-layout-id'
  | 'layout-member-missing-card'
  | 'layout-unknown-graph'
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

  const layouts = space.layouts ?? [];
  for (const id of duplicates(layouts.map((l) => l.id))) {
    errors.push({ kind: 'duplicate-layout-id', ref: id, message: `Duplicate layout id "${id}"` });
  }

  // A graph id is unique across the **space**, although one layout owns it
  // (ADR 0045). The flatten a space-subject view draws keys colour, handle ids
  // (`<graphId>::out`/`::in`) and activation on the id alone, and `graphsById`
  // is a `new Map` that would drop one of a pair in silence while both stayed
  // in the collection. The message names both owners, because "which two" is
  // the only part of it an author can act on.
  const ownerByGraphId = new Map<string, Layout>();
  for (const layout of layouts) {
    for (const graph of layout.graphs) {
      const owner = ownerByGraphId.get(graph.id);
      if (owner === undefined) {
        ownerByGraphId.set(graph.id, layout);
        continue;
      }
      errors.push({
        kind: 'duplicate-graph-id',
        ref: graph.id,
        // Naming one layout twice would send an author looking for a second
        // owner that does not exist, so the same-owner repeat says so instead.
        // Both are the same fault — an id that is not unique across the space —
        // and the fix differs only in where to look.
        message:
          owner.id === layout.id
            ? `Duplicate graph id "${graph.id}" twice in layout "${layout.id}"`
            : `Duplicate graph id "${graph.id}" in layouts "${owner.id}" and "${layout.id}"`,
      });
    }
  }

  for (const layout of layouts) {
    // A layout's position keys **are** its card membership (ADR 0040). They may
    // omit cards — a card the map leaves out is simply not in this layout — but
    // may not name a card that does not exist, a position left behind by a
    // deleted card (ADR 0025).
    const members = new Set<string>();
    for (const key of Object.keys(layout.positions)) {
      const cardId = uuidSchema.parse(key);
      members.add(cardId);
      if (!cardIds.has(cardId)) {
        errors.push({
          kind: 'layout-member-missing-card',
          ref: cardId,
          message: `Layout "${layout.id}" positions missing card "${cardId}"`,
        });
      }
    }

    // Every edge endpoint of an owned graph names a card **in that layout**.
    // One rule, no kinds and no conditions: membership is the whole of it, and
    // an endpoint naming no card at all fails it for the same reason as one
    // naming a card another layout holds.
    for (const graph of layout.graphs) {
      const firstEdgeIndex = new Map<string, number>();
      graph.edges.forEach((edge, index) => {
        for (const end of ['from', 'to'] as const) {
          if (!members.has(edge[end])) {
            errors.push({
              kind: 'unresolved-graph-edge',
              ref: edge[end],
              message: `Graph "${graph.id}" edge ${index} names "${edge[end]}" as its ${end}, which is not a card of its layout "${layout.id}"`,
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

    // A layout also points at one graph — the one that opens active (ADR 0026)
    // — and now it must be one the layout **owns**. Naming a graph a second
    // layout holds is the failure the space-wide check could not see.
    if (
      layout.activeGraph !== undefined &&
      !layout.graphs.some((g) => g.id === layout.activeGraph)
    ) {
      errors.push({
        kind: 'layout-unknown-graph',
        ref: layout.activeGraph,
        message: `Layout "${layout.id}" opens active on graph "${layout.activeGraph}", which it does not own`,
      });
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
