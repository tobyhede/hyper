/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { COLLAPSED_RESOURCE_SIZE } from './resource-geometry';
import { RESOURCE_TITLE_REQUIRED, normalizeTitle } from './title';

/**
 * Zod schemas for the space file (`space.json`).
 *
 * These validate *shape* only. Referential integrity (do a graph's edge
 * endpoints actually resolve to real resources) is checked separately in `@project/graph`,
 * because it needs the whole space in view. A value that passes here is not yet
 * a Space — `loadSpace` adds the reference check and the index (ADR 0010).
 */

/** The single durable identity used by every referenceable Hyper entity. */
export const uuidSchema = z.string().uuid().brand<'UUID'>();

const idSchema = uuidSchema;

/**
 * Mint a durable identity. The one place a UUID is generated.
 *
 * **Mint, not allocate.** Nothing reserves an id from a registry, and in
 * particular PostgreSQL does not hand them out: a Space's id comes from its
 * column default, and every other id — Resource, Graph, Map — is generated here,
 * in whichever process is doing the work.
 *
 * The `crypto` global rather than `node:crypto`, so `core` and the packages
 * above it stay browser-safe. Browsers expose `randomUUID` only in a secure
 * context (HTTPS or localhost). Generation lives here so a fallback, if one is
 * ever needed, has exactly one home. Don't add one speculatively.
 */
export const newUuid = () => uuidSchema.parse(crypto.randomUUID());

/**
 * A Resource's Title: one or more Title Lines, normalized here (ADR 0083).
 *
 * This is the boundary the rule sits at, so a stored Title, an imported one and
 * one an author just typed all get the same answer, and no surface normalizes
 * again on the way to a screen. The rule is **at least one non-empty line**, so
 * a Title of nothing but whitespace fails: it carries no name, and the name is
 * what every list, search and accessible label shows.
 *
 * Resources only. Space, Map and Graph titles keep their plain single-line
 * field: they are labels in lists with no drawn Resource to put a ladder on, and giving
 * all four the capability because they share a field type would be the model
 * following the implementation (ADR 0083).
 *
 * One instance, shared by every kind's frontmatter schema — `omit` and
 * `extend` copy a field schema by reference, so the stored document and the
 * import variants inherit this rule rather than restating it, which is what
 * `resource-document-equality.test.ts` holds them to.
 */
const resourceTitleSchema = z
  .string()
  .transform(normalizeTitle)
  .refine((title) => title.length > 0, {
    // Both, and for two audiences. `params.code` is the stable identity an
    // authoring surface words for itself (ADR 0057); `message` is what a file
    // that fails intake prints, and a `refine` with no message prints Zod's
    // "Invalid input" — which names neither the field's rule nor the fix.
    message: 'A title must have at least one line with something in it',
    params: { code: RESOURCE_TITLE_REQUIRED },
  });

/**
 * The frontmatter of a markdown resource file (ADR 0020). No `content` key: the
 * body of the file *is* the content, so the resource and its text are one artifact.
 */
export const markdownResourceFrontmatterSchema = z.object({
  id: idSchema,
  title: resourceTitleSchema,
  kind: z.literal('markdown'),
});

/** The frontmatter of a reference resource file — a pointer to the resource whose content it shows. */
export const referenceResourceFrontmatterSchema = z.object({
  id: idSchema,
  title: resourceTitleSchema,
  kind: z.literal('reference'),
  /** The id of the resource this reference shows. Referential checks live in `@project/graph`. */
  target: idSchema,
});

