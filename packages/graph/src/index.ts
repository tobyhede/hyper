/**
 * What `@project/graph` offers.
 *
 * The unit of curation is the module, not the name. A module reaches this index
 * when something outside the package calls into it, and then every type that
 * module exports comes with it — those types are the vocabulary of the calls
 * being made, nameable the moment a consumer wants a variable for one, which is
 * why `GridStrategyOptions`, `LayoutStrategyPort` and `CardFileErrorKind` are
 * here with nothing importing them. Functions are named one at a time, and a
 * helper no consumer needs to write stays in its module. Usually it sits behind
 * an offered form that calls it — `graphCardIds` calls `cardIdsForGraphs`,
 * `graphStartCard` calls `graphEntryCards`. It runs the
 * other way for `filterHandlesByGraph`, the single-Graph specialisation written
 * on the offered `filterHandlesByGraphs`. And it does not hold at all for
 * `incomingEdges`: nothing calls it but its own test, so it is unoffered for
 * want of a caller rather than behind one, and stays in `traversal` as
 * `outgoingEdges`'s mirror.
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

export { getCard, getLayout, getGraph, getGraphOwner, resolveContentCard } from './lookup';
export type { ResolvedContentCard } from './lookup';

export { newSpace } from './new-space';
export type { NewSpace } from './new-space';

// One name carrying both the branded map type and the module that builds it.
// Unpacking it would put `fromLayout`, `equals` and `next` in this surface.
export { Placement } from './placement';

export { positionedStrategy } from './positioned';

// `inHandleId` and `outHandleId` are offered although no consumer *has* to name
// a handle id: they mint the `<graphId>::out`/`::in` format, and a second
// producer of it is the defect. `react-flow-adapter` declares a handle for a
// Graph not yet incident to a Card, so it needs the format for an id nothing
// here has built yet — one module owns it, and that is what makes the
// prohibition on owner-qualifying a Graph reference checkable by reading one.
export {
  buildCardHandles,
  buildGraphRenderEdges,
  filterHandlesByGraphs,
  graphCardIds,
  inHandleId,
  outHandleId,
} from './graph-rendering';
export type { CardHandleSet, GraphRenderEdge, GraphRenderHandleRef } from './graph-rendering';

// `documentRefusal` is offered although `loadSpace` asks it on every caller's
// behalf: the file importer parses against import schemas that run ahead of
// intake, so it has to ask before they answer. It is offered *composed*, and
// the checks it composes stay private — a caller that could name them
// individually could take some and miss others, which is the defect. Its
// docblock is where that argument lives.
export { documentRefusal, loadSpace, loadSpaceSnapshot } from './space';
export type { LoadSpaceResult, LoadSpaceSnapshotResult, Space, SpaceError } from './space';

export { outgoingEdges, graphStartCard } from './traversal';
