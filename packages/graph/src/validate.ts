import type { Card, Route } from '@project/core';

/**
 * The cards and routes a reference check reads. Structural so it accepts both a
 * freshly parsed space file (inside `loadSpace`) and an already-built `Space`.
 */
export interface Referenceable {
  readonly cards: readonly Card[];
  readonly routes: readonly Route[];
}

export type ReferenceErrorKind =
  | 'duplicate-card-id'
  | 'duplicate-route-id'
  | 'unresolved-route-step'
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
