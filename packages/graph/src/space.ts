import { spaceFileSchema, type Card, type Layout, type Route } from '@project/core';
import { parseCardFile, type CardFile, type CardFileError } from './card-file';
import { validateReferences, type ReferenceError } from './validate';

/**
 * A Space: the validated, indexed top-level domain value (ADR 0010). It carries
 * the same data as the file it was loaded from, plus an index, so lookups are
 * O(1). A Space exists only as the output of {@link loadSpace}, so its
 * consistency is guaranteed by construction — nothing can hand-build an
 * unvalidated one.
 */
export interface Space {
  /** What names this space (ADR 0019). Not its title, and not its file path. */
  readonly id: string;
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

/**
 * Why a load failed: a bad shape, a card file that will not parse, or a
 * reference that does not resolve.
 */
export type SpaceError =
  { kind: 'invalid-shape'; message: string } | CardFileError | ReferenceError;

export type LoadSpaceResult = { ok: true; space: Space } | { ok: false; errors: SpaceError[] };

/**
 * Parse, validate references, and index raw input into a {@link Space}.
 *
 * Takes the space file *and* the card files, because a card exists by virtue of
 * its file existing (ADR 0020) — the space file holds structure and nothing
 * else. This is one more argument, not one more capability: it does no I/O and
 * stays synchronous. Reading the bytes belongs to the caller, as it always did.
 */
export function loadSpace(input: unknown, cardFiles: readonly CardFile[]): LoadSpaceResult {
  const parsed = spaceFileSchema.safeParse(input);
  if (!parsed.success) {
    const errors: SpaceError[] = parsed.error.issues.map((issue) => ({
      kind: 'invalid-shape',
      message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    }));
    return { ok: false, errors };
  }
  const file = parsed.data;

  const cards: Card[] = [];
  const pathById = new Map<string, string>();
  const cardErrors: SpaceError[] = [];
  for (const cardFile of cardFiles) {
    const card = parseCardFile(cardFile);
    if (!card.ok) {
      cardErrors.push(...card.errors);
      continue;
    }
    // Which file you are editing must not depend on scan order, so a repeated
    // id is an error and not a silent winner. The message names both files —
    // "which two" is the only useful part of it.
    const seen = pathById.get(card.frontmatter.id);
    if (seen !== undefined) {
      cardErrors.push({
        kind: 'duplicate-card-id',
        ref: card.frontmatter.id,
        message: `Duplicate card id "${card.frontmatter.id}" in ${seen} and ${cardFile.path}`,
      });
      continue;
    }
    pathById.set(card.frontmatter.id, cardFile.path);
    cards.push({ ...card.frontmatter, body: card.body });
  }
  if (cardErrors.length > 0) return { ok: false, errors: cardErrors };

  // Array order is read only by automatic strategies, so title order is the one
  // default that is stable against renaming a file or reordering a scan.
  cards.sort((a, b) => a.title.localeCompare(b.title));

  const referenceErrors = validateReferences({ ...file, cards });
  if (referenceErrors.length > 0) return { ok: false, errors: referenceErrors };
  const layouts = file.layouts ?? [];
  const space: Space = {
    id: file.id,
    title: file.title,
    cards,
    routes: file.routes,
    layouts,
    defaultView: file.defaultView,
    cardsById: new Map(cards.map((c) => [c.id, c])),
    routesById: new Map(file.routes.map((r) => [r.id, r])),
    layoutsById: new Map(layouts.map((l) => [l.id, l])),
  };
  return { ok: true, space };
}
