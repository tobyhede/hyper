/**
 * What `@project/graph` offers.
 *
 * The unit of curation is the module, not the name. A module reaches this index
 * when something outside the package calls into it, and then every type that
 * module exports comes with it — those types are the vocabulary of the calls
 * being made, nameable the moment a consumer wants a variable for one, which is
 * why `GridStrategyOptions`, `LayoutStrategyPort` and `CardFileErrorKind` are here with
 * nothing importing them. Functions are named one at a time: a helper whose
 * only callers are inside the package stays in its module, behind the form
 * consumers do call — `cardIdsForGraphs` behind `graphCardIds` and
 * `filterHandlesByGraph` behind `filterHandlesByGraphs`,
 * `outHandleId`/`inHandleId` behind `buildCardHandles` and
 * `buildGraphRenderEdges`, and `incomingEdges`/`graphEntryCards` behind
 * `graphStartCard`.
 *
 * Two modules are absent whole for that reason and not by oversight.
 * `frontmatter` is how `card-file` reads a fence, and `parseCardFile` is the
 * intake it exists to serve. `validate` runs inside `loadSpace`, which ADR 0010
 * makes the one intake — a caller never checks references itself, so it never
 * names the check, its input or its errors. `SpaceReferenceError` is the edge
 * worth knowing, and not because a union nobody narrows hides it: `loadSpace`
 * returns `SpaceError`, `SpaceError` names it, and `CardFileError` sits in that
 * same union and is offered. Reachability separates nothing; the module each
 * belongs to does. Narrowing `SpaceError` by `kind` still reaches the
 * branch — what a consumer cannot do is write the type's name.
 *
 * `test/unit/graph-package-surface.test.ts` holds this list and the module it
 * produces to the same set of names.
 */

export { parseCardFile, parseImportCardFile, serializeCardFile } from './card-file';
export type {
  CardFile,
  CardFileError,
  CardFileErrorKind,
  ParseCardFileResult,
  ParseImportCardFileResult,
} from './card-file';

export { gridStrategy } from './grid';
export type { GridStrategyOptions } from './grid';

export { buildLayoutStrategyGraph } from './layout';
export type {
  LayoutStrategyCard,
  LayoutStrategyEdge,
  LayoutStrategyEdgeSection,
  LayoutStrategyGraph,
  LayoutStrategyPort,
  LayoutStrategy,
} from './layout';

export { getCard, getLayout, getGraph, resolveContentCard } from './lookup';
export type { ResolvedContentCard } from './lookup';

export { newSpace } from './new-space';
export type { NewSpace } from './new-space';

// One name carrying both the branded map type and the module that builds it.
// Unpacking it would put `fromLayout`, `equals` and `next` in this surface.
export { Placement } from './placement';

export { positionedStrategy } from './positioned';

export {
  buildCardHandles,
  buildGraphRenderEdges,
  filterHandlesByGraphs,
  graphCardIds,
} from './graph-rendering';
export type { CardHandleSet, GraphRenderEdge, GraphRenderHandleRef } from './graph-rendering';

export { loadSpace, loadSpaceSnapshot } from './space';
export type { LoadSpaceResult, LoadSpaceSnapshotResult, Space, SpaceError } from './space';

export { outgoingEdges, graphStartCard } from './traversal';
