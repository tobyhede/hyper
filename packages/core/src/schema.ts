/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';

/**
 * Zod schemas for the space file (`space.json`).
 *
 * These validate *shape* only. Referential integrity (do a graph's edge
 * endpoints actually resolve to real cards) is checked separately in `@project/graph`,
 * because it needs the whole space in view. A value that passes here is not yet
 * a Space — `loadSpace` adds the reference check and the index (ADR 0010).
 */

/** The single durable identity used by every referenceable Hyper entity. */
export const uuidSchema = z.string().uuid().brand<'UUID'>();

const idSchema = uuidSchema;

/**
 * Mint a durable identity. The one place a UUID is generated (issue `11`).
 *
 * **Mint, not allocate.** Nothing reserves an id from a registry, and in
 * particular PostgreSQL does not hand them out: a space's id comes from its
 * column default, and every other id — card, graph, layout — is generated here,
 * in whichever process is doing the work. Calling it allocation is what made the
 * importer read as though the database had to be consulted for a random value.
 *
 * The `crypto` global rather than `node:crypto`, so `core` and the packages
 * above it stay browser-safe. Browsers expose `randomUUID` only in a secure
 * context (HTTPS or localhost); that has always been true of this codebase's
 * generation sites, and centralizing them means a fallback, if one is ever
 * needed, has exactly one home. Don't add one speculatively.
 */
export const newUuid = () => uuidSchema.parse(crypto.randomUUID());

/**
 * The frontmatter of a markdown card file (ADR 0020). No `content` key: the
 * body of the file *is* the content, so the card and its text are one artifact.
 */
export const markdownCardFrontmatterSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  kind: z.literal('markdown'),
});

/** The frontmatter of an alias card file — a pointer to the card whose content it shows. */
export const aliasCardFrontmatterSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
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

/**
 * One edge of a graph: a directed connection from one card to another (ADR
 * 0032). This is the element an author draws, and the graph is the set of them.
 *
 * Shape only, as everywhere in this file. Whether both ids name real cards,
 * whether they name cards of the layout that owns this graph, and whether an
 * exact edge occurs more than once need the whole Graph/Space in view and are
 * checked in `@project/graph`.
 */
export const graphEdgeSchema = z.object({
  from: idSchema,
  to: idSchema,
});

export const graphSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  // Optional CSS color for this graph's edges; falls back to a palette by order.
  color: z.string().min(1).optional(),
  /**
   * Possibly none. A graph *is* its edges, but it is no longer minted by
   * drawing one: creating a layout creates its initial empty active graph in
   * the same edit (ADR 0040), and the Flow view converts by returning exactly
   * that — one fresh graph holding no edges (ADR 0045). Deleting a graph's last
   * edge leaves the same shape, and graph management may not delete the graph
   * itself to avoid it. The superseded rule read ADR 0033's connect gesture as
   * the only way a graph came into being, which ADR 0040 replaced.
   *
   * A card may appear as the `from` of several edges (a fork) and the `to` of
   * several (a merge); nothing here constrains that.
   */
  edges: z.array(graphEdgeSchema),
});

/** Where a positioned layout puts a card, in the layout's own coordinate space. */
export const layoutPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * A layout the author wrote: a card-to-position map and the graphs over it
 * (ADR 0025, ADR 0040).
 *
 * Its position keys **are** its card membership. A card the map omits is not in
 * this layout — and a position may not name a card the space does not hold;
 * that is a reference error, checked in `@project/graph` where the whole space
 * is in view.
 *
 * The graphs are **owned**, not referenced: they are nested values of the one
 * layout that holds them, ordered, and never shared with a second (ADR 0040).
 * Every edge endpoint of an owned graph names a card in this layout, which
 * again needs the whole space in view. Ownership is layout-scoped while a graph
 * id is unique across the *space* (ADR 0045), because the flatten a
 * space-subject view draws keys colour, handles and activation on the id alone.
 *
 * **Strict, unlike every other object here.** Under the version 2 shape this
 * key held a filter — an array of graph ids naming the graphs the layout drew.
 * Reading one of those as an owned collection would be a type error, but a
 * *stripped* one would read a file that said "draw only these" as a layout with
 * no graphs at all. Rejecting says so instead.
 */
