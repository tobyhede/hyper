/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import type { z } from 'zod';
import type { ContentFacts, ContentUnresolved, ContentVia } from '../resource-content';
import type { UUID } from '../types';
import type {
  FileContentDecoding,
  KindFlags,
  KindModule,
  KindSidecar,
  SpaceFraming,
  SpaceSelection,
  SpaceView,
  SpaceViewChoice,
  StartsEmpty,
} from './kind-module';
import { imageKind } from './image';
import { markdownKind } from './markdown';
import { referenceKind } from './reference';
import type { SpaceSelectionTarget, SpaceSelectionProblem } from './space';
import { spaceKind } from './space';
import { urKind } from './ur';

/**
 * The kinds, every one a module, registered with every build: the one place each
 * is registered. Their order is the order every list of kinds is drawn in.
 */
const REGISTERED = {
  [markdownKind.id]: markdownKind,
  [spaceKind.id]: spaceKind,
  [imageKind.id]: imageKind,
  [urKind.id]: urKind,
  [referenceKind.id]: referenceKind,
};
type Registered = typeof REGISTERED;

/** A Resource kind's id: one a module registers. */
export type KindId = keyof Registered;

/** Each kind's content, as its own schema parses it. */
type ContentByKind = { [K in KindId]: z.output<Registered[K]['contentSchema']> };
/** Each kind's Resource file content, as its file codec's schema parses it. */
type FileContentByKind = { [K in KindId]: z.output<Registered[K]['file']['contentSchema']> };
/** What each kind's content resolves to. */
type ResolvedByKind = { [K in KindId]: ReturnType<Registered[K]['resolveContent']> };

/** Each kind's module, typed so a rule over a kinded value calls its own kind's module. */
type KindModules = {
  readonly [K in KindId]: KindModule<K, ContentByKind[K], FileContentByKind[K], ResolvedByKind[K]>;
};

const KIND_MODULES: KindModules = REGISTERED;

/** A kinded value whose content is its kind's, correlated so its module accepts it. */
type Kinded<K extends KindId> = {
  [P in K]: { kind: P; content: ContentByKind[P] };
}[K];

/** A Resource file whose content is its kind's file content, correlated so its module's codec accepts it. */
type KindedFile<K extends KindId> = {
  [P in K]: { kind: P; content: FileContentByKind[P] };
}[K];

/** The parser of a kinded value's content, answering it with its kind. */
type KindedParser<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

/** A kind's parsers: of a Resource's content, and of its Resource file's content. */
interface KindParsers<K extends KindId> {
  readonly content: KindedParser<Kinded<K>>;
  readonly file: KindedParser<KindedFile<K>>;
}

const parsersOf = <K extends KindId>(kind: K): KindParsers<K> => ({
  content: KIND_MODULES[kind].contentSchema.transform((content) => ({ kind, content })),
  file: KIND_MODULES[kind].file.contentSchema.transform((content) => ({ kind, content })),
});

const builtParsers = new Map<KindId, KindParsers<KindId>>();

/** A registered kind's parsers, built at its first use and kept, so a list of the kinds is not written twice. */
const parsersFor = (kind: KindId): KindParsers<KindId> => {
  const built = builtParsers.get(kind);
  if (built !== undefined) return built;
  const parsers = parsersOf(kind);
  builtParsers.set(kind, parsers);
  return parsers;
};

/** The one parser of a Resource's `content`: its kind's module's schema. */
export const contentParser = (kind: KindId): KindedParser<Kinded<KindId>> =>
  parsersFor(kind).content;

/** The parser of a Resource file's `content`: its kind's file codec's schema. */
export const fileContentParser = (kind: KindId): KindedParser<KindedFile<KindId>> =>
  parsersFor(kind).file;

/**
 * A Resource: the core's envelope, `id`, `title` and `kind`, and
 * the content its kind's module parses. Typed from the registry, so a kind is
 * declared in its module and listed in this file, and nowhere else.
 */
export type Resource = {
  [K in KindId]: { id: UUID; title: string; kind: K; content: ContentByKind[K] };
}[KindId];

/** A stored Resource document: a Resource less its id, which is stored beside it. */
export type ResourceDocument = {
  [K in KindId]: { title: string; kind: K; content: ContentByKind[K] };
}[KindId];

/** A Resource file as intake reads it: the envelope, with its kind's file content. */
export type ResourceFileDocument = {
  [K in KindId]: { id: UUID; title: string; kind: K; content: FileContentByKind[K] };
}[KindId];

/** Content a kind resolved, with whether it is the Resource's own or its content Target's. */
type Reached<Resolved> = Resolved extends unknown ? Resolved & { readonly via: ContentVia } : never;