/**
 * A Resource that shows one selected view of another independently stored Space
 * (ADR 0068).
 *
 * **The selection is part of the Resource, not an option on it (ADR 0079).** A
 * Space Resource names a Map of its target and a Graph that Map owns, and
 * it names them from the moment it exists: the lifecycle that creates one
 * initializes a mapless target before completing and stores what
 * initialization minted, so there is no valid Space Resource with nothing selected
 * and no surface that has to draw one. Both ids are resolved against the target
 * by aggregate intake rather than here — this file knows the shape and
 * `@project/graph` knows the Spaces.
 *
 * Do not fall back to the target's `defaultMap` when the field is missing: one
 * Resource's selection would then follow another Space's opening choice.
 * Requiring the field keeps two Space Resources on one target differing by what
 * they store and by nothing else.
 *
 * Framing is the Map-coordinate centre and scale saved for this particular
 * window onto the target. It is absent until the view has been framed, in which
 * case the renderer fits the selected Map. It belongs here rather than on
 * the Map because two Space Resources may show the same Map differently.
 */
const spaceResourceFramingSchema = z.object({
  centreX: z.number().finite(),
  centreY: z.number().finite(),
  zoom: z.number().positive().finite(),
});

export const spaceResourceFrontmatterSchema = z.object({
  id: idSchema,
  title: resourceTitleSchema,
  kind: z.literal('space'),
  spaceId: idSchema,
  map: uuidSchema,
  graph: idSchema,
  framing: spaceResourceFramingSchema.optional(),
});

/** The refusal code for an image URL an Image Resource may not hold; the application owns the wording. */
export const IMAGE_URL_UNSUPPORTED = 'image-url-unsupported';

/**
 * The id of an image the host stores: the SHA-256 of its bytes spelled as
 * unpadded base64url (ADR 0106). Forty-three characters, and only the
 * canonical spelling: the last one carries four bits of the digest and two
 * zero bits, so it is one of the sixteen characters whose low two bits are
 * clear.
 */
const STORED_IMAGE_ID = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;

export const isStoredImageId = (value: string): boolean => STORED_IMAGE_ID.test(value);

/** The collection the host stores images under; a stored image's root-relative URL is `/images/<id>`. */
export const STORED_IMAGE_COLLECTION_PATH = '/images';

const STORED_IMAGE_PATH_PREFIX = `${STORED_IMAGE_COLLECTION_PATH}/`;

/**
 * Whether an Image Resource may hold this URL (ADR 0106): an `https:` or
 * `http:` URL, or the root-relative URL of a stored image. `data:` is refused
 * because it would put the picture's bytes back in the document, every other
 * scheme because the Resource shows a picture from the web, and every other
 * relative form because it would resolve against whatever page drew it.
 */
export const isAcceptedImageUrl = (url: string): boolean => {
  if (url.startsWith('/')) {
    return (
      url.startsWith(STORED_IMAGE_PATH_PREFIX) &&
      isStoredImageId(url.slice(STORED_IMAGE_PATH_PREFIX.length))
    );
  }
  if (!URL.canParse(url)) return false;
  const { protocol } = new URL(url);
  return protocol === 'https:' || protocol === 'http:';
};

const imageUrlSchema = z.string().refine(isAcceptedImageUrl, {
  message: 'An image URL must be https:, http:, or the /images/<id> of a stored image',
  params: { code: IMAGE_URL_UNSUPPORTED },
});

/**
 * The size of the picture in pixels, as measured when its URL was set
 * (ADR 0106). Recorded with the image; no size rule reads it, because a
 * Resource's size is its Map entry's and the picture fits the rect it is given.
 */
export const imageNaturalSizeSchema = z.object({
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
});

/**
 * A Resource that shows a picture from its URL (ADR 0106). It owns the URL and
 * not the bytes, so nothing here says where the picture is stored; the natural
 * size is absent when the picture did not load when its URL was set.
 */
export const imageResourceFrontmatterSchema = z.object({
  id: idSchema,
  title: resourceTitleSchema,
  kind: z.literal('image'),
  url: imageUrlSchema,
  naturalSize: imageNaturalSizeSchema.optional(),
});

/**
 * A Resource with no content: a Title and every capability every Resource has
 * (ADR 0113). Its frontmatter is the whole of it, so its file has no body.
 */
