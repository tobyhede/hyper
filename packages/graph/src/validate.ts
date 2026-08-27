import { isComputedViewId, uuidSchema, type Card, type Layout, type UUID } from '@project/core';
import { repeatedGraphEdges } from './graph-edges';

/**
 * The cards and layouts a reference check reads. Structural so it accepts both
 * a freshly parsed space file (inside `loadSpace`) and an already-built
 * `Space`. `layouts` and `defaultRenderer` are optional: a space may declare
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
  readonly defaultRenderer?: UUID | undefined;
}

/**
 * Why a Space failed its reference check.
 *
 * The membership kinds name **ownership**, which is the era the aggregate is in
 * (ADR 0040): a Layout's position keys are its Card membership, and every Edge
 * of an owned Graph is closed over exactly that set. Where the superseded
 * vocabulary had one kind for "does not resolve", there are now two — the Card
 * or Graph does not exist at all, or it exists and belongs somewhere else. They
 * are different mistakes and lead an author to different places, which is the
 * whole reason for the split.
 */
export type SpaceReferenceErrorKind =
  | 'duplicate-card-id'
  | 'duplicate-graph-id'
  | 'duplicate-layout-id'
  | 'space-view-id-collision'
  /** A Layout's position names a Card the Space does not hold. */
  | 'layout-member-missing-card'
  /** A Layout opens active on a Graph no Layout in the Space owns. */
  | 'layout-active-graph-missing'
  /** A Layout opens active on a Graph another Layout owns. */
  | 'layout-active-graph-outside-layout'
  /** An Edge endpoint names a Card the Space does not hold. */
  | 'graph-edge-missing-card'
  /** An Edge endpoint names a Space Card that is not a member of its own Layout. */
  | 'graph-edge-card-outside-layout'
  | 'unresolved-default-renderer'
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

/** Where one occurrence of a graph id sits: the layout owning it, and its index there. */
interface GraphOccurrence {
  readonly layout: Layout;
  readonly index: number;
}

/**
 * Check every cross-reference resolves. Returns an empty array when the space is
 * internally consistent. Runs inside `loadSpace` over the freshly parsed file.
 *
 * **One failed reference earns one diagnosis.** Independent faults accumulate —
 * an author fixing a space wants all of them — but a single bad reference never
 * cascades into several kinds saying the same thing from different angles.
 * That is why the endpoint and Active Graph checks below each choose between two
 * kinds rather than reporting both, and why a repeated graph id is one error
 * naming every occurrence rather than one error per occurrence after the first.
 *
 * Output is deterministic for the same input, and repeated facts keep authored
 * encounter order. The order of the category passes themselves carries no
 * meaning: read `kind` and `ref`, not position.
 */