export const positionedLayoutSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    kind: z.literal('positioned'),
    positions: z.record(idSchema, layoutPositionSchema),
    /**
     * The graphs this layout owns, in author order. **At least one**: creating a
     * layout creates its initial graph in the same edit, and graph management
     * cannot delete the last (ADR 0040), so a layout with none is a state no
     * gesture produces.
     */
    graphs: z.array(graphSchema).min(1),
    /**
     * Which graph is active when this layout opens. Absent, the **first graph**
     * is (ADR 0026) — resolved on read, so a hand-authored space needs nothing
     * here, while a file the app wrote names it outright rather than depending
     * on graph order (ADR 0028). That it names a graph *this layout* owns needs
     * the whole space in view and is checked in `@project/graph`.
     */
    activeGraph: idSchema.optional(),
  })
  .strict();

/**
 * A layout carried by the space file, discriminated by `kind`. Every Layout is
 * authored: an automatic strategy computes placement from the cards and graphs
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
 * The canvas renderers a space can name without declaring anything: the
 * graph-driven flow and a plain grid. Both are automatic Views, so they are
 * named, never configured — `defaultRenderer` records intent ("open me like
 * this") and carries no parameters, because parameters would put computed
 * geometry back into authored content (ADR 0025). A `defaultRenderer` naming
 * none of these and no declared Layout is a reference error.
 */
export const BUILT_IN_VIEW_IDS = ['flow', 'grid'] as const;

export type BuiltInViewId = (typeof BUILT_IN_VIEW_IDS)[number];

export function isBuiltInViewId(id: string): id is BuiltInViewId {
  return (BUILT_IN_VIEW_IDS as readonly string[]).includes(id);
}

/**
 * The **first-public** space document version.
 *
 * Version 2 was the disposable pre-release shape, which carried a space-level
 * `graphs` array beside layouts that owned none. Hyper is unreleased, so it has
 * no compatibility claim on this one and is rejected rather than migrated (ADR
 * 0040). A named constant rather than a literal inlined in one schema, because
 * `documentRefusal` in `@project/graph` reads the declared version
 * *before* the schema parses — at domain intake and at the file importer both —
 * to say so in one error instead of one per key that moved. The literal below
 * is the shape check for a version that is absent or not a number, which that
 * gate deliberately declines to speak for; it is not a second answer to which
 * version this build reads.
 */
export const SPACE_FILE_VERSION = 1;

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
  version: z.literal(SPACE_FILE_VERSION),
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
   * Optional, and it is what holds the space's graphs — a layout owns them
   * (ADR 0040), so there is no space-level collection to declare beside it. A
   * space with no layouts therefore has no structure yet, which is what a new
   * space *is*: it renders and it cannot be presented (ADR 0015).
   */
  layouts: z.array(layoutSchema).optional(),
  /** A declared Layout's id, or a built-in View's id. See {@link BUILT_IN_VIEW_IDS}. */
  defaultRenderer: z.union([z.enum(BUILT_IN_VIEW_IDS), uuidSchema]).optional(),
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

export const importGraphSchema = graphSchema.extend({ id: uuidSchema.optional() });
/**
 * A layout being imported, with the ids the importer mints left out — its own
 * and those of the graphs it owns. Ownership is not relaxed: an owned graph
 * still arrives nested, and there is still at least one.
 */
const importPositionedLayoutSchema = positionedLayoutSchema.extend({
  id: uuidSchema.optional(),
  graphs: z.array(importGraphSchema).min(1),
});
const importLayoutSchema = z.preprocess(
  defaultPositionedKind,
  z.discriminatedUnion('kind', [importPositionedLayoutSchema]),
);

export const importSpaceFileSchema = spaceFileSchema.extend({
  id: uuidSchema.optional(),
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
