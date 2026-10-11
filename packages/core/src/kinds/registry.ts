import type { ContentFacts, ContentVia, ResourceContent } from '../resource-content';
import type { Resource, ResourceDocument, ResourceFileDocument, UUID } from '../types';
import type { FileContentDecoding, KindFlags, KindModule, KindSidecar } from './kind-module';
/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { imageKind } from './image';
import { EMPTY_MARKDOWN, markdownKind } from './markdown';
import { UNRESOLVED_CONTENT, referenceKind } from './reference';
import type { SpaceResourceTarget, SpaceSelectionProblem } from './space';
import { spaceKind } from './space';
import { urKind } from './ur';

/** A Resource kind's id. */
export type KindId = Resource['kind'];

/** Each kind's document content, by its id. */
type ContentByKind = { [D in ResourceDocument as D['kind']]: D['content'] };
/** Each kind's Resource file content, by its id. */
type FileContentByKind = { [D in ResourceFileDocument as D['kind']]: D['content'] };

/** Each kind's module, typed so a rule over a kinded value calls its own kind's module. */
type KindModules = {
  readonly [K in KindId]: KindModule<K, ContentByKind[K], FileContentByKind[K]>;
};

/** A kinded value whose content is its kind's, correlated so its module accepts it. */
type Kinded<K extends KindId> = {
  [P in K]: { readonly kind: P; readonly content: ContentByKind[P] };
}[K];

/** A Resource file whose content is its kind's file content, correlated so its module's codec accepts it. */
type KindedFile<K extends KindId> = {
  [P in K]: { readonly kind: P; readonly content: FileContentByKind[P] };
}[K];

/** The kinds, every one a module (ADR 0128), registered with every build: the one place each is named. */
const KIND_MODULES: KindModules = {
  [urKind.id]: urKind,
  [imageKind.id]: imageKind,
  [markdownKind.id]: markdownKind,
  [referenceKind.id]: referenceKind,
  [spaceKind.id]: spaceKind,
};

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