export function validateReferences(space: Referenceable): SpaceReferenceError[] {
  const errors: SpaceReferenceError[] = [];

  const cardById = new Map(space.cards.map((c) => [c.id, c]));
  const cardIds = new Set(space.cards.map((c) => c.id));

  for (const id of duplicates(space.cards.map((c) => c.id))) {
    errors.push({ kind: 'duplicate-card-id', ref: id, message: `Duplicate card id "${id}"` });
  }

  const layouts = space.layouts ?? [];
  for (const id of duplicates(layouts.map((l) => l.id))) {
    errors.push({ kind: 'duplicate-layout-id', ref: id, message: `Duplicate layout id "${id}"` });
  }

  for (const layout of layouts) {
    if (!isComputedViewId(layout.id)) continue;
    errors.push({
      kind: 'space-view-id-collision',
      ref: layout.id,
      message: `Layout "${layout.id}" collides with an available Computed View`,
    });
  }

  // A graph id is unique across the **space**, although one layout owns it
  // (ADR 0045). The flatten a space-subject view draws keys colour, handle ids
  // (`<graphId>::out`/`::in`) and activation on the id alone, and the lookup
  // intake builds would drop one of a pair in silence while both stayed in the
  // collection.
  //
  // Every occurrence is collected before anything is reported, because the fault
  // is the *id*, not its second appearance: an id used four times is one thing
  // wrong with the document, and the message that helps an author is the list of
  // where to look. Same-layout repeats and cross-layout ones are the same kind
  // for the same reason — they differ only in where the fix goes.
  const occurrencesByGraphId = new Map<string, GraphOccurrence[]>();
  for (const layout of layouts) {
    layout.graphs.forEach((graph, index) => {
      const occurrences = occurrencesByGraphId.get(graph.id);
      if (occurrences === undefined) occurrencesByGraphId.set(graph.id, [{ layout, index }]);
      else occurrences.push({ layout, index });
    });
  }
  for (const [graphId, occurrences] of occurrencesByGraphId) {
    if (occurrences.length < 2) continue;
    const where = occurrences
      .map(({ layout, index }) => `layout "${layout.id}" graph ${index}`)
      .join(', ');
    errors.push({
      kind: 'duplicate-graph-id',
      ref: graphId,
      message: `Duplicate graph id "${graphId}" at ${where}`,
    });
  }

  for (const layout of layouts) {
    // A layout's position keys **are** its card membership (ADR 0040). They may
    // omit cards — a card the map leaves out is simply not in this layout — but
    // may not name a card that does not exist, a position left behind by a
    // deleted card (ADR 0025).
    //
    // A key naming a missing card still joins `members`, which is what keeps
    // this the *only* thing said about it: an edge into that card is then a
    // consequence of this fault rather than a second one.
    const members = new Set<string>();
    for (const key of Object.keys(layout.positions)) {
      const cardId = uuidSchema.parse(key);
      members.add(cardId);
      if (!cardIds.has(cardId)) {
        errors.push({
          kind: 'layout-member-missing-card',
          ref: cardId,
          message: `Layout "${layout.id}" holds a position for card "${cardId}", which the space does not hold`,
        });
      }
    }

    // Every edge endpoint of an owned graph names a card **in that layout** —
    // one rule, and the two kinds below are two readings of failing it rather
    // than two rules. An endpoint naming no card at all is a dangling reference;
    // one naming a card another layout holds is a closure failure, and telling
    // an author which they have is the difference between hunting for a deleted
    // card and adding a member.
    for (const graph of layout.graphs) {
      // Asked once, up front, and read inside the loop below so a graph's
      // diagnostics still arrive in edge order rather than in two passes.
      const repeats = repeatedGraphEdges(graph.edges);
      graph.edges.forEach((edge, index) => {
        for (const end of ['from', 'to'] as const) {
          if (members.has(edge[end])) continue;
          errors.push(
            cardIds.has(edge[end])
              ? {
                  kind: 'graph-edge-card-outside-layout',
                  ref: edge[end],
                  message: `Graph "${graph.id}" edge ${index} names "${edge[end]}" as its ${end}, which is a card of the space but not a member of its layout "${layout.id}"`,
                }
              : {
                  kind: 'graph-edge-missing-card',
                  ref: edge[end],
                  message: `Graph "${graph.id}" edge ${index} names "${edge[end]}" as its ${end}, which the space does not hold`,
                },
          );
        }

        const firstIndex = repeats.get(index);
        if (firstIndex !== undefined) {
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
    // — and it must be one the layout **owns**. Split the same way the endpoints
    // above are: a graph nothing in the space owns is missing, while one a
    // second layout owns exists and is simply not this layout's to open on.
    const activeGraph = layout.activeGraph;
    if (activeGraph !== undefined && !layout.graphs.some((g) => g.id === activeGraph)) {
      errors.push(
        occurrencesByGraphId.has(activeGraph)
          ? {
              kind: 'layout-active-graph-outside-layout',
              ref: activeGraph,
              message: `Layout "${layout.id}" opens active on graph "${activeGraph}", which another layout owns`,
            }
          : {
              kind: 'layout-active-graph-missing',
              ref: activeGraph,
              message: `Layout "${layout.id}" opens active on graph "${activeGraph}", which no layout in the space owns`,
            },
      );
    }
  }

  // `defaultRenderer` names a declared layout or a built-in automatic view, and
  // nothing else — it records which view opens, never how to compute one.
  if (space.defaultRenderer !== undefined) {
    const declared = new Set(layouts.map((l) => l.id));
    if (!isComputedViewId(space.defaultRenderer) && !declared.has(space.defaultRenderer)) {
      errors.push({
        kind: 'unresolved-default-renderer',
        ref: space.defaultRenderer,
        message: `defaultRenderer "${space.defaultRenderer}" names neither a declared Layout nor an available Computed View`,
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
    const target = cardById.get(card.target);
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
