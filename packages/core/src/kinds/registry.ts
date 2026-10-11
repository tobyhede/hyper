/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import type { Resource, ResourceDocument, UUID } from '../types';
import type { KindFlags } from './kind-module';
import { imageKind } from './image';
import { markdownKind } from './markdown';
import { referenceKind } from './reference';
import { spaceKind, type SpaceResourceTarget, type SpaceSelectionProblem } from './space';
import { urKind } from './ur';

/** The kinds, every one a module (ADR 0128), registered with every build. */
const KIND_FLAGS: ReadonlyMap<string, KindFlags> = new Map<string, KindFlags>([
  [urKind.id, urKind.flags],
  [imageKind.id, imageKind.flags],
  [markdownKind.id, markdownKind.flags],
  [referenceKind.id, referenceKind.flags],
  [spaceKind.id, spaceKind.flags],
]);

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
  KIND_FLAGS.get(kind) ?? UNREGISTERED_KIND_FLAGS;

/** A Resource, stored or not: what its kind's declarations are read from. */
type KindedResource = Resource | ResourceDocument;

/** The Resources this Resource's content references, which intake resolves (ADR 0128). */
export const resourceReferences = (resource: KindedResource): readonly UUID[] =>
  resource.kind === referenceKind.id ? referenceKind.resourceReferences(resource.content) : [];

/** The Resource whose content this one shows, when its kind shows another's (ADR 0070). */
export const contentTarget = (resource: KindedResource): UUID | undefined =>
  resource.kind === referenceKind.id ? referenceKind.contentTarget(resource.content) : undefined;

/** Whether a Resource of this kind may be another's Target (ADR 0113). */
export const mayBeTarget = (kind: string): boolean => kindFlags(kind).mayBeTarget;

/** The Spaces this Resource's content references, from which the core enforces cycles and lifetime (ADR 0128). */
export const spaceReferences = (resource: KindedResource): readonly UUID[] =>
  resource.kind === spaceKind.id ? spaceKind.spaceReferences(resource.content) : [];

/** The Spaces whose lifetime this Resource holds: each lives while a reference holds it (ADR 0074). */
export const lifetimeSpaceReferences = (resource: KindedResource): readonly UUID[] =>
  kindFlags(resource.kind).ownsReferencedSpaces ? spaceReferences(resource) : [];

/** Why this Resource's selection does not resolve in its target Space, by its kind's own check. */
export const spaceSelectionProblem = (
  resource: KindedResource,
  target: SpaceResourceTarget,
): SpaceSelectionProblem | undefined =>
  resource.kind === spaceKind.id ? spaceKind.selectionProblem(resource.content, target) : undefined;