/**
 * What a Resource's content is, as its kind resolves it. `unresolved` answers
 * only states intake refuses: a content Target that is missing or may not be one.
 */
export type ResourceContent =
  | Reached<Exclude<ResolvedByKind[KindId], { readonly kind: ContentUnresolved['kind'] }>>
  | ContentUnresolved;

/** What a Resource shows when its content Target is missing or may not be one: nothing. */
export const UNRESOLVED_CONTENT: ContentUnresolved = { kind: 'unresolved', via: 'target' };

/** Every registered kind's id, in registration order. */
export const KIND_IDS: readonly KindId[] = Object.values(KIND_MODULES).map(({ id }) => id);

/** Whether a module registers this kind with this build. */
export const isRegisteredKind = (kind: string): kind is KindId =>
  KIND_IDS.some((registered) => registered === kind);

/** The rules a kind declares for every Resource of it. */
export const kindFlags = (kind: KindId): KindFlags => KIND_MODULES[kind].flags;

/** A Resource, stored or not: what its kind's declarations are read from. */
export type KindedResource = Kinded<KindId>;

const resourceReferencesOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].resourceReferences(resource.content);

/** The Resources this Resource's content references, which intake resolves. */
export const resourceReferences = (resource: KindedResource): readonly UUID[] =>
  resourceReferencesOf(resource);

const contentTargetOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].contentTarget(resource.content);

/** The Resource whose content this one shows, when its kind shows another's (ADR 0070). */
export const contentTarget = (resource: KindedResource): UUID | undefined =>
  contentTargetOf(resource);

/** Whether a Resource of this kind may be another's Target (ADR 0113). */
export const mayBeTarget = (kind: KindId): boolean => kindFlags(kind).mayBeTarget;

const spaceReferencesOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].spaceReferences(resource.content);

/** The Spaces this Resource's content references, from which the core enforces cycles and lifetime. */
export const spaceReferences = (resource: KindedResource): readonly UUID[] =>
  spaceReferencesOf(resource);

/** The Spaces whose lifetime this Resource holds: each lives while a reference holds it (ADR 0074). */
export const lifetimeSpaceReferences = (resource: KindedResource): readonly UUID[] =>
  kindFlags(resource.kind).ownsReferencedSpaces ? spaceReferences(resource) : [];

const selectionProblemOf = <K extends KindId>(resource: Kinded<K>, target: SpaceSelectionTarget) =>
  KIND_MODULES[resource.kind].selection?.problem(resource.content, target);

/** Why this Resource's selection does not resolve in its target Space, by its kind's own check. */
export const spaceSelectionProblem = (
  resource: KindedResource,
  target: SpaceSelectionTarget,
): SpaceSelectionProblem | undefined => selectionProblemOf(resource, target);

const selectionOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].selection?.of(resource.content);

/** The view of another Space this Resource shows, when its kind shows one (ADR 0068). */
export const spaceSelection = (resource: KindedResource): SpaceView | undefined =>
  selectionOf(resource);

const reselectedOf = <K extends KindId>(
  resource: Kinded<K>,
  change: (
    selection: SpaceSelection<ContentByKind[K]>,
    content: ContentByKind[K],
  ) => ContentByKind[K],
): Kinded<K> | undefined => {
  const selection = KIND_MODULES[resource.kind].selection;
  return selection === undefined
    ? undefined
    : { ...resource, content: change(selection, resource.content) };
};

/**
 * The document showing `choice` in the Space it already shows, or `undefined`
 * when its kind shows none. A different Map drops the framing, which was the
 * old Map's.
 */
export const selectSpaceView = (
  document: ResourceDocument,
  choice: SpaceViewChoice,
): ResourceDocument | undefined => {
  const content = reselectedOf(document, (selection, current) => selection.select(current, choice));
  return content === undefined ? undefined : { ...document, ...content };
};

/** The document framed as given, or `undefined` when its kind shows no view of another Space. */
export const frameSpaceView = (
  document: ResourceDocument,
  framing: SpaceFraming,
): ResourceDocument | undefined => {
  const content = reselectedOf(document, (selection, current) => selection.frame(current, framing));
  return content === undefined ? undefined : { ...document, ...content };
};

const resolveContentOf = <K extends KindId>(
  resource: Kinded<K>,
  via: ContentVia,
): ResourceContent => {
  const resolved: ResolvedByKind[KindId] = KIND_MODULES[resource.kind].resolveContent(
    resource.content,
  );
  return resolved.kind === UNRESOLVED_CONTENT.kind ? UNRESOLVED_CONTENT : { ...resolved, via };
};

/**
 * What a Resource draws as its content, with at most one Target lookup: its
 * own, or the content Target's its kind names (ADR 0070), which the result says
 * and no kind module does. A missing Resource, a missing Target and a Target
 * that may not be one are the states intake refuses, and resolve as unresolved.
 */