export const urResourceFrontmatterSchema = z.object({
  id: idSchema,
  title: resourceTitleSchema,
  kind: z.literal('ur'),
});

const frontmatterRecordSchema = z.record(z.unknown());

const frontmatterRecord = (value: unknown) => {
  const record = frontmatterRecordSchema.safeParse(value);
  return record.success ? record.data : undefined;
};

/** Whether parsed frontmatter names its kind, rather than taking the `ur` default. */
export const declaresResourceKind = (frontmatter: unknown): boolean => {
  const record = frontmatterRecord(frontmatter);
  return record !== undefined && 'kind' in record;
};

/**
 * A Resource file that declares no `kind` is an Ur Resource (ADR 0120): its
 * frontmatter is its id and Title, and nothing says how to read content, so the
 * default names no content kind. `decodeResourceFile` in `@project/graph` refuses
 * a body under such a file (`packages/graph/test/resource-file.test.ts`, "refuses
 * a body under frontmatter with no kind, telling the author to declare Markdown").
 */
const defaultUrKind = (value: unknown): unknown => {
  const record = frontmatterRecord(value);
  return record === undefined || declaresResourceKind(record) ? value : { ...record, kind: 'ur' };
};

/**
 * What a resource file's frontmatter must contain (ADR 0020). A resource's identity
 * lives here and never in its filename, so renaming the file is not an identity
 * change. `kind` defaults to `'ur'`, so a file that declares only an id and a
 * Title is an Ur Resource.
 *
 * Strict, as every `space.json` object is: a key no kind declares is refused,
 * naming the key, and so is one inside a nested object, `framing` or
 * `naturalSize`, so no authored key is dropped on intake (ADR 0127). Only
 * file intake is strict. The per-kind objects stay non-strict because the
 * stored document, HTTP and domain schemas are built from them, and those read
 * what Hyper's own code wrote. `.strict()` keeps the shape it is given, so the
 * strict nested objects hold the same field rules as the shared ones
 * (`packages/core/test/resource-document-equality.test.ts`).
 */
const fileSpaceResourceFrontmatterSchema = spaceResourceFrontmatterSchema.extend({
  framing: spaceResourceFramingSchema.strict().optional(),
});
const fileImageResourceFrontmatterSchema = imageResourceFrontmatterSchema.extend({
  naturalSize: imageNaturalSizeSchema.strict().optional(),
});

export const resourceFrontmatterSchema = z.preprocess(
  defaultUrKind,
  z.discriminatedUnion('kind', [
    markdownResourceFrontmatterSchema.strict(),
    referenceResourceFrontmatterSchema.strict(),
    fileSpaceResourceFrontmatterSchema.strict(),
    fileImageResourceFrontmatterSchema.strict(),
    urResourceFrontmatterSchema.strict(),
  ]),
);

export const importMarkdownResourceFrontmatterSchema = markdownResourceFrontmatterSchema
  .extend({ id: uuidSchema.optional() })
  .strict();
export const importReferenceResourceFrontmatterSchema = referenceResourceFrontmatterSchema
  .extend({ id: uuidSchema.optional() })
  .strict();
export const importSpaceResourceFrontmatterSchema = fileSpaceResourceFrontmatterSchema
  .extend({ id: uuidSchema.optional() })
  .strict();
export const importImageResourceFrontmatterSchema = fileImageResourceFrontmatterSchema
  .extend({ id: uuidSchema.optional() })
  .strict();
export const importUrResourceFrontmatterSchema = urResourceFrontmatterSchema
  .extend({ id: uuidSchema.optional() })
  .strict();
/** The import variant of {@link resourceFrontmatterSchema}: the same strictness and default, with `id` optional. */
export const importResourceFrontmatterSchema = z.preprocess(
  defaultUrKind,
  z.discriminatedUnion('kind', [
    importMarkdownResourceFrontmatterSchema,
    importReferenceResourceFrontmatterSchema,
    importSpaceResourceFrontmatterSchema,
    importImageResourceFrontmatterSchema,
    importUrResourceFrontmatterSchema,
  ]),
);

