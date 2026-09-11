/**
 * What `@project/graph` offers.
 *
 * The unit of curation is the module, not the name. A module reaches this index
 * when something outside the package calls into it, and then every type that
 * module exports comes with it — those types are the vocabulary of the calls
 * being made, nameable the moment a consumer wants a variable for one, which is
 * why `GridStrategyOptions` and `ThingFileErrorKind` are
 * here with nothing importing them. Functions are named one at a time, and a
 * helper no consumer needs to write stays in its module. Usually it sits behind
 * an offered form that calls it — `graphThingIds` calls `thingIdsForGraphs`,
 * `graphStartThing` calls `graphEntryThings`.
 *
 * Two modules are absent whole for that reason and not by oversight.
 * `frontmatter` is how `thing-file` reads a fence, and `parseThingFile` is the
 * intake it exists to serve. `validate` runs inside `loadSpace`, which ADR 0010
 * makes the one intake — a caller never checks references itself, so it never
 * names the check, its input or its errors. `SpaceReferenceError` is the edge
 * worth knowing, and not because a union nobody narrows hides it: `loadSpace`
 * returns `SpaceError`, `SpaceError` names it, and `ThingFileError` sits in that
 * same union and is offered. Reachability separates nothing; the module each
 * belongs to does. Narrowing `SpaceError` by `kind` still reaches the
 * branch — what a consumer cannot do is write the type's name.
 *
 * `test/unit/graph-package-surface.test.ts` holds this list and the module it
 * produces to the same set of names.
 */

export { parseThingFile, parseImportThingFile, serializeThingFile } from './thing-file';
export type {
  ThingFile,
  ThingFileError,
  ThingFileErrorKind,
  ParseThingFileResult,
  ParseImportThingFileResult,
} from './thing-file';

// The rule for "the same Edge twice in one Graph" (ADR 0032).
export { repeatedGraphEdges } from './graph-edges';

export { gridStrategy } from './grid';
export type { GridStrategyOptions } from './grid';

export { buildLayoutStrategyGraph } from './layout';
export type {
  LayoutStrategyThing,
  LayoutStrategyEdge,
  LayoutStrategyGraph,
  LayoutStrategy,
} from './layout';

// `resolveContentThing` is the only function here: identity lookup is reached
// through `space.lookup`, which the Space carries, so the shallow `get*` pairs
// that used to sit beside it have no callers left to name.
export { resolveContentThing } from './lookup';
export type { OwnedGraph, ResolvedContentThing, ResolvedDiagram, SpaceLookup } from './lookup';

export { initializeSpace, newSpace } from './new-space';
export type { InitializeSpaceOptions, NewSpace } from './new-space';

// One name carrying both the branded map type and the module that builds it.
// Unpacking it would put `fromDiagram`, `equals` and `next` in this surface.
export { Placement } from './placement';

export { positionedStrategy } from './positioned';

// `graphRenderEdgeId` is offered although no consumer *has* to name an Edge id:
// it mints the `<graphId>::<from>::<to>` format, and a second producer of it is
// the defect. A test outside this package that stands a projected Edge up by
// hand was spelling the format out, which is exactly that.
//
// The per-Graph handle family that stood beside it — `buildThingHandles`,
// `filterHandlesByGraphs`, `inHandleId`, `outHandleId` and the two types they
// were written in — left with ADR 0087. An Edge names no handle now, and the
// anchor it attaches to is chosen while it is drawn.
export { buildGraphRenderEdges, graphThingIds, graphRenderEdgeId } from './graph-rendering';
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

export { outgoingEdges, graphStartThing } from './traversal';
