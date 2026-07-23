import { isBuiltInViewId, type Card, type Layout, type Route } from '@project/core';

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
  | 'unresolved-route-step'
  | 'route-revisits-card'
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
    route.steps.forEach((step, index) => {
      if (!cardIds.has(step.target)) {
        errors.push({
          kind: 'unresolved-route-step',
          ref: step.target,
          message: `Route "${route.id}" step ${index} references missing card "${step.target}"`,
        });
      }
    });

    // A route may not visit the same card twice (ADR 0012). A revisit is a
    // backward edge in the spatial graph — the one thing a single route can do
    // that no left-to-right layout renders cleanly. "Return to earlier content"
    // is expressed by an alias (ADR 0009): a distinct card showing the same
    // content, which the route reaches as a forward step.
    for (const target of duplicates(route.steps.map((s) => s.target))) {
      errors.push({
        kind: 'route-revisits-card',
        ref: target,
        message: `Route "${route.id}" visits card "${target}" more than once; use an alias to return to it (ADR 0012)`,
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