export const resolveContent = (
  resource: KindedResource | undefined,
  resourceOf: (id: UUID) => KindedResource | undefined,
): ResourceContent => {
  if (resource === undefined) return UNRESOLVED_CONTENT;
  const targetId = contentTarget(resource);
  if (targetId === undefined) return resolveContentOf(resource, 'self');
  const target = resourceOf(targetId);
  if (target === undefined || !mayBeTarget(target.kind)) return UNRESOLVED_CONTENT;
  return resolveContentOf(target, 'target');
};

/** The facts of content that shows nothing. */
const UNRESOLVED_CONTENT_FACTS: ContentFacts = {
  authored: false,
  embedsMap: false,
  drawsContentArea: true,
};

/** What resolved content lets an author do and how it lays out, as its kind declares (ADR 0114). */
export const contentFacts = (content: ResourceContent): ContentFacts =>
  (content.kind === UNRESOLVED_CONTENT.kind ? undefined : KIND_MODULES[content.kind].facts) ??
  UNRESOLVED_CONTENT_FACTS;

const canonicalContentOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].canonicalContent(resource.content);

/** A Resource with its content as Export writes it, so a file's bytes do not depend on how it was built. */
export const canonicalResource = <R extends KindedResource>(resource: R): R => ({
  ...resource,
  content: canonicalContentOf(resource),
});

/** The kind a Resource is created as when its author chooses none: a new Space's first, the canvas's Add. */
export const DEFAULT_KIND = markdownKind.id;

/** A kind whose module declares the content a new Resource of it starts with, so it may be created empty. */
export type EmptyCreatableKindId = {
  [K in KindId]: Registered[K] extends StartsEmpty<unknown> ? K : never;
}[KindId];

/** Each kind that may be created empty, typed so its new content is its own kind's. */
type EmptyCreatableModules = {
  readonly [K in EmptyCreatableKindId]: StartsEmpty<ContentByKind[K]>;
};

const EMPTY_CREATABLE_MODULES: EmptyCreatableModules = REGISTERED;

const newDocumentOf = <K extends EmptyCreatableKindId>(
  kind: K,
  title: string,
): { [P in K]: { kind: P; title: string; content: ContentByKind[P] } }[K] => ({
  kind,
  title,
  content: EMPTY_CREATABLE_MODULES[kind].newContent,
});

/** A new Resource of this kind with this Title and the content its kind starts with. */
export const newResourceDocument = (kind: EmptyCreatableKindId, title: string): ResourceDocument =>
  newDocumentOf(kind, title);

/** Whether a Resource of this kind may be created empty. */
export const startsEmpty = (kind: KindId): kind is EmptyCreatableKindId =>
  KIND_MODULES[kind].newContent !== undefined;

/** A new Resource of the default kind with this Title, its body empty. */
export const newDefaultResourceDocument = (title: string): ResourceDocument =>
  newResourceDocument(DEFAULT_KIND, title);

const encodeFileContentOf = <K extends KindId>(id: string, resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].file.encode(id, resource.content);

/** The content a Resource's file holds, and the sidecars beside it, by its kind's file codec. */
export const encodeFileContent = (
  resource: Resource,
): { readonly content: unknown; readonly sidecars: readonly KindSidecar[] } =>
  encodeFileContentOf(resource.id, resource);

const decodeFileContentOf = <K extends KindId>(
  id: string,
  file: KindedFile<K>,
  sidecar: (name: string) => string | undefined,
) => KIND_MODULES[file.kind].file.decode(id, file.content, sidecar);

/** A Resource file's content as the document's, read by its kind's file codec through `sidecar`. */
export const decodeFileContent = (
  file: ResourceFileDocument,
  sidecar: (name: string) => string | undefined,
): FileContentDecoding => decodeFileContentOf(file.id, file, sidecar);

/** Every sidecar a Resource with this id could name, whatever its kind, so a refused file still claims its own. */
export const sidecarNames = (id: string): readonly string[] =>
  Object.values(KIND_MODULES).flatMap((module) => module.file.sidecarNames(id));

/**
 * A kind id as ADR 0128 fixes it: a bare id, or a vendor kind's
 * `vnd.<owner>.<name>`, each part ASCII letters, digits and hyphens starting
 * with a letter or digit.
 */
const KIND_ID =
  /^(?:[A-Za-z0-9][A-Za-z0-9-]*|vnd\.[A-Za-z0-9][A-Za-z0-9-]*\.[A-Za-z0-9][A-Za-z0-9-]*)$/u;

/** Whether a value is a well-formed kind id, registered or not. */
export const isKindId = (value: string): boolean => KIND_ID.test(value);
