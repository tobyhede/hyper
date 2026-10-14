/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import type { z } from 'zod';
import type { ContentFacts } from '../resource-content';
import type {
  SpaceSelectionTarget,
  SpaceSelectionProblem,
  spaceResourceContentSchema,
  spaceResourceFramingSchema,
} from './space';
import type { UUID } from '../types';

/**
 * What a kind says about the rules every Resource meets, so that no rule names
 * a kind (ADR 0128). The core reads these; a module sets them.
 */
export interface KindFlags {
  /** Whether a Resource of this kind takes a Shape other than the rectangle (ADR 0121). */
  readonly takesResourceShape: boolean;
  /** Whether a Resource of this kind may be Open (ADR 0122). */
  readonly canOpen: boolean;
  /** Whether another Resource may reference one of this kind as its Target, which keeps referencing a single hop (ADR 0113). */
  readonly mayBeTarget: boolean;
  /** Whether a Space this kind references lives by that reference, and is deleted with its last (ADR 0074). */
  readonly ownsReferencedSpaces: boolean;
}

/** A file a kind writes beside a Resource file, named relative to it. */
export interface KindSidecar {
  readonly name: string;
  readonly text: string;
}

/** A Resource file's content read as the document's, or why it cannot be. */
export type FileContentDecoding =
  | { readonly ok: true; readonly content: unknown }
  | {
      readonly ok: false;
      readonly kind: 'invalid-resource-file' | 'missing-sidecar';
      readonly message: string;
    };

/**
 * How a kind's content is written to its Resource file and read back: the content the file holds, and the sidecars beside it.
 */
export interface KindFileCodec<Content, FileContent> {
  /** The content a Resource file of this kind holds, strict, so a key the kind does not declare is refused. */
  readonly contentSchema: z.ZodType<FileContent, z.ZodTypeDef, unknown>;
  /** The sidecars a Resource of this kind with this id may name, so a refused file still claims them. */
  readonly sidecarNames: (id: string) => readonly string[];
  readonly encode: (
    id: string,
    content: Content,
  ) => { readonly content: FileContent; readonly sidecars: readonly KindSidecar[] };
  /** The document's content, read through `sidecar`, which answers a name beside the Resource file. */
  readonly decode: (
    id: string,
    content: FileContent,
    sidecar: (name: string) => string | undefined,
  ) => FileContentDecoding;
}

type SpaceResourceContent = z.infer<typeof spaceResourceContentSchema>;

/** The Map-coordinate centre and scale one window onto another Space is framed at. */
export type SpaceFraming = Readonly<z.infer<typeof spaceResourceFramingSchema>>;

/**
 * The view of another Space a Resource shows: the Space, a Map of it, a Graph
 * that Map owns, and how the window is framed. It is not the Resource, because
 * a drawn Resource names nothing outside itself (ADR 0083). `framing` is a
 * required key that may hold `undefined`, so a value is built whole rather than
 * by a conditional spread.
 */
export interface SpaceView {
  readonly spaceId: SpaceResourceContent['spaceId'];
  readonly map: SpaceResourceContent['map'];
  readonly graph: SpaceResourceContent['graph'];
  readonly framing: SpaceFraming | undefined;
}

/** A Map and one of its Graphs, chosen in the Space a selection shows. */
export type SpaceViewChoice = Pick<SpaceView, 'map' | 'graph'>;

/**
 * How a kind whose content shows a view of another Space reads and changes it
 * (ADR 0068, ADR 0079), so that no reader outside the kind compares its
 * `spaceId`, `map` and `graph` by kind.
 */
export interface SpaceSelection<Content> {
  /** The Space, Map and Graph this content shows, and its framing. */
  readonly of: (content: Content) => SpaceView;
  /** The content showing `choice` in the same Space. A framing is the old Map's, so a different Map drops it. */
  readonly select: (content: Content, choice: SpaceViewChoice) => Content;
  /** The content framed as given. */
  readonly frame: (content: Content, framing: SpaceFraming) => Content;
  /** The kind's own check of this content's selection in a target Space it alone understands. */
  readonly problem: (
    content: Content,
    target: SpaceSelectionTarget,
  ) => SpaceSelectionProblem | undefined;
}

/** What a kind's content resolves to, tagged with a kind. Whether it is the Resource's own is the registry's to say. */
export interface KindResolvedContent {
  readonly kind: string;
}

/**
 * A Resource kind (ADR 0120): its id, the schema its `content` is
 * parsed by, and every rule it declares. The core reads these and names no
 * kind; a kind with nothing to say about a rule takes `defineKind`'s answer.
 * The view half is the application's.
 */
export interface KindModule<
  K extends string,
  Content,
  FileContent = Content,
  Resolved extends KindResolvedContent = KindResolvedContent,