/** A resource written directly by the author; the body of its file is its content. */
export const markdownResourceSchema = markdownResourceFrontmatterSchema.extend({
  body: z.string(),
});

/** A resource that shows its target's content at a second position (ADR 0009). */
export const referenceResourceSchema = referenceResourceFrontmatterSchema;

/** A resource that embeds one selected view of another Space (ADR 0068). */
export const spaceResourceSchema = spaceResourceFrontmatterSchema;

/** A resource that shows a picture from its URL (ADR 0106). */
export const imageResourceSchema = imageResourceFrontmatterSchema;

/** A resource with no content (ADR 0113). */
export const urResourceSchema = urResourceFrontmatterSchema;

/**
 * A resource parsed from its file (ADR 0020). A markdown resource carries the file body
 * that stores its content; a reference resource carries only the pointer to its target's
 * content (ADR 0009). No default for `kind` here — by the time a resource exists
 * its frontmatter has been parsed, and that is where the `ur` default was applied.
 */
export const resourceSchema = z.discriminatedUnion('kind', [
  markdownResourceSchema,
  referenceResourceSchema,
  spaceResourceSchema,
  imageResourceSchema,
  urResourceSchema,
]);

/** The refusal code for a multi-line Edge Title; the application owns the wording. */
export const EDGE_TITLE_ONE_LINE = 'edge-title-one-line';

/** The one statement of `EDGE_TITLE_ONE_LINE`; the Edit asks it before trimming. */
export const isOneLineEdgeTitle = (title: string): boolean => !/[\r\n]/u.test(title);

/**
 * An Edge's Title: one line, non-empty, trimmed, uncapped. A line break is
 * refused rather than folded, because folding would store something the author
 * did not see.
 */
const edgeTitleSchema = z
  .string()
  .min(1)
  .refine((title) => title === title.trim(), { message: 'An Edge Title is stored trimmed' })
  .refine(isOneLineEdgeTitle, {
    message: 'An Edge Title must be one line',
    params: { code: EDGE_TITLE_ONE_LINE },
  });

/**
 * One Edge of a Graph: a directed connection from one Resource to another (ADR
 * 0032). This is the element an author draws, and the Graph is the set of them.
 *
 * Shape only, as everywhere in this file. Whether both ids name real Resources,
 * whether they name Resources of the Map that owns this Graph, and whether an
 * exact Edge occurs more than once need the whole Graph/Space in view and are
 * checked in `@project/graph`. An Edge's identity is `(from, to)` within its
 * Graph; its Title takes no part in it.
 */
export const graphEdgeSchema = z
  .object({
    from: idSchema,
    to: idSchema,
    title: edgeTitleSchema.optional(),
    /**
     * Authored and persisted, not view state (ADR 0104). Only `true` is stored,
     * and only beside a Title, so each state has one spelling.
     */
    titleHidden: z.literal(true).optional(),
  })
  // Strict so a misspelt optional key fails intake rather than being stripped.
  .strict()
  .refine((edge) => edge.titleHidden === undefined || edge.title !== undefined, {
    message: 'An Edge can hide only a Title it has',
    path: ['titleHidden'],
  });

/**
 * What a Graph's Edges draw at their heads, the `to` end (ADR 0105). Closed and
 * without `none`: a Graph is directed, so every head shape shows direction.
 */
export const GRAPH_HEAD_SHAPES = ['arrow', 'vee', 'dot', 'diamond'] as const;

export const graphHeadShapeSchema = z.enum(GRAPH_HEAD_SHAPES);

