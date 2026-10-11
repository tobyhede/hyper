/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import type { KindFlags } from './kind-module';
import { imageKind } from './image';
import { markdownKind } from './markdown';
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
]);

const UNMOVED_KIND_FLAGS: KindFlags = { takesResourceShape: false, canOpen: true };

/** The rules a kind declares for every Resource of it. */
export const kindFlags = (kind: string): KindFlags => KIND_FLAGS.get(kind) ?? UNMOVED_KIND_FLAGS;
