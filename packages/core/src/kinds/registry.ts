/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import type { Resource, ResourceDocument, UUID } from '../types';
import type { KindFlags } from './kind-module';
import { imageKind } from './image';
import { markdownKind } from './markdown';
import { referenceKind } from './reference';
import { urKind } from './ur';

/**
 * The kinds that are modules (ADR 0128), registered with every build. A kind
 * not yet moved onto its module keeps its own branches and the flags every
 * Resource had before a kind could set them.
 */
const KIND_FLAGS: ReadonlyMap<string, KindFlags> = new Map<string, KindFlags>([
  [urKind.id, urKind.flags],
  [imageKind.id, imageKind.flags],
  [markdownKind.id, markdownKind.flags],
  [referenceKind.id, referenceKind.flags],
]);

const UNMOVED_KIND_FLAGS: KindFlags = {
  takesResourceShape: false,
  canOpen: true,
  mayBeTarget: true,
};

/** The rules a kind declares for every Resource of it. */
export const kindFlags = (kind: string): KindFlags => KIND_FLAGS.get(kind) ?? UNMOVED_KIND_FLAGS;

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
