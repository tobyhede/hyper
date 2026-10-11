import type { KindFlags } from './kind-module';
import { urKind } from './ur';

/**
 * The kinds that are modules (ADR 0128), registered with every build. A kind
 * not yet moved onto its module keeps its own branches and the flags every
 * Resource had before a kind could set them.
 */
const KIND_FLAGS: ReadonlyMap<string, KindFlags> = new Map([[urKind.id, urKind.flags]]);

const UNMOVED_KIND_FLAGS: KindFlags = { takesResourceShape: false, canOpen: true };

/** The rules a kind declares for every Resource of it. */
export const kindFlags = (kind: string): KindFlags => KIND_FLAGS.get(kind) ?? UNMOVED_KIND_FLAGS;
