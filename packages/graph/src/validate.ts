import { isBuiltInViewId, type Card, type Layout, type Route, type RouteEdge } from '@project/core';

/**
 * The cards, routes and layouts a reference check reads. Structural so it
 * accepts both a freshly parsed space file (inside `loadSpace`) and an
 * already-built `Space`. `layouts` and `defaultView` are optional: a space may
 * declare neither and open in an automatic view (ADR 0013).
 */
export interface Referenceable {
  readonly cards: readonly Card[];
  readonly routes: readonly Route[];
  readonly layouts?: readonly Layout[] | undefined;
  readonly defaultView?: string | undefined;
}

export type ReferenceErrorKind =
  | 'duplicate-card-id'
  | 'duplicate-route-id'
  | 'duplicate-layout-id'
  | 'layout-position-unknown-card'
  | 'unresolved-default-view'
  | 'unresolved-route-edge'
  | 'route-has-cycle'
  | 'unresolved-alias-target'
  | 'alias-self-reference'
  | 'alias-targets-alias';

export interface ReferenceError {
  kind: ReferenceErrorKind;
  /** The id that failed to resolve or was duplicated. */
  ref: string;
  /** Human-readable description, useful for surfacing in the UI or CLI. */
  message: string;
}

/**
 * The cards on a cycle in `edges`, or `null` if there is none.
 *
 * Depth-first with three states per card — unseen, on the current path, done —
 * where an edge back to a card still on the path is what closes a loop. The
 * cards from that one down are returned, closing on themselves, so the message
 * can name the loop rather than just assert one: a route of thirty edges has
 * three that matter and the author needs to be told which.
 *
 * Iterative rather than recursive because the edges arrive from a file and a
 * long enough chain would otherwise overflow the stack on input we did not
 * write.
 */
function findCycle(edges: readonly RouteEdge[]): readonly [string, ...string[]] | null {
  const successors = new Map<string, string[]>();
  for (const edge of edges) {
    const from = successors.get(edge.from);
    if (from) from.push(edge.to);
    else successors.set(edge.from, [edge.to]);
    if (!successors.has(edge.to)) successors.set(edge.to, []);
  }

  // 1 = on the current path, 2 = fully explored. Absent = unseen.
  const state = new Map<string, 1 | 2>();

  // Every card is a candidate root, not just the first: a route need not be
  // connected, so a loop in a component nothing else reaches would otherwise
  // never be searched.
  for (const root of successors.keys()) {
    if (state.has(root)) continue;

    // The DFS stack, carrying the path itself as well as how far through each
    // card's successors we have got — so when a back edge turns up, the cards it
    // closes over are right there.
    const stack = [{ card: root, outgoing: successors.get(root) ?? [], next: 0 }];
    state.set(root, 1);

    let frame = stack[stack.length - 1];
    while (frame !== undefined) {
      const to = frame.outgoing[frame.next];
      frame.next += 1;

      if (to === undefined) {
        state.set(frame.card, 2);
        stack.pop();
      } else if (state.get(to) === 1) {
        const path = stack.map((f) => f.card);
        return [to, ...path.slice(path.indexOf(to) + 1), to];
      } else if (state.get(to) === undefined) {
        state.set(to, 1);
        stack.push({ card: to, outgoing: successors.get(to) ?? [], next: 0 });
      }

      frame = stack[stack.length - 1];
    }
  }

  return null;
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
export function validateReferences(space: Referenceable): ReferenceError[] {
  const errors: ReferenceError[] = [];

  const cardsById = new Map(space.cards.map((c) => [c.id, c]));
  const cardIds = new Set(space.cards.map((c) => c.id));

  for (const id of duplicates(space.cards.map((c) => c.id))) {
    errors.push({ kind: 'duplicate-card-id', ref: id, message: `Duplicate card id "${id}"` });
  }
  for (const id of duplicates(space.routes.map((r) => r.id))) {
    errors.push({ kind: 'duplicate-route-id', ref: id, message: `Duplicate route id "${id}"` });
  }

  const layouts = space.layouts ?? [];
  for (const id of duplicates(layouts.map((l) => l.id))) {
    errors.push({ kind: 'duplicate-layout-id', ref: id, message: `Duplicate layout id "${id}"` });
  }

  // Positions are sparse: a layout may omit cards, and whoever renders it places
  // those itself. The asymmetry is that it may not name a card that does not
  // exist — a position left behind by a deleted card (ADR 0013).
  for (const layout of layouts) {
    for (const cardId of Object.keys(layout.positions)) {
      if (!cardIds.has(cardId)) {
        errors.push({
          kind: 'layout-position-unknown-card',
          ref: cardId,
          message: `Layout "${layout.id}" positions missing card "${cardId}"`,
        });
      }
    }
  }

  // `defaultView` names a declared layout or a built-in automatic view, and
  // nothing else — it records which view opens, never how to compute one.
  if (space.defaultView !== undefined) {
    const declared = new Set(layouts.map((l) => l.id));
    if (!declared.has(space.defaultView) && !isBuiltInViewId(space.defaultView)) {
      errors.push({
        kind: 'unresolved-default-view',
        ref: space.defaultView,
        message: `defaultView "${space.defaultView}" names neither a declared layout nor a built-in view`,
      });
    }
  }

  for (const route of space.routes) {
    route.edges.forEach((edge, index) => {
      for (const end of ['from', 'to'] as const) {
        if (!cardIds.has(edge[end])) {
          errors.push({
            kind: 'unresolved-route-edge',
            ref: edge[end],
            message: `Route "${route.id}" edge ${index} references missing card "${edge[end]}" as its ${end}`,
          });
        }
      }
    });

    // A route may not close a cycle (ADR 0023). Forks and merges are expected;
    // a loop is the one shape no left-to-right layout renders cleanly, and
    // allowing it would take away the reason an alias exists. "Return to earlier
    // content" is expressed by an edge to an **alias** (ADR 0009): a distinct
    // card showing the same content, reached going forward.
    //
    // Under the step sequence this was a duplicate check and acyclicity held by
    // construction — a list cannot repeat a card. An edge list can, so the
    // guarantee moved from the representation to here.
    const cycle = findCycle(route.edges);
    if (cycle) {
      errors.push({
        kind: 'route-has-cycle',
        ref: cycle[0],
        message: `Route "${route.id}" closes a cycle: ${cycle.join(' → ')}; use an alias to return to earlier content (ADR 0023)`,
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

export function isValidGraph(space: Referenceable): boolean {
  return validateReferences(space).length === 0;
}
