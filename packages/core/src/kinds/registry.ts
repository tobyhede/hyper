import type { z } from 'zod';
import type { ContentFacts, ContentVia } from '../resource-content';
import type { uuidSchema } from '../uuid';
import type { FileContentDecoding, KindFlags, KindModule, KindSidecar } from './kind-module';
/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { imageKind } from './image';
import { EMPTY_MARKDOWN, markdownKind } from './markdown';
import { UNRESOLVED_CONTENT, referenceKind } from './reference';
import type { SpaceResourceTarget, SpaceSelectionProblem } from './space';
import { spaceKind } from './space';
import { urKind } from './ur';

type UUID = z.output<typeof uuidSchema>;

/** The kinds, every one a module (ADR 0128), registered with every build: the one place each is named. */
const REGISTERED = {
  [urKind.id]: urKind,
  [imageKind.id]: imageKind,
  [markdownKind.id]: markdownKind,
  [referenceKind.id]: referenceKind,
  [spaceKind.id]: spaceKind,
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

const contentParserOf = <K extends KindId>(kind: K): KindedParser<Kinded<K>> =>
  KIND_MODULES[kind].contentSchema.transform((content) => ({ kind, content }));

/** The one parser of a Resource's `content` (ADR 0128): its kind's module's schema. */
export const contentParser = (kind: KindId): KindedParser<Kinded<KindId>> => contentParserOf(kind);

const fileContentParserOf = <K extends KindId>(kind: K): KindedParser<KindedFile<K>> =>
  KIND_MODULES[kind].file.contentSchema.transform((content) => ({ kind, content }));

/** The parser of a Resource file's `content`: its kind's file codec's schema. */
export const fileContentParser = (kind: KindId): KindedParser<KindedFile<KindId>> =>
  fileContentParserOf(kind);

/**
 * A Resource (ADR 0128): the core's envelope, `id`, `title` and `kind`, and
 * the content its kind's module parses. Typed from the registry, so a kind is
 * declared in its module and listed once above, and nowhere else.
 */
export type Resource = {
  [K in KindId]: { id: UUID; title: string; kind: K; content: ContentByKind[K] };
}[KindId];

/** A stored Resource document: a Resource less its id, which is stored beside it. */
export type ResourceDocument = {
  [K in KindId]: { title: string; kind: K; content: ContentByKind[K] };
}[KindId];

/** A Resource file as intake reads it (ADR 0128): the envelope, with its kind's file content. */
export type ResourceFileDocument = {
  [K in KindId]: { id: UUID; title: string; kind: K; content: FileContentByKind[K] };
}[KindId];

/**
 * What a Resource's content is, as its kind resolves it. `unresolved` answers
 * only states intake refuses: a Reference Resource whose Target is missing or
 * may not be one.
 */
export type ResourceContent = ResolvedByKind[KindId] | typeof UNRESOLVED_CONTENT;

/** Every registered kind's id, in registration order. */
export const KIND_IDS: readonly KindId[] = Object.values(KIND_MODULES).map(({ id }) => id);

/** Whether a module registers this kind with this build. */
export const isRegisteredKind = (kind: string): kind is KindId =>
  KIND_IDS.some((registered) => registered === kind);

/**
 * The flags of a kind no module registers: every Resource kind is registered,
 * so intake has refused such a Resource before a rule asks, and this answers
 * as the most constrained kind would.
 */
const UNREGISTERED_KIND_FLAGS: KindFlags = {
  takesResourceShape: false,
  canOpen: false,
  mayBeTarget: false,
  ownsReferencedSpaces: false,
};

/** The rules a kind declares for every Resource of it. */
export const kindFlags = (kind: string): KindFlags =>
  isRegisteredKind(kind) ? KIND_MODULES[kind].flags : UNREGISTERED_KIND_FLAGS;

/** A Resource, stored or not: what its kind's declarations are read from. */
type KindedResource = Kinded<KindId>;

const resourceReferencesOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].resourceReferences(resource.content);

/** The Resources this Resource's content references, which intake resolves (ADR 0128). */
export const resourceReferences = (resource: KindedResource): readonly UUID[] =>
  resourceReferencesOf(resource);

const contentTargetOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].contentTarget(resource.content);

/** The Resource whose content this one shows, when its kind shows another's (ADR 0070). */
export const contentTarget = (resource: KindedResource): UUID | undefined =>
  contentTargetOf(resource);

/** Whether a Resource of this kind may be another's Target (ADR 0113). */
export const mayBeTarget = (kind: string): boolean => kindFlags(kind).mayBeTarget;

const spaceReferencesOf = <K extends KindId>(resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].spaceReferences(resource.content);

/** The Spaces this Resource's content references, from which the core enforces cycles and lifetime (ADR 0128). */
export const spaceReferences = (resource: KindedResource): readonly UUID[] =>
  spaceReferencesOf(resource);

/** The Spaces whose lifetime this Resource holds: each lives while a reference holds it (ADR 0074). */
export const lifetimeSpaceReferences = (resource: KindedResource): readonly UUID[] =>
  kindFlags(resource.kind).ownsReferencedSpaces ? spaceReferences(resource) : [];

const selectionProblemOf = <K extends KindId>(resource: Kinded<K>, target: SpaceResourceTarget) =>
  KIND_MODULES[resource.kind].selectionProblem(resource.content, target);

/** Why this Resource's selection does not resolve in its target Space, by its kind's own check. */
export const spaceSelectionProblem = (
  resource: KindedResource,
  target: SpaceResourceTarget,
): SpaceSelectionProblem | undefined => selectionProblemOf(resource, target);

const resolveContentOf = <K extends KindId>(resource: Kinded<K>, via: ContentVia) =>
  KIND_MODULES[resource.kind].resolveContent(resource.content, via);

/**
 * What a Resource draws as its content, with at most one Target lookup: its
 * own, or the Target's its kind shows (ADR 0070). A missing Resource, a missing
 * Target and a Target that may not be one are the states intake refuses, and
 * resolve as the Reference kind says a Target it cannot reach does.
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
  return resolveContentOf(target, referenceKind.id);
};

/** The facts of content that shows nothing. */
const UNRESOLVED_CONTENT_FACTS: ContentFacts = {
  action: 'none',
  embedsMap: false,
  drawsContentArea: true,
};

/** What resolved content lets an author do and how it lays out, as its kind declares (ADR 0114). */
export const contentFacts = (content: ResourceContent): ContentFacts =>
  (content.kind === 'unresolved' ? undefined : KIND_MODULES[content.kind].facts) ??
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

/** A new Resource of the default kind with this Title, its body empty. */
export const newDefaultResourceDocument = (title: string): ResourceDocument => ({
  title,
  kind: DEFAULT_KIND,
  content: EMPTY_MARKDOWN,
});

const newDocumentOf = <K extends KindId>(
  kind: K,
  title: string,
): { [P in K]: { kind: P; title: string; content: ContentByKind[P] } }[K] | undefined => {
  const content = KIND_MODULES[kind].newContent;
  return content === undefined ? undefined : { kind, title, content };
};

/** A new Resource of this kind with this Title and the content its kind starts with, when it may be created empty. */
export const newResourceDocument = (kind: KindId, title: string): ResourceDocument | undefined =>
  newDocumentOf(kind, title);

const encodeFileContentOf = <K extends KindId>(id: string, resource: Kinded<K>) =>
  KIND_MODULES[resource.kind].file.encode(id, resource.content);

/** The content a Resource's file holds, and the sidecars beside it, by its kind's file codec (ADR 0128). */
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
