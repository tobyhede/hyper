import {
  SPACE_FILE_VERSION,
  spaceFileSchema,
  spaceSnapshotSchema,
  type Card,
  type Layout,
  type Graph,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { parseCardFile, type CardFile, type CardFileError } from './card-file';
import { buildSpaceLookup, type SpaceLookup } from './lookup';
import { validateReferences, type SpaceReferenceError } from './validate';

/** The intake brand's carrier. See {@link Space} for what it means. */
declare const SPACE_INTAKE: unique symbol;

/**
 * A Space: the validated, indexed top-level domain value (ADR 0010). It carries
 * the same data as the file it was loaded from, plus a lookup, so resolution is
 * O(1). A Space exists only as the output of {@link loadSpace} or
 * {@link loadSpaceSnapshot}, so its consistency is guaranteed by construction.
 *
 * **The brand is what makes that a guarantee rather than a convention.** It is
 * a private unique symbol, so nothing outside this module can write an object
 * literal that typechecks as a Space — a value that only looks like one has not
 * been through the reference check, and the type now says so. It is
 * compiler-only: no such property exists at runtime, and nothing may start
 * reading one.
 *
 * `lookup` is an ordinary enumerable runtime property, and deliberately so. A
 * Space is a runtime value and never the persistence representation — what gets
 * stored is projected back to a `SpaceSnapshot`, which names the fields it wants
 * rather than serializing this.
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
   *
   * The exact nested values, never copies: a graph read off here and one read
   * through `lookup.graph` are the same object.
   */
  readonly graphs: readonly Graph[];
  /**
   * The positioned layouts the author wrote, if any. Empty is the normal state
   * of a hand-authored space: automatic layouts carry no data, so they are
   * declared nowhere (ADR 0025).
   */
  readonly layouts: readonly Layout[];
  /** Which Layout this Space opens in — one UUID namespace for both variants. */
  readonly defaultLayout: UUID | undefined;
  /**
   * Contextual entity resolution — the only one. The Maps behind it are closed
   * over and appear nowhere on this value, so no caller can index the space a
   * second way or hold a collection that disagrees with this one.
   */
  readonly lookup: SpaceLookup;
  readonly [SPACE_INTAKE]: true;
}

/** What a document declaring a version this build does not read earns. */
type UnsupportedVersionError = { kind: 'unsupported-version'; message: string };

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
 * It is *the* answer to which version this build reads, and a second one would
 * drift from it — which is why every door asks it through {@link documentRefusal}
 * rather than deciding a version of its own.
 */
function unsupportedDocumentVersion(document: unknown): UnsupportedVersionError | null {
  if (typeof document !== 'object' || document === null) return null;
  // SAFETY: the guard above narrows `document` to a non-null object, and every
  // object may or may not carry a `version` key — reading it through this
  // optional-property shape stays `unknown` either way, so nothing is assumed
  // about what `version` actually is; the `typeof` check right below narrows it.
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
 * `spaceFileSchema` is strict, so an undeclared key is already refused rather
 * than stripped. This survives it to *name* the one that matters. A space-level
 * `graphs` carried the whole topology (ADR 0040), and a reader told only that
 * some key is undeclared has to work out which and why; a version 1 document
 * carrying both shapes at once is the case worth a sentence of its own.
 *
 * Here rather than declared in the schema. Declaring the key — as `z.never()`
 * or `z.undefined()` — puts it in the inferred document type, and Hono maps an
 * always-undefined property to `never` when it infers the JSON response, so the
 * RPC contract stops matching the schema it is checked against
 * (`space-http-app-types.test.ts`). The pre-parse hook has no such cost, and it
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

/**
 * The one error a document earns *before* its shape is parsed, or `null` to let
 * the ordinary shape check speak. Version first, so a version 2 document is
 * answered by its version rather than by the shape it happens to carry.
 *
 * **Offered, and composed rather than named one at a time — that composition is
 * the point.** Both checks above exist because the schema's own answer for these
 * documents misleads: a cascade of moved keys in one case, a silently stripped
 * topology in the other. Any door that parses ahead of intake needs *all* of
 * them, and a door that reaches for them individually gets the ones its author
 * knew about. `readSingleSpace` asked the version check alone and imported a
 * Space with its whole `graphs` array dropped, looking complete (ticket `10`);
 * ticket `08` is where it came to ask the version check at all. One function is
 * what makes the next check added here reach the importer without anyone
 * remembering to carry it there.
 *
 * **This docblock is where that argument is written out** — the index clause,
 * the importer and both tickets point here rather than restating it.
 *
 * Three doors ask it: the two intakes below, and `readSingleSpace`, which parses
 * against import schemas that run ahead of intake (ADR 0030). The snapshot
 * decoders do not — they parse `spaceSnapshotSchema` first, so they refuse a
 * version 2 snapshot by cascade rather than by name. Deliberate, not an
 * oversight: there are no version 2 documents, and a directory is the only one a
 * human writes by hand. Issue `09` is the wontfix that says so. If it ever
 * matters, ask this earlier there; never decide a version somewhere new.
 */
export function documentRefusal(document: unknown): SpaceError | null {
  return unsupportedDocumentVersion(document) ?? retiredSpaceGraphs(document);
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
  const refusal = documentRefusal(input);
  if (refusal !== null) return { ok: false, errors: [refusal] };

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
    defaultLayout: file.defaultLayout,
  });
}

