/**
 * What `@project/graph` offers.
 *
 * The unit of curation is the module, not the name. A module reaches this index
 * when something outside the package calls into it, and then every type that
 * module exports comes with it — those types are the vocabulary of the calls
 * being made, nameable the moment a consumer wants a variable for one, which is
 * why `GridStrategyOptions` and `ResourceFileErrorKind` are
 * here with nothing importing them. Functions are named one at a time, and a
 * helper no consumer needs to write stays in its module. Usually it sits behind
 * an offered form that calls it — `graphResourceIds` calls `resourceIdsForGraphs`,
 * `graphStartResource` calls `graphEntryResources`.
 *
 * Two modules are absent whole for that reason and not by oversight.
 * `frontmatter` is how `resource-file` reads a fence, and `parseResourceFile` is the
 * intake it exists to serve. `validate` runs inside `loadSpace`, which ADR 0010
 * makes the one intake — a caller never checks references itself, so it never
 * names the check, its input or its errors. `SpaceReferenceError` is the edge
 * worth knowing, and not because a union nobody narrows hides it: `loadSpace`
 * returns `SpaceError`, `SpaceError` names it, and `ResourceFileError` sits in that
 * same union and is offered. Reachability separates nothing; the module each
 * belongs to does. Narrowing `SpaceError` by `kind` still reaches the
 * branch — what a consumer cannot do is write the type's name.
 *
 * `test/unit/graph-package-surface.test.ts` holds this list and the module it
 * produces to the same set of names.
 */

export { parseResourceFile, parseImportResourceFile, serializeResourceFile } from './resource-file';
export type {
  ResourceFile,
  ResourceFileError,
  ResourceFileErrorKind,
  ParseResourceFileResult,
  ParseImportResourceFileResult,
} from './resource-file';

// The rule for "the same Edge twice in one Graph" (ADR 0032).
export { repeatedGraphEdges } from './graph-edges';

// The palette and the rule that picks from it. `graphColorDistance` stays in its
// module: it is the rule's measure, named by the module's own tests and by no
// caller, which asks `nextGraphColor` instead.
export {
  GRAPH_PALETTE,
  GRAPH_PALETTE_ENTRIES,
  graphColorsByGraphId,
  nextGraphColor,
} from './graph-color';

export { gridStrategy } from './grid';
export type { GridStrategyOptions } from './grid';

export { buildLayoutStrategyGraph } from './layout';
export type {
  LayoutStrategyResource,
  LayoutStrategyEdge,
  LayoutStrategyGraph,
  LayoutStrategy,
} from './layout';

// `resolveContentResource` is the only function here: identity lookup is reached
// through `space.lookup`, which the Space carries.
export { resolveContentResource } from './lookup';
export type { OwnedGraph, ResolvedContentResource, ResolvedMap, SpaceLookup } from './lookup';

export { initializeSpace, newGraph, newSpace } from './new-space';
export type { InitializeSpaceOptions, NewSpace } from './new-space';

// One name carrying both the branded map type and the module that builds it.
// Unpacking it would put `fromMap`, `equals` and `next` in this surface.
export { Placement } from './placement';

export { positionedStrategy } from './positioned';

// Same shape as `Placement`: one name carrying both the operations and the
// module that builds them, offered with its outcome and refusal types since a
// caller has to write both down to handle what an operation answers.
export { SnapshotEdit } from './snapshot-edits';
export type { SnapshotEditOutcome, SnapshotEditRefusal } from './snapshot-edits';

// `graphRenderEdgeId` is offered although no consumer *has* to name an Edge id:
// it mints the `<graphId>::<from>::<to>` format, and a second producer of it is
// the defect. A test outside this package that stands a projected Edge up by
// hand mints its id here rather than spelling the format out.
export { buildGraphRenderEdges, graphResourceIds, graphRenderEdgeId } from './graph-rendering';
export type { GraphRenderEdge } from './graph-rendering';

// `documentRefusal` is offered although `loadSpace` asks it on every caller's
// behalf: the file importer parses against import schemas that run ahead of
// intake, so it has to ask before they answer. It is offered *composed*, and
// the checks it composes stay private — a caller that could name them
// individually could take some and miss others, which is the defect. Its
// docblock is where that argument lives.
export { documentRefusal, loadSpace, loadSpaceSnapshot } from './space';
export type { LoadSpaceResult, LoadSpaceSnapshotResult, Space, SpaceError } from './space';

export { loadSpaceAggregate } from './space-aggregate';
export type {
  LoadSpaceAggregateInput,
  LoadSpaceAggregateResult,
  SpaceAggregate,
  SpaceAggregateError,
  SpaceAggregateLookup,
} from './space-aggregate';

export { outgoingEdges, graphStartResource } from './traversal';
