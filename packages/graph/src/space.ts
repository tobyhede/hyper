import { spaceFileSchema, type Card, type Layout, type Route } from '@project/core';
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
  /**
   * The positioned layouts the author wrote, if any. Empty is the normal state
   * of a hand-authored space: automatic layouts carry no data, so they are
   * declared nowhere (ADR 0013).
   */
  readonly layouts: readonly Layout[];
  /** Which view this space opens in — a layout's id or a built-in view's. */
  readonly defaultView: string | undefined;
  readonly cardsById: ReadonlyMap<string, Card>;
  readonly routesById: ReadonlyMap<string, Route>;
  readonly layoutsById: ReadonlyMap<string, Layout>;
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
  const layouts = file.layouts ?? [];
  const space: Space = {
    title: file.title,
    cards: file.cards,
    routes: file.routes,
    layouts,
    defaultView: file.defaultView,
    cardsById: new Map(file.cards.map((c) => [c.id, c])),
    routesById: new Map(file.routes.map((r) => [r.id, r])),
    layoutsById: new Map(layouts.map((l) => [l.id, l])),
  };
  return { ok: true, space };
}
