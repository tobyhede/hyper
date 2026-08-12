import {
  SPACE_FILE_VERSION,
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
  /**
   * Every graph in the space, **flattened** across the layouts that own them —
   * layouts in declared order, each layout's graphs in authored order (ADR
   * 0045). Derived, never stored: a graph is an owned value of one layout (ADR
   * 0040), and this is the collection a view whose subject is the space's cards
   * draws. Closed for free, since every edge endpoint is a card of some layout
   * and so a card of the space.
   */
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
  /**
   * Which layout owns each graph — what the flatten above loses. Total over
   * `graphs`, and unambiguous because a repeated graph id is a load error: the
   * id is unique across the space although ownership is layout-scoped (ADR
   * 0045).
   */
  readonly layoutByGraphId: ReadonlyMap<GraphId, Layout>;
}

/** What a document declaring a version this build does not read earns. */
export type UnsupportedVersionError = { kind: 'unsupported-version'; message: string };

/**
 * Why a load failed: a bad shape, a card file that will not parse, or a
 * reference that does not resolve.
 */
export type SpaceError =
  | { kind: 'invalid-shape'; message: string }
  | UnsupportedVersionError
  | { kind: 'retired-space-graphs'; message: string }
  | CardFileError
  | SpaceReferenceError;

/**
 * The one error a document of the wrong version earns, or `null` to let the
 * ordinary shape check speak.
 *
 * Read before parsing, because a version 2 document does not fail *once* under
 * version 1 — its layouts each lack the graphs they now own, so the shape check
 * answers a cascade in which nothing says which version arrived. A version this
 * cannot read at all (absent, not a number) is left to the shape check, whose
 * message for it is already the right one.
 *
 * Offered rather than private, because it is *the* answer to which version this
 * build reads and a second one would drift from it. Every door a document
 * arrives by asks here: domain intake below, and the file importer, which parses
 * against schemas that run ahead of intake and would otherwise answer that
 * cascade to the one reader hand-authoring the document (ADR 0030).
 */
export function unsupportedDocumentVersion(document: unknown): UnsupportedVersionError | null {
  if (typeof document !== 'object' || document === null) return null;
  const declared: unknown = (document as { version?: unknown }).version;
  if (typeof declared !== 'number' || declared === SPACE_FILE_VERSION) return null;
  return {
    kind: 'unsupported-version',
    message: `Space document version ${declared} is not supported; this build reads version ${SPACE_FILE_VERSION}`,
  };
}

/**
 * The one error a document carrying the retired space-level `graphs` earns, or
 * `null` when it does not carry one.
 *
 * Read before parsing, beside {@link unsupportedDocumentVersion}, because
 * `spaceFileSchema` is a plain object and Zod *strips* a key it does not
 * declare. That is the right answer for the retired `cards` and `edges` keys:
 * they carried nothing the rest of the document does not already say — a card
 * exists because its file does, an edge because a graph holds it — so dropping
 * them loses nothing. A space-level `graphs` carried the whole topology (ADR
 * 0040), so stripping it in silence discards exactly what its author wrote and
 * yields a space that loads looking complete.
 *
 * Here rather than declared in the schema, and not by making the schema
 * `.strict()`. Strict would reject `cards` and `edges` too, taking that
 * deliberate leniency with it. Declaring the key — as `z.never()` or
 * `z.undefined()` — puts it in the inferred document type, and Hono maps an
 * always-undefined property to `never` when it infers the JSON response, so the
 * RPC contract stops matching the schema it is checked against
 * (`space-http-app-types.test.ts`). The pre-parse hook has neither cost, and it
 * is already where the version answer lives.
 *
 * A version 2 document is answered by its version before this is reached; what
 * this catches is a version 1 document, hand-edited or written by a stale
 * producer, that carries both shapes at once.
 */
function retiredSpaceGraphs(document: unknown): SpaceError | null {
  if (typeof document !== 'object' || document === null) return null;
  if (!('graphs' in document)) return null;
  return {
    kind: 'retired-space-graphs',
    message:
      'This document carries a space-level `graphs` array, which is retired: a Layout owns the Graphs it draws (ADR 0040)',
  };
}

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
  const wrongVersion = unsupportedDocumentVersion(input);
  if (wrongVersion !== null) return { ok: false, errors: [wrongVersion] };
  const retired = retiredSpaceGraphs(input);
  if (retired !== null) return { ok: false, errors: [retired] };

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
    layouts: file.layouts,
    defaultView: file.defaultView,
  });
}

/** Validate and index a fully identified persistence aggregate. */
export function loadSpaceSnapshot(input: unknown): LoadSpaceSnapshotResult {
  const storedDocument =
    typeof input === 'object' && input !== null ? (input as { document?: unknown }).document : null;
  const wrongVersion = unsupportedDocumentVersion(storedDocument);
  if (wrongVersion !== null) return { ok: false, errors: [wrongVersion] };
  const retired = retiredSpaceGraphs(storedDocument);
  if (retired !== null) return { ok: false, errors: [retired] };

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
    layouts: document.layouts,
    defaultView: document.defaultView,
  });
  return loaded.ok ? { ...loaded, snapshot: parsed.data } : loaded;
}

function buildSpace(input: {
  id: UUID;
  title: string;
  cards: Card[];
  layouts: Layout[] | undefined;
  defaultView: BuiltInViewId | UUID | undefined;
}): LoadSpaceResult {
  // Array order is read only by automatic strategies, so title order is the one
  // default stable across filesystem scans and unordered relational reads. Ties
  // break on id, making the order total rather than dependent on input order.
  const cards = [...input.cards].sort(
    (left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
  );
  const layouts = input.layouts ?? [];
  const referenceErrors = validateReferences({ ...input, cards, layouts });
  if (referenceErrors.length > 0) return { ok: false, errors: referenceErrors };

  // The flatten: layouts in declared order, each layout's owned graphs in
  // authored order. Derived and never stored (ADR 0045) — it exists so the
  // readers that key colour, handles, render edge ids and activation on a graph
  // id alone keep reading one collection while ownership sits on the layout.
  // The reference check above has already refused a repeated id, so `new Map`
  // here can drop nothing.
  const graphs = layouts.flatMap((layout) => layout.graphs);
  const space: Space = {
    id: input.id,
    title: input.title,
    cards,
    graphs,
    layouts,
    defaultView: input.defaultView,
    cardsById: new Map(cards.map((card) => [card.id, card])),
    graphsById: new Map(graphs.map((graph) => [graph.id, graph])),
    layoutsById: new Map(layouts.map((l) => [l.id, l])),
    layoutByGraphId: new Map(
      layouts.flatMap((layout) =>
        layout.graphs.map((graph): [GraphId, Layout] => [graph.id, layout]),
      ),
    ),
  };
  return { ok: true, space };
}