> {
  readonly id: K;
  /**
   * The one parser of this kind's `content`, strict, for a stored document and
   * a Resource file alike: the envelope parses `content` through it (ADR 0128).
   */
  readonly contentSchema: z.ZodType<Content, z.ZodTypeDef, unknown>;
  readonly flags: KindFlags;
  /** What this kind's content resolves to, however the Resource showing it reached it. */
  readonly resolveContent: (content: Content) => Resolved;
  /** The Resources this content references, which intake resolves. */
  readonly resourceReferences: (content: Content) => readonly UUID[];
  /** The Resource whose content this one shows, when it shows another's (ADR 0070). */
  readonly contentTarget: (content: Content) => UUID | undefined;
  /** The Spaces this content references, from which the core enforces cycles, lifetime and rooting. */
  readonly spaceReferences: (content: Content) => readonly UUID[];
  /** How this kind's content shows a view of another Space, when it shows one. */
  readonly selection?: SpaceSelection<Content>;
  /** The content as Export writes it, so a file's bytes do not depend on how it was built. */
  readonly canonicalContent: (content: Content) => Content;
  readonly file: KindFileCodec<Content, FileContent>;
  /** What an author may do with this kind's own content and how it lays out, when it owns content (ADR 0114). */
  readonly facts?: ContentFacts;
  /** The content a new Resource of this kind starts with, when it may be created empty. */
  readonly newContent?: Content;
}

/**
 * A kind a Resource may be created as from nothing but a press: its module
 * declares the content a new one starts with, and its type says so, so the
 * kinds that may be created empty are derived from the modules rather than
 * listed.
 */
export interface StartsEmpty<Content> {
  readonly newContent: Content;
}

/** What a kind must declare; the rest takes {@link defineKind}'s answer. */
type KindDeclaration<
  K extends string,
  Content,
  FileContent,
  Resolved extends KindResolvedContent,
> = Pick<
  KindModule<K, Content, FileContent, Resolved>,
  'id' | 'contentSchema' | 'flags' | 'resolveContent'
> &
  Partial<
    Omit<
      KindModule<K, Content, FileContent, Resolved>,
      'id' | 'contentSchema' | 'flags' | 'resolveContent'
    >
  >;

/** The content in its schema's key order, or as given when the schema refuses it, so this never throws. */
const inSchemaOrder =
  <Content>(schema: z.ZodType<Content, z.ZodTypeDef, unknown>) =>
  (content: Content): Content => {
    const parsed = schema.safeParse(content);
    return parsed.success ? parsed.data : content;
  };

/** A file codec that writes content as it is, parsed by the kind's own schema, and names no sidecar. */
const asWritten = <Content>(
  contentSchema: z.ZodType<Content, z.ZodTypeDef, unknown>,
): KindFileCodec<Content, Content> => ({
  contentSchema,
  sidecarNames: () => [],
  encode: (_id, content) => ({ content, sidecars: [] }),
  decode: (_id, content) => ({ ok: true, content }),
});

/**
 * A kind module with every rule it does not declare answered as a kind that
 * references nothing, has no content of its own to author, writes its content
 * as it is, and puts it in its schema's key order on Export. A module that
 * declares the content a new Resource starts with keeps it in its type.
 */
export function defineKind<const K extends string, Content, Resolved extends KindResolvedContent>(
  declaration: KindDeclaration<K, Content, Content, Resolved> & StartsEmpty<Content>,
): KindModule<K, Content, Content, Resolved> & StartsEmpty<Content>;
export function defineKind<
  const K extends string,
  Content,
  FileContent,
  Resolved extends KindResolvedContent,
>(
  declaration: KindDeclaration<K, Content, FileContent, Resolved> & {
    readonly file: KindFileCodec<Content, FileContent>;
  } & StartsEmpty<Content>,
): KindModule<K, Content, FileContent, Resolved> & StartsEmpty<Content>;
export function defineKind<const K extends string, Content, Resolved extends KindResolvedContent>(
  declaration: KindDeclaration<K, Content, Content, Resolved>,
): KindModule<K, Content, Content, Resolved>;
export function defineKind<
  const K extends string,
  Content,
  FileContent,
  Resolved extends KindResolvedContent,
>(
  declaration: KindDeclaration<K, Content, FileContent, Resolved> & {
    readonly file: KindFileCodec<Content, FileContent>;
  },
): KindModule<K, Content, FileContent, Resolved>;
export function defineKind<K extends string, Content, Resolved extends KindResolvedContent>(
  declaration: KindDeclaration<K, Content, unknown, Resolved>,
): KindModule<K, Content, unknown, Resolved> {
  return {
    resourceReferences: () => [],
    contentTarget: () => undefined,
    spaceReferences: () => [],
    canonicalContent: inSchemaOrder(declaration.contentSchema),
    file: asWritten<unknown>(declaration.contentSchema),
    ...declaration,
  };
}