export const graphSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    // Optional CSS color for this graph's edges; falls back to a palette by order.
    color: z.string().min(1).optional(),
    /**
     * Optional, as `color` is: every creation gesture writes `arrow`, and a
     * Graph with none stored draws as `arrow` (`graphHeadShape`).
     */
    headShape: graphHeadShapeSchema.optional(),
    /**
     * Possibly none. A Graph *is* its Edges, but it is not minted by drawing
     * one: creating a Map creates its initial empty Active Graph in the same
     * Edit, and Add Map produces exactly that — one fresh Graph holding no
     * Edges. Deleting a Graph's last Edge leaves the same shape, and Graph
     * management may not delete the Graph itself to avoid it.
     *
     * A Resource may appear as the `from` of several Edges (a fork) and the `to` of
     * several (a merge); nothing here constrains that.
     */
    edges: z.array(graphEdgeSchema),
  })
  .strict();

/**
 * Where a positioned Map puts a Resource, in the Map's own coordinate space.
 * Finite, because JSON decodes an overflowing number such as `1e400` to
 * `Infinity`, which no stored document can encode back.
 */
export const mapPositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

/**
 * A Resource's size on a Map. No smaller than the Closed Size on either axis:
 * that is the one floor for every kind, Open or Closed, and content adapts to
 * the rect it is given.
 */
const resourceSizeSchema = z
  .object({
    width: z.number().finite().min(COLLAPSED_RESOURCE_SIZE.width),
    height: z.number().finite().min(COLLAPSED_RESOURCE_SIZE.height),
  })
  .strict();

/**
 * The outline an Ur Resource is drawn in on a Map (ADR 0121), Open or Closed.
 * Every member touches the midpoint of each side of the Resource's rect, where
 * Edges attach.
 */
export const RESOURCE_SHAPES = ['rectangle', 'pill', 'ellipse', 'diamond'] as const;

export const resourceShapeSchema = z.enum(RESOURCE_SHAPES);

/**
 * Whether a Resource of this kind takes a Shape other than the rectangle (ADR
 * 0121). Only an Ur Resource does; every other kind is the rectangle.
 */
export const takesResourceShape = (kind: z.infer<typeof resourceSchema>['kind']): boolean =>
  kind === 'ur';

/**
 * Whether a Resource of this kind may be Open. An Ur Resource has no content to
 * show, so it is always Closed; every other kind may be either.
 */
export const takesOpen = (kind: z.infer<typeof resourceSchema>['kind']): boolean => kind !== 'ur';

/**
 * What a Map stores for one Resource: its origin, and optionally whether it is
 * Open, its size and its Shape. Each optional field has an application
 * default, as a Graph's `headShape` does: an entry with no `open` is Closed
 * (`resourceOpen`), one with no `size` is the Closed Size (`resourceSize`), and
 * one with no `shape` is the rectangle (`resourceShape`). Size and Open/Closed
 * are independent: Open changes what is drawn inside the rect, never the rect.
 *
 * **Strict**, as the Map is: a stripped key is a question answered silently.
 */
export const resourcePlacementSchema = mapPositionSchema
  .extend({
    open: z.boolean().optional(),
    size: resourceSizeSchema.optional(),
    shape: resourceShapeSchema.optional(),
  })
  .strict();

/**
 * A Map the author wrote: a position for each Resource it holds, and the
 * Graphs over them (ADR 0040).
 *
 * Its position keys **are** its Resource membership. A Resource the Map omits is not in
 * this Map — and a position may not name a Resource the Space does not hold;
 * that is a reference error, checked in `@project/graph` where the whole Space
 * is in view.
 *
 * The Graphs are **owned**, not referenced: they are nested values of the one
 * Map that holds them, ordered, and never shared with a second (ADR 0040).
 * Every Edge endpoint of an owned Graph names a Resource in this Map, which
 * again needs the whole Space in view. Ownership is Map-scoped while a Graph
 * id is unique across the *Space* (ADR 0108), because the flatten a
 * Space-subject view draws keys colour, handles and activation on the id alone.
 *
 * **Strict**, as the space file itself is: a stripped key is a question
 * answered silently, and rejecting says so instead.
 */