/** Validate and index a fully identified persistence aggregate. */
export function loadSpaceSnapshot(input: unknown): LoadSpaceSnapshotResult {
  // SAFETY: the `typeof`/`null` check just narrowed `input` to a non-null
  // object, and every object may or may not carry a `document` key — reading
  // it through this optional-property shape stays `unknown` either way, ahead
  // of `documentRefusal`'s own checks and the real `spaceSnapshotSchema` parse
  // below.
  const storedDocument =
    typeof input === 'object' && input !== null ? (input as { document?: unknown }).document : null;
  const refusal = documentRefusal(storedDocument);
  if (refusal !== null) return { ok: false, errors: [refusal] };

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
  // SAFETY: `cardDocument` is `cardDocumentSchema`'s output, which is exactly
  // `cardSchema.omit({ id: true })` per card kind — re-adding the `id` this
  // schema stores alongside it reconstructs precisely a `Card`. TypeScript
  // can't confirm that itself: spreading a discriminated union plus one field
  // doesn't re-infer back to the original union.
  const cards = storedCards.map(({ id: cardId, document: cardDocument }) => ({
    id: cardId,
    ...cardDocument,
  })) as Card[];
  const loaded = buildSpace({
    id,
    title: document.title,
    cards,
    layouts: document.layouts,
    defaultLayout: document.defaultLayout,
  });
  return loaded.ok ? { ...loaded, snapshot: parsed.data } : loaded;
}

function buildSpace(input: {
  id: UUID;
  title: string;
  cards: Card[];
  layouts: Layout[] | undefined;
  defaultLayout: UUID | undefined;
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
  // The reference check above has already refused a repeated id, so the lookup
  // built below can drop nothing.
  const graphs = layouts.flatMap((layout) => layout.graphs);
  const built = buildSpaceLookup({ cards, layouts });
  if (!built.ok) {
    return {
      ok: false,
      errors: [
        {
          kind: 'invalid-shape',
          message: `layouts: layout "${built.layoutWithoutGraph}" owns no graph`,
        },
      ],
    };
  }
  return {
    ok: true,
    space: intake({
      id: input.id,
      title: input.title,
      cards,
      graphs,
      layouts,
      defaultLayout: input.defaultLayout,
      lookup: built.lookup,
    }),
  };
}

/**
 * The one place a Space is minted, and the whole of what the brand costs.
 *
 * SAFETY: it sits here rather than at each loader because `buildSpace` is the
 * function that has just run the reference check the brand asserts. The
 * argument is the Space without it, so the cast can add nothing else: every
 * field is still checked against the declared shape, and the only thing being
 * asserted is that this value came through intake.
 */
const intake = (space: Omit<Space, typeof SPACE_INTAKE>): Space => space as Space;
