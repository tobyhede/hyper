/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { COLLAPSED_RESOURCE_SIZE } from './resource-geometry';
import { imageKind, imageNaturalSizeSchema, imageResourceContentSchema } from './kinds/image';
import {
  markdownFileContentSchema,
  markdownKind,
  markdownResourceContentSchema,
} from './kinds/markdown';
import { referenceKind, referenceResourceContentSchema } from './kinds/reference';
import { kindFlags } from './kinds/registry';
import { spaceKind, spaceResourceContentSchema, spaceResourceFramingSchema } from './kinds/space';
import { urKind } from './kinds/ur';
import { RESOURCE_TITLE_REQUIRED, normalizeTitle } from './title';
import { uuidSchema } from './uuid';

export { newUuid, uuidSchema } from './uuid';

/**
 * Zod schemas for the space file (`space.json`).
 *
 * These validate *shape* only. Referential integrity (do a graph's edge
 * endpoints actually resolve to real resources) is checked separately in `@project/graph`,
 * because it needs the whole space in view. A value that passes here is not yet
 * a Space — `loadSpace` adds the reference check and the index (ADR 0010).
 */

const idSchema = uuidSchema;

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
 * One instance, shared by the Resource and its file's schema — `omit` and
 * `extend` copy a field schema by reference, so the stored document and the
 * file inherit this rule rather than restating it, which is what
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

/** An Ur Resource's content, which is nothing (ADR 0113). */
export const urResourceContentSchema = urKind.contentSchema;

/**
 * A Resource is an envelope (ADR 0128): the core owns `id`, `title` and
 * `kind`, and everything a kind adds sits under `content`. A Resource file
 * holds the same envelope, with a content kind's content replaced by the
 * locator its file codec reads (`@project/graph`'s `resource-file.ts`).
 */
const resourceEnvelope = <K extends z.ZodTypeAny, C extends z.ZodTypeAny>(kind: K, content: C) =>
  z.object({ id: idSchema, title: resourceTitleSchema, kind, content });

/** A resource written directly by the author; its sidecar holds its source. */
export const markdownResourceSchema = resourceEnvelope(
  z.literal(markdownKind.id),
  markdownResourceContentSchema,
);

/** A resource that shows its target's content at a second position (ADR 0009). */
export const referenceResourceSchema = resourceEnvelope(
  z.literal(referenceKind.id),
  referenceResourceContentSchema,
);

/** A resource that embeds one selected view of another Space (ADR 0068). */
export const spaceResourceSchema = resourceEnvelope(
  z.literal(spaceKind.id),
  spaceResourceContentSchema,
);

/** A resource that shows a picture from its URL (ADR 0106). */
export const imageResourceSchema = resourceEnvelope(
  z.literal(imageKind.id),
  imageResourceContentSchema,
);

/** A resource with no content (ADR 0113). */
export const urResourceSchema = resourceEnvelope(z.literal(urKind.id), urResourceContentSchema);

/**
 * A Resource: the envelope with each kind's content (ADR 0128). A Markdown
 * Resource carries its source; a Reference Resource only the pointer to its
 * Target's content (ADR 0009).
 */
export const resourceSchema = z.discriminatedUnion('kind', [
  markdownResourceSchema,
  referenceResourceSchema,
  spaceResourceSchema,
  imageResourceSchema,
  urResourceSchema,
]);

/**
 * A Resource file, `resources/<id>.json` (ADR 0128), as
 * `docs/schema/resource/` specifies it: strict at both levels, so a key no
 * kind declares is refused, naming the key, and so is one inside a nested
 * object, `framing` or `naturalSize`, so no authored key is dropped on intake
 * (ADR 0127). `kind` is required. Only file intake is strict: the stored
 * document's content schemas read what Hyper's own code wrote. `.strict()`
 * keeps the shape it is given, so the strict nested objects hold the same
 * field rules as the shared ones
 * (`packages/core/test/resource-document-equality.test.ts`).
 */
const resourceFileEnvelope = <K extends z.ZodTypeAny, C extends z.ZodTypeAny>(
  kind: K,
  content: C,
) => z.object({ id: idSchema, title: resourceTitleSchema, kind, content }).strict();

const declaredKindSchema = z.object({ kind: z.string() });
const declaredIdSchema = z.object({ id: z.string() });

/** The `id` a Resource file's JSON declares, when it is an object declaring a string one. */
export const declaredId = (json: unknown): string | undefined => {
  const parsed = declaredIdSchema.safeParse(json);
  return parsed.success ? parsed.data.id : undefined;
};

/** The `kind` a Resource file's JSON declares, when it is an object declaring a string one. */
export const declaredKind = (json: unknown): string | undefined => {
  const parsed = declaredKindSchema.safeParse(json);
  return parsed.success ? parsed.data.kind : undefined;
};

export const resourceFileSchema = z.discriminatedUnion('kind', [
  resourceFileEnvelope(z.literal(markdownKind.id), markdownFileContentSchema),
  resourceFileEnvelope(z.literal(referenceKind.id), referenceResourceContentSchema.strict()),
  resourceFileEnvelope(
    z.literal(spaceKind.id),
    spaceResourceContentSchema
      .extend({ framing: spaceResourceFramingSchema.strict().optional() })
      .strict(),
  ),
  resourceFileEnvelope(
    z.literal(imageKind.id),
    imageResourceContentSchema
      .extend({ naturalSize: imageNaturalSizeSchema.strict().optional() })
      .strict(),
  ),
  resourceFileEnvelope(z.literal(urKind.id), urResourceContentSchema.strict()),
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
 * 0121), as its kind declares.
 */
export const takesResourceShape = (kind: z.infer<typeof resourceSchema>['kind']): boolean =>
  kindFlags(kind).takesResourceShape;

/** Whether a Resource of this kind may be Open, as its kind declares (ADR 0122). */
export const takesOpen = (kind: z.infer<typeof resourceSchema>['kind']): boolean =>
  kindFlags(kind).canOpen;

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
 * `kind` defaults to `'positioned'` when absent, for hand-authoring, so a Map
 * can be written as just an id, a title, and its positions.
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
