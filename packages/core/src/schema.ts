/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';

/**
 * Zod schemas for the space file (`space.json`).
 *
 * These validate *shape* only. Referential integrity (do a route's edge
 * endpoints actually resolve to real cards) is checked separately in `@project/graph`,
 * because it needs the whole space in view. A value that passes here is not yet
 * a Space — `loadSpace` adds the reference check and the index (ADR 0010).
 */

/** The single durable identity used by every referenceable Hyper entity. */
export const uuidSchema = z.string().uuid().brand<'UUID'>();

const idSchema = uuidSchema;

/**
 * Upper bound on a card's description. A description is a caption — what a card
 * *is* when the title is too terse (ADR 0006) — not a second body, so it is
 * capped and single-line. Past this, the content belongs in the card, opened.
 */
export const CARD_DESCRIPTION_MAX_LENGTH = 120;

/**
 * An optional one-line description, drawn under the title in the graph node
 * (ADR 0006). Bounded and newline-free so it cannot drift into a body — the card
 * is fixed-size, so an unbounded description would just clip silently.
 */
const descriptionSchema = z
  .string()
  .min(1)
  .max(CARD_DESCRIPTION_MAX_LENGTH)
  .refine((value) => !value.includes('\n'), { message: 'description must be a single line' })
  .optional();

/**
 * The frontmatter of a markdown card file (ADR 0020). No `content` key: the
 * body of the file *is* the content, so the card and its text are one artifact.
 */
export const markdownCardFrontmatterSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  description: descriptionSchema,
  kind: z.literal('markdown'),
});

/** The frontmatter of an alias card file — a pointer to the card whose content it shows. */
export const aliasCardFrontmatterSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  description: descriptionSchema,
  kind: z.literal('alias'),
  /** The id of the card this alias shows. Referential checks live in `@project/graph`. */
  target: idSchema,
});

const defaultMarkdownKind = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !('kind' in value)
    ? { ...value, kind: 'markdown' }
    : value;

/**
 * What a card file's frontmatter must contain (ADR 0020). A card's identity
 * lives here and never in its filename, so renaming the file is not an identity
 * change. `kind` defaults to `'markdown'` exactly as {@link cardSchema} does —
 * the common card declares an id and a title and nothing else.
 */
export const cardFrontmatterSchema = z.preprocess(
  defaultMarkdownKind,
  z.discriminatedUnion('kind', [markdownCardFrontmatterSchema, aliasCardFrontmatterSchema]),
);

export const importMarkdownCardFrontmatterSchema = markdownCardFrontmatterSchema.extend({
  id: uuidSchema.optional(),
});
export const importAliasCardFrontmatterSchema = aliasCardFrontmatterSchema.extend({
  id: uuidSchema.optional(),
});
export const importCardFrontmatterSchema = z.preprocess(
  defaultMarkdownKind,
  z.discriminatedUnion('kind', [
    importMarkdownCardFrontmatterSchema,
    importAliasCardFrontmatterSchema,
  ]),
);

/** A card written directly by the author; the body of its file is its content. */
export const markdownCardSchema = markdownCardFrontmatterSchema.extend({ body: z.string() });

/** A card that shows its target's content at a second position (ADR 0009). */
export const aliasCardSchema = aliasCardFrontmatterSchema;

/**
 * A card parsed from its file (ADR 0020). A markdown card carries the file body
 * that stores its content; an alias carries only the pointer to its target's
 * content (ADR 0009). No default for `kind` here — by the time a card exists
 * its frontmatter has been parsed, and that is where the default was applied.
 */
export const cardSchema = z.discriminatedUnion('kind', [markdownCardSchema, aliasCardSchema]);

/** Where a positioned layout puts a card, in the layout's own coordinate space. */
export const layoutPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * A layout the author wrote: a card-to-position map (ADR 0025).
 *
 * Positions are deliberately **sparse** — a layout may omit cards, and whoever
 * renders it places those itself — but a position may not name a card that does
 * not exist; that is a reference error, checked in `@project/graph` where the
 * whole space is in view.
 *
 * It also points at routes: which it shows, and which of those is active (ADR
 * 0026). Both are optional and independent, and the dependency runs one way —
 * geometry references topology, never the reverse. A Route stays a peer of
 * Layout under the Space and knows nothing about where it is drawn.
 */
export const positionedLayoutSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  kind: z.literal('positioned'),
  positions: z.record(idSchema, layoutPositionSchema),
  /**
   * The routes this layout *shows* — a filter, absent meaning every route (ADR
   * 0026). Authored view scope: one arrangement does not suit every route, and
   * a layout arranged for some should not draw the ones it was not arranged
   * for. Activating a route moves emphasis within this set and never changes
   * it — *selection is emphasis, not filtering, and the filter is the Layout's*.
   */
  routes: z.array(idSchema).optional(),
  /**
   * Which visible route is active when this layout opens. Absent, the **first
   * visible route** is (ADR 0026) — resolved on read, so a hand-authored space
   * needs nothing here, while a file the app wrote names it outright rather
   * than depending on route order (ADR 0028).
   *
   * Independent of `routes`: a layout may filter without naming an active
   * route, or name one without filtering. That it names a *visible* route is a
   * relation between the two fields and is checked in `@project/graph`.
   */
  activeRoute: idSchema.optional(),
});

