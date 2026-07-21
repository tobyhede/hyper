import { spaceFileSchema, type Card, type Route } from '@project/core';
import { validateReferences, type ReferenceError } from './validate';

/**
 * A Space: the validated, indexed top-level domain value (ADR 0010). It carries
 * the same data as the file it was loaded from, plus an index, so lookups are
 * O(1). A Space exists only as the output of {@link loadSpace}, so its
 * consistency is guaranteed by construction — nothing can hand-build an
 * unvalidated one.
 */
export interface Space {
  readonly title: string;
  readonly cards: readonly Card[];
  readonly routes: readonly Route[];
  readonly cardsById: ReadonlyMap<string, Card>;
  readonly routesById: ReadonlyMap<string, Route>;
}

/** Why a load failed: a bad shape, or a reference that does not resolve. */
export type SpaceError = { kind: 'invalid-shape'; message: string } | ReferenceError;

export type LoadSpaceResult = { ok: true; space: Space } | { ok: false; errors: SpaceError[] };

/** Parse, validate references, and index raw input into a {@link Space}. */
export function loadSpace(input: unknown): LoadSpaceResult {
  const parsed = spaceFileSchema.safeParse(input);
  if (!parsed.success) {
    const errors: SpaceError[] = parsed.error.issues.map((issue) => ({
      kind: 'invalid-shape',
      message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    }));
    return { ok: false, errors };
  }
  const file = parsed.data;
  const referenceErrors = validateReferences(file);
  if (referenceErrors.length > 0) return { ok: false, errors: referenceErrors };
  const space: Space = {
    title: file.title,
    cards: file.cards,
    routes: file.routes,
    cardsById: new Map(file.cards.map((c) => [c.id, c])),
    routesById: new Map(file.routes.map((r) => [r.id, r])),
  };
  return { ok: true, space };
}