export const positionedMapSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    kind: z.literal('positioned'),
    positions: z.record(idSchema, resourcePlacementSchema),
    /**
     * The Graphs this Map owns, in author order. **At least one**: creating a
     * Map creates its initial Graph in the same Edit, and Graph management
     * cannot delete the last (ADR 0040), so a Map with none is a state no
     * gesture produces.
     */
    graphs: z.array(graphSchema).min(1),
    /**
     * Which Graph is active when this Map opens. Absent, the **first Graph**
     * is (ADR 0040) — resolved on read, so a hand-authored Space needs nothing
     * here, while a file the app wrote names it outright rather than depending
     * on Graph order (ADR 0028). That it names a Graph *this Map* owns needs
     * the whole Space in view and is checked in `@project/graph`.
     */
    activeGraph: idSchema.optional(),
  })
  .strict();

/**
 * A Map carried by the space file, discriminated by `kind`. Every Map is
 * authored: an automatic strategy computes placement from the Resources and Graphs
 * alone, so it has nothing to write down and appears here nowhere (ADR 0079).
 * There is one kind today; the union is what makes a second one cost no
 * migration.
 *
 * `kind` defaults to `'positioned'` when absent, the same shape `resourceFrontmatterSchema`
 * uses — here it is for hand-authoring rather than back-compat, so a Map can
 * be written as just an id, a title, and its positions.
 */
const defaultPositionedKind = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !('kind' in value)
    ? { ...value, kind: 'positioned' }
    : value;

export const mapSchema = z.preprocess(
  defaultPositionedKind,
  z.discriminatedUnion('kind', [positionedMapSchema]),
);

/**
 * The **first-public** space document version.
 *
 * Any other version is rejected rather than migrated: Hyper is unreleased and
 * makes no compatibility claim on a pre-release shape (ADR 0040). A named constant rather than a literal inlined in one schema, because
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
 * It holds **structure and nothing else** (ADR 0020): resources are not listed here,
 * because a resource exists by virtue of its file existing. `loadSpace` takes the
 * resource files alongside this.
 *
 * **Strict**, for the reason `positionedMapSchema` is. A stripped key is a
 * question answered silently: a top-level `resources` or `edges` array
 * half-describes a space nothing loads from, and a file spelling the opening
 * selection under any key but `defaultMap` would reach `workingSpace`, which
 * adopts `maps[0]` and commits it — the Map its author named replaced by one
 * they did not, and then persisted. Rejecting the key says so instead.
 *
 * This is a policy and not a compatibility path, which is what lets it answer
 * a renamed key at all: it declines every key it does not declare, so it never
 * names a retired one and carries no knowledge of a shape that cannot reach it
 * (ADR 0056). `.omit()` and `.extend()` carry the mode, so the stored
 * document, the snapshot and the import variant decline one too — the same
 * answer at every door.
 */
const spaceFileObjectSchema = z.strictObject({
  version: z.literal(SPACE_FILE_VERSION),
  /**
   * What names this space. Required here; an id is optional only in import
   * input, which mints a missing one (ADR 0030).
   *
   * A space's id is not its title and not its file name: a title is prose the
   * author may reword, and a path is where the file happens to sit.
   */
  id: idSchema,
  title: z.string().min(1),
  /**
   * Optional, and it is what holds the Space's Graphs — a Map owns them
   * (ADR 0040), so there is no Space-level collection to declare beside it. A
   * Space with no Maps therefore has no structure yet, which is what a new
   * Space *is*: it renders and it cannot be presented (ADR 0015).
   */
  maps: z.array(mapSchema).optional(),
  /** The durable opening selection, naming one declared Map. */
  defaultMap: uuidSchema.optional(),
});

