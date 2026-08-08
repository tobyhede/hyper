import {
  spaceFileSchema,
  spaceSnapshotSchema,
  type Card,
  type BuiltInViewId,
  type CardId,
  type Layout,
  type Graph,
  type GraphId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { parseCardFile, type CardFile, type CardFileError } from './card-file';
import { validateReferences, type SpaceReferenceError } from './validate';

/**
 * A Space: the validated, indexed top-level domain value (ADR 0010). It carries
 * the same data as the file it was loaded from, plus an index, so lookups are
 * O(1). A Space exists only as the output of {@link loadSpace}, so its
 * consistency is guaranteed by construction — nothing can hand-build an
 * unvalidated one.
 */
export interface Space {
  /** What names this space (ADR 0019). Not its title, and not its file path. */
  readonly id: UUID;
  readonly title: string;
  readonly cards: readonly Card[];
  readonly graphs: readonly Graph[];
  /**
   * The positioned layouts the author wrote, if any. Empty is the normal state
   * of a hand-authored space: automatic layouts carry no data, so they are
   * declared nowhere (ADR 0025).
   */
  readonly layouts: readonly Layout[];
  /** Which view this space opens in — a layout's id or a built-in view's. */
  readonly defaultView: BuiltInViewId | UUID | undefined;
  readonly cardsById: ReadonlyMap<CardId, Card>;
  readonly graphsById: ReadonlyMap<GraphId, Graph>;
  readonly layoutsById: ReadonlyMap<UUID, Layout>;
}

/**
 * Why a load failed: a bad shape, a card file that will not parse, or a
 * reference that does not resolve.
 */
export type SpaceError =
  { kind: 'invalid-shape'; message: string } | CardFileError | SpaceReferenceError;

export type LoadSpaceResult = { ok: true; space: Space } | { ok: false; errors: SpaceError[] };

export type LoadSpaceSnapshotResult =
  { ok: true; space: Space; snapshot: SpaceSnapshot } | { ok: false; errors: SpaceError[] };

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
    const parsedCard = parseCardFile(cardFile);
    if (!parsedCard.ok) {
      cardErrors.push(...parsedCard.errors);
      continue;
    }
    // Which file you are editing must not depend on scan order, so a repeated
    // id is an error and not a silent winner. The message names both files —
    // "which two" is the only useful part of it.
    const seen = pathById.get(parsedCard.card.id);
    if (seen !== undefined) {
      cardErrors.push({
        kind: 'duplicate-card-id',
        ref: parsedCard.card.id,
        message: `Duplicate card id "${parsedCard.card.id}" in ${seen} and ${cardFile.path}`,
      });
      continue;
    }
    pathById.set(parsedCard.card.id, cardFile.path);
    cards.push(parsedCard.card);
  }
  if (cardErrors.length > 0) return { ok: false, errors: cardErrors };

  return buildSpace({
    id: file.id,
    title: file.title,
    cards,
    graphs: file.graphs,
    layouts: file.layouts,
    defaultView: file.defaultView,
  });
}

/** Validate and index a fully identified persistence aggregate. */
export function loadSpaceSnapshot(input: unknown): LoadSpaceSnapshotResult {
  const parsed = spaceSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        kind: 'invalid-shape',
        message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      })),
    };
  }

  const { id, document, cards: storedCards } = parsed.data;
  const cards = storedCards.map(({ id: cardId, document: cardDocument }) => ({
    id: cardId,
    ...cardDocument,
  })) as Card[];
  const loaded = buildSpace({
    id,
    title: document.title,
    cards,
    graphs: document.graphs,
    layouts: document.layouts,
    defaultView: document.defaultView,
  });
  return loaded.ok ? { ...loaded, snapshot: parsed.data } : loaded;
}

function buildSpace(input: {
  id: UUID;
  title: string;
  cards: Card[];
  graphs: Graph[];
  layouts: Layout[] | undefined;
  defaultView: BuiltInViewId | UUID | undefined;
}): LoadSpaceResult {
  // Array order is read only by automatic strategies, so title order is the one
  // default stable across filesystem scans and unordered relational reads. Ties
  // break on id, making the order total rather than dependent on input order.
  const cards = [...input.cards].sort(
    (left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
  );
  const referenceErrors = validateReferences({ ...input, cards });
  if (referenceErrors.length > 0) return { ok: false, errors: referenceErrors };
  const layouts = input.layouts ?? [];
  const space: Space = {
    id: input.id,
    title: input.title,
    cards,
    graphs: input.graphs,
    layouts,
    defaultView: input.defaultView,
    cardsById: new Map(cards.map((card) => [card.id, card])),
    graphsById: new Map(input.graphs.map((r) => [r.id, r])),
    layoutsById: new Map(layouts.map((l) => [l.id, l])),
  };
  return { ok: true, space };
}