/**
 * A layout carried by the space file, discriminated by `kind`. Every Layout is
 * authored: an automatic strategy computes placement from the cards and routes
 * alone, so it has nothing to write down and appears here nowhere (ADR 0025).
 * There is one kind today; the union is what makes a second one cost no
 * migration.
 *
 * `kind` defaults to `'positioned'` when absent, the same shape `cardSchema`
 * uses — here it is for hand-authoring rather than back-compat, so a layout can
 * be written as just an id, a title, and its positions.
 */
const defaultPositionedKind = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !('kind' in value)
    ? { ...value, kind: 'positioned' }
    : value;

export const layoutSchema = z.preprocess(
  defaultPositionedKind,
  z.discriminatedUnion('kind', [positionedLayoutSchema]),
);

/**
 * The views a space can name without declaring anything: the route-driven graph
 * and a plain grid. Both are automatic, so they are named, never configured —
 * `defaultView` records intent ("open me like this") and carries no parameters,
 * because parameters would put computed geometry back into authored content
 * (ADR 0025). A `defaultView` naming none of these and no declared layout is a
 * reference error.
 */
export const BUILT_IN_VIEW_IDS = ['graph', 'grid'] as const;

export type BuiltInViewId = (typeof BUILT_IN_VIEW_IDS)[number];

export function isBuiltInViewId(id: string): id is BuiltInViewId {
  return (BUILT_IN_VIEW_IDS as readonly string[]).includes(id);
}

/**
 * One edge of a route: a directed connection from one card to another (ADR
 * 0023). This is the element an author draws, and the route is the set of them.
 *
 * Shape only, as everywhere in this file. That both ids name real cards, and
 * that the edges do not close a cycle, need the whole space in view and are
 * checked in `@project/graph`.
 */
export const routeEdgeSchema = z.object({
  from: idSchema,
  to: idSchema,
});

export const routeSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  // Optional CSS color for this route's edges; falls back to a palette by order.
  color: z.string().min(1).optional(),
  /**
   * At least one. A route is a set of edges, so a route with none connects
   * nothing and draws nothing — and drawing an edge is the gesture that mints a
   * route in the first place (ADR 0021), so one is the fewest a route is ever
   * created with. A card may appear as the `from` of several edges (a fork) and
   * the `to` of several (a merge); nothing here constrains that.
   */
  edges: z.array(routeEdgeSchema).min(1),
});

/**
 * The on-disk shape of a space — the serialized form `loadSpace` reads (ADR
 * 0010). This validates *shape* only; a value that passes it is not yet a Space
 * (references unchecked, no index). "manifest" is retired: this is the space
 * file, not a manifest.
 *
 * It holds **structure and nothing else** (ADR 0020): cards are not listed here,
 * because a card exists by virtue of its file existing. `loadSpace` takes the
 * card files alongside this.
 */
export const spaceFileSchema = z.object({
  version: z.literal(2),
  /**
   * What names this space. Required today; ADR 0019 makes ids optional and
   * generated on load, and this is the field that becomes optional — the other
   * direction would strand every file already carrying one.
   *
   * A space's id is not its title and not its file name: a title is prose the
   * author may reword, and a path is where the file happens to sit.
   */
  id: idSchema,
  title: z.string().min(1),
  /**
   * May be empty: a space with no routes has no structure yet, which is what a
   * new space *is*. It renders and it cannot be presented (ADR 0015).
   */
  routes: z.array(routeSchema),
  /** Optional: a space can be hand-authored with no coordinates at all. */
  layouts: z.array(layoutSchema).optional(),
  /** A declared layout's id, or a built-in view's. See {@link BUILT_IN_VIEW_IDS}. */
  defaultView: z.union([z.enum(BUILT_IN_VIEW_IDS), uuidSchema]).optional(),
});

/** The JSONB document stored beside a space's relational UUID. */
export const spaceDocumentSchema = spaceFileSchema.omit({ id: true });

/** The JSONB document stored beside a card's relational UUID. */
export const markdownCardDocumentSchema = markdownCardSchema.omit({ id: true });
export const aliasCardDocumentSchema = aliasCardSchema.omit({ id: true });
export const cardDocumentSchema = z.discriminatedUnion('kind', [
  markdownCardDocumentSchema,
  aliasCardDocumentSchema,
]);

/** A complete, fully identified aggregate exchanged at persistence seams. */
export const spaceSnapshotSchema = z.object({
  id: uuidSchema,
  document: spaceDocumentSchema,
  cards: z.array(z.object({ id: uuidSchema, document: cardDocumentSchema })),
});

const importRouteSchema = routeSchema.extend({ id: uuidSchema.optional() });
const importPositionedLayoutSchema = positionedLayoutSchema.extend({ id: uuidSchema.optional() });
const importLayoutSchema = z.preprocess(
  defaultPositionedKind,
  z.discriminatedUnion('kind', [importPositionedLayoutSchema]),
);

export const importSpaceFileSchema = spaceFileSchema.extend({
  id: uuidSchema.optional(),
  routes: z.array(importRouteSchema),
  layouts: z.array(importLayoutSchema).optional(),
});

/**
 * The only shape in which entity ids may be absent. References remain UUIDs:
 * identity allocation precedes normal domain validation during import.
 */
export const importSpaceSchema = z.object({
  id: uuidSchema.optional(),
  document: importSpaceFileSchema.omit({ id: true }),
  cards: z.array(z.object({ id: uuidSchema.optional(), document: cardDocumentSchema })),
});