export const spaceFileSchema = spaceFileObjectSchema;

/** The JSONB document stored beside a space's relational UUID. */
export const spaceDocumentSchema = spaceFileObjectSchema.omit({ id: true });

/** The JSONB document stored beside a resource's relational UUID. */
export const markdownResourceDocumentSchema = markdownResourceSchema.omit({ id: true });
export const referenceResourceDocumentSchema = referenceResourceSchema.omit({ id: true });
export const spaceResourceDocumentSchema = spaceResourceSchema.omit({ id: true });
export const imageResourceDocumentSchema = imageResourceSchema.omit({ id: true });
export const urResourceDocumentSchema = urResourceSchema.omit({ id: true });
export const resourceDocumentSchema = z.discriminatedUnion('kind', [
  markdownResourceDocumentSchema,
  referenceResourceDocumentSchema,
  spaceResourceDocumentSchema,
  imageResourceDocumentSchema,
  urResourceDocumentSchema,
]);

/** A complete, fully identified snapshot of one Space, exchanged at persistence seams. */
export const spaceSnapshotSchema = z.object({
  id: uuidSchema,
  document: spaceDocumentSchema,
  resources: z.array(z.object({ id: uuidSchema, document: resourceDocumentSchema })),
});

/**
 * The **first-public** aggregate file version.
 *
 * Its own constant rather than a second use of `SPACE_FILE_VERSION`, because
 * the two version different documents: that one says what a space file holds,
 * this one says what the directory around it holds. Both are `1` today and
 * nothing holds them in step — a change to the space file's shape does not
 * move the aggregate file's, and reusing one constant would make the next such
 * change look like it did.
 */
export const AGGREGATE_FILE_VERSION = 1;

/**
 * `hyper.json` — the root of a canonical aggregate directory.
 *
 * It carries the one fact the directory cannot say for itself: which of its
 * Spaces is Meta. No adapter may infer that from ordering, cardinality or
 * topology (ADR 0078), and a directory is exactly where such an inference would
 * be tempting — the first child, the alphabetically-least name — so the
 * aggregate file states it outright, and a directory without one is not an aggregate.
 *
 * There is deliberately **no Space inventory** beside it. A Space is in the
 * aggregate because its directory is there, exactly as a resource exists because
 * its file does (ADR 0020); a list would be a second answer to the same
 * question, and the two would disagree the first time someone deleted a
 * directory.
 *
 * **Strict**, as every document schema here is: a stripped key is a question
 * answered silently (ADR 0056).
 */
export const aggregateFileSchema = z.strictObject({
  version: z.literal(AGGREGATE_FILE_VERSION),
  metaSpaceId: uuidSchema,
});

export const importGraphSchema = graphSchema.extend({ id: uuidSchema.optional() });
/**
 * A Map being imported, with the ids the importer mints left out — its own
 * and those of the Graphs it owns. Ownership is not relaxed: an owned Graph
 * still arrives nested, and there is still at least one.
 */
const importPositionedMapSchema = positionedMapSchema.extend({
  id: uuidSchema.optional(),
  graphs: z.array(importGraphSchema).min(1),
});
const importMapSchema = z.preprocess(
  defaultPositionedKind,
  z.discriminatedUnion('kind', [importPositionedMapSchema]),
);

const importSpaceFileObjectSchema = spaceFileObjectSchema.extend({
  id: uuidSchema.optional(),
  maps: z.array(importMapSchema).optional(),
});

export const importSpaceFileSchema = importSpaceFileObjectSchema;

/**
 * The only shape in which entity ids may be absent. References remain UUIDs:
 * identity allocation precedes normal domain validation during import.
 */
export const importSpaceSchema = z.object({
  id: uuidSchema.optional(),
  document: importSpaceFileObjectSchema.omit({ id: true }),
  resources: z.array(z.object({ id: uuidSchema.optional(), document: resourceDocumentSchema })),
});
