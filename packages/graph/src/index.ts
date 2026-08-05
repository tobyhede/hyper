/**
 * What `@project/graph` offers.
 *
 * Every name a consumer calls, plus the types those signatures make a consumer
 * write down — a parameter, a return shape, or a member of one that is narrowed
 * by name. A helper whose only caller is the module that declares it stays in
 * that module, and so does a type reachable only from inside a result union
 * nobody narrows.
 *
 * Two modules are absent for that reason and not by oversight. `frontmatter` is
 * how `card-file` reads a fence, and `parseCardFile` is the intake it exists to
 * serve. `validate` runs inside `loadSpace`, which ADR 0010 makes the one
 * intake — a caller never checks references itself, so it never names the
 * check, its input or its errors.
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

export { buildLayoutGraph } from './layout';
export type {
  LayoutCard,
  LayoutEdge,
  LayoutEdgeSection,
  LayoutGraph,
  LayoutPort,
  LayoutStrategy,
} from './layout';

export { getCard, getLayout, getRoute, resolveContentCard } from './lookup';
export type { ResolvedContentCard } from './lookup';

export { newSpace } from './new-space';
export type { NewSpace } from './new-space';

// One name carrying both the branded map type and the module that builds it.
// Unpacking it would put `fromLayout`, `equals` and `next` in this surface.
export { Placement } from './placement';

export { positionedStrategy } from './positioned';

export { buildCardHandles, buildRouteEdges, filterHandlesByRoutes, routeCardIds } from './routes';
export type { CardHandleSet, GraphEdge, RouteHandleRef } from './routes';

export { loadSpace, loadSpaceSnapshot } from './space';
export type { LoadSpaceResult, LoadSpaceSnapshotResult, Space, SpaceError } from './space';

export { outgoingEdges, routeStartCard } from './traversal';
