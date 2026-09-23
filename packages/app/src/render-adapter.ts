import {
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodePositionChange,
} from '@xyflow/react';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { ResourceId, GraphEdge, GraphId, MapPosition } from '@project/core';
import { Placement } from '@project/graph';
import {
  ROUTED_EDGE_TYPE,
  type ResourceFlowNode,
  type RoutedEdgeData,
} from '@project/react-flow-adapter';
import { snapResourceSizeToClose } from './resource';
import type { SpaceAuthoring } from './space-authoring';

/**
 * The render adapter owns React Flow's transient projection. Space Authoring
 * derives the Map's completed placement fresh, on demand, rather than
 * holding one.
 *
 * Live nodes absorb every intermediate React Flow change so controlled dragging
 * follows the pointer, and they are published together with the Graph Edges
 * drawn against them. `dragOrigins` retains gesture starts across React Flow's
 * separate moving and settled callbacks.
 */

/**
 * One render's worth of React Flow input. The nodes carry the declared handles
 * an Edge attaches to, so the two are published as a single value rather than as
 * two fields written in step: an Edge can then never be on screen in a frame
 * whose nodes do not yet declare its handles, and no partial write exists to
 * make it so.
 */
export interface Projection {
  readonly nodes: ResourceFlowNode[];
  readonly edges: Edge[];
}

export interface ResizeDraft {
  readonly resourceId: ResourceId;
  readonly size: { readonly width: number; readonly height: number };
  readonly placement: Placement;
}

export interface ResourceResize {
  beginResize: (resourceId: ResourceId) => void;
  previewResize: (
    resourceId: ResourceId,
    size: { readonly width: number; readonly height: number },
  ) => void;
  finishResize: (resourceId: ResourceId) => void;
  cancelResize: (resourceId: ResourceId) => void;
}

/**
 * One Edge, named the way everything that acts on an Edge has to name it.
 *
 * A Graph and an Edge travel together through every Edge operation — selecting,
 * reconnecting, deleting, opening an editor, offering endpoint choices — because
 * neither identifies an Edge alone: an Edge is `{ from, to }` and says nothing
 * about which Graph draws it, and a Graph holds many. Passing them as two
 * arguments meant every callee re-paired what its caller had just split.
 *
 * It is the **domain** Edge and its owning Graph, never the React Flow edge id.
 * A Graph cannot hold the same pair twice (ADR 0032), so this names exactly one
 * Edge for as long as that Edge exists — and names nothing, harmlessly, once it
 * does not.
 *
 * The projected id (`<graphId>::<from>::<to>`, minted by `buildGraphRenderEdges`)
 * is now built from that same triple, so the two agree about what identifies an
 * Edge. They did not always: the id named the Edge's *position* in its Graph and
 * re-indexed whenever a Graph lost an Edge, so a subject held by id would have
 * survived a deletion pointing at whichever Edge slid into the vacated slot.
 * Holding the domain value is still the rule — the id is React Flow's business
 * and this module's subject is the domain's — but the agreement is what stops a
 * replaced Edge inheriting the element its predecessor was drawn as.
 */
export interface EdgeSubject {
  readonly graphId: GraphId;
  readonly edge: GraphEdge;
}

/**
 * What the canvas has selected — one subject of one kind, never two.
 *
 * Discriminated rather than a pair of nullable fields, because "a Resource and an
 * Edge are both selected" is not a state React Flow produces once modifier
 * multi-selection and the selection rectangle are off, and a shape that can
 * express it invites a second mutual-exclusion policy beside React Flow's own.
 */
export type CanvasSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'resource'; readonly resourceId: ResourceId }
  | ({ readonly kind: 'edge' } & EdgeSubject);

export const NO_SELECTION: CanvasSelection = { kind: 'none' };

/** Whether two subjects name the same Edge of the same Graph. */
export const sameEdgeSubject = (left: EdgeSubject, right: EdgeSubject): boolean =>
  left.graphId === right.graphId &&
  left.edge.from === right.edge.from &&
  left.edge.to === right.edge.to;

/** Whether two selections name the same subject. */
export function sameSelection(left: CanvasSelection, right: CanvasSelection): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'resource') {
    // SAFETY: the `left.kind !== right.kind` guard above already confirmed
    // the two share a discriminant, so `right` is the resource variant too even
    // though narrowing `left` here doesn't propagate to `right`.
    return left.resourceId === (right as { resourceId: ResourceId }).resourceId;
  }
  if (left.kind === 'edge') {
    // SAFETY: same discriminant-equality guard as above, for the edge variant.
    return sameEdgeSubject(left, right as EdgeSelection);
  }
  return true;
}

/** The selected Resource, for the projection's own emphasis. */
export const selectedResourceOf = (selection: CanvasSelection): ResourceId | null =>
  selection.kind === 'resource' ? selection.resourceId : null;

/** The Edge subject alone, so a caller that only handles Edges need not narrow. */
export type EdgeSelection = Extract<CanvasSelection, { kind: 'edge' }>;

/**
 * The domain Edge behind a projected React Flow Edge, or `null` for any Edge
 * that is not of the routed type — the one type only the canvas projection
 * writes, from Resource ids. An embedded Map's Edges are minted under their own
 * type (`EMBEDDED_EDGE_TYPE`), so they never convert.
 *
 * The **one** place that translation happens. Every surface that acts on an Edge
 * needs it — the selection mirror here, the decoration and callbacks in Edge
 * Authoring, the toolbar inside the Edge itself — and three hand-rolled copies
 * would be three chances to widen `source` and `target` differently.
 */
export function edgeSelectionOf(edge: Edge): EdgeSelection | null {
  if (edge.type !== ROUTED_EDGE_TYPE) return null;
  // SAFETY: only the canvas projection writes `ROUTED_EDGE_TYPE`, and it always
  // writes it with `RoutedEdgeData` and Resource-id endpoints, so a routed Edge's
  // `data` and endpoints are those. An embedded Map's Edges, whose endpoints are
  // another Space's (ADR 0068), are minted under `EMBEDDED_EDGE_TYPE` instead —
  // held by embedded-map.test.ts, 'mints its Edges as its own type, which never
  // converts to an Edge selection'.
  return {
    kind: 'edge',
    graphId: (edge.data as RoutedEdgeData).graphId,
    edge: { from: edge.source as ResourceId, to: edge.target as ResourceId },
  };
}

/**
 * Mark exactly the selected Resource's node, and only when that is what is selected.
 *
 * The union is authoritative for React Flow's own node selection, not merely a
 * mirror of it. Selecting an Edge has to clear the Resource React Flow still holds
 * selected — otherwise the Delete key, which reads `nodes.filter(selected)` from
 * the controlled arrays, would delete a Resource the author never named.
 */
function withSelection(
  nodes: readonly ResourceFlowNode[],
  selection: CanvasSelection,
): ResourceFlowNode[] {
  const selectedResourceId = selectedResourceOf(selection);
  return nodes.map((node) =>
    node.selected === (node.id === selectedResourceId)
      ? node
      : { ...node, selected: node.id === selectedResourceId },
  );
}

export interface RenderAdapterState {
  /**
   * The four resize operations as one value, minted with the store and never
   * written again.
   *
   * A field rather than four operations on the state, because the canvas holds
   * this across a live gesture: it is a dependency of the memo that builds every
   * node's data, and React Flow's resize control tears down and re-registers its
   * drag handler whenever the callbacks built from it change identity. Zustand
   * merges every partial into a fresh state object, so a state that *was* a
   * `ResourceResize` handed the canvas a new capability after every selection,
   * projection and drag frame — writes resize knows nothing about. Naming the
   * capability separately is also what stops the whole state being passed as
   * one.
   */
  readonly resourceResize: ResourceResize;
  /**
   * The published projection, or `null` before the first layout resolves. Until
   * then there is nothing worth owning — every projected resource sits at the origin
   * — and a space is correspondingly not editable for that frame.
   */
  projection: Projection | null;
  /** Gesture starts retained until each node receives a settled callback. */
  dragOrigins: ReadonlyMap<string, MapPosition>;
  /** The ordinary React Flow selection used for continued authoring. */
  selection: CanvasSelection;
  /** One transient resize layered over the authored Placement. */
  resizeDraft: ResizeDraft | null;
  /**
   * Whether some embedded Map on this canvas is running a Resource edit.
   *
   * The one Interaction fact this store holds that it does not itself produce.
   * A Space Resource draws another Space's Map inside this one, and an edit
   * begun in there withdraws authoring from the canvas around it
   * (`authoring-availability.ts`'s `editingEmbeddedMap`). It begins and ends
   * inside the canvas subtree, so it has to be published to be read above it —
   * and it is published *here*, beside `resizeDraft`, because both are drafts
   * of one canvas gesture and because this store re-renders the Space's command
   * surface and the canvas together. A callback prop into the composition root
   * would report it an effect late instead.
   *
   * The aggregate only. Which embedding holds the edit is a question about a
   * Resource of that canvas and is answered where the Resources are.
   */
  editingEmbeddedMap: boolean;
  /** Publish projected Resource nodes, their declared handles and Graph Edges together. */
  syncProjection: (nodes: readonly ResourceFlowNode[], edges: readonly Edge[]) => void;
  /**
   * Navigate to another Map: reset this canvas's projection and drag
   * state. The new Map's geometry arrives via the next `syncProjection`;
   * Map selection itself is not an Edit.
   */
  selectMap: () => void;
  /** Apply React Flow's own changes (drag, measure, select). */
  changeNodes: (changes: NodeChange<ResourceFlowNode>[]) => void;
  /**
   * Apply React Flow's Edge changes — selection, and nothing else.
   *
   * Every structural Edge change is a completed Space Edit that arrives through
   * the next projection, so a `remove` or `replace` reaching here would be React
   * Flow proposing a local mutation with no Edit behind it. Selection is the one
   * kind this store owns.
   */
  changeEdges: (changes: EdgeChange<Edge>[]) => void;
  /**
   * Report whether any embedded Map on this canvas is now running an edit.
   *
   * A report of what the canvas currently holds rather than of a transition, so
   * an unchanged answer publishes nothing: this store's subscribers include
   * every reader of the projection, and none of them has seen this change.
   */
  reportEmbeddedMapEditing: (editing: boolean) => void;
  /** Select one Resource after a completed connection. */
  selectResource: (resourceId: ResourceId) => void;
  /**
   * Select one Edge — the focus-to-selection bridge React Flow does not supply.
   *
   * Focusing an Edge does not select it in React Flow, so a keyboard author who
   * Tabs to an Edge and presses Delete would act on whatever was selected
   * before. Installing the focused Edge here is what makes the two agree.
   */
  selectEdge: (subject: EdgeSubject) => void;
  /** Drop the selection when its subject is no longer worth naming. */
  clearSelection: () => void;
  /**
   * The Placement the live nodes are currently drawn at, or `null` before the
   * first placement resolves.
   *
   * The one caller is Edge Authoring's connection completion, asked ahead of
   * completing a connect or create-and-connect: `null` means nothing has
   * rendered yet, so there is nothing on screen to draw the new Edge against.
   */
  renderedPlacement: () => Placement | null;
  /**
   * Fold a freshly projected node list into the live one, so an Edit's own Edge
   * draws without waiting for a strategy to resolve.
   *
   * Separate from `syncProjection` because the completion that calls it has
   * already written its own geometry into the Map, and this is the render
   * path catching up to it rather than the render path publishing something new.
   */
  mergeProjected: (projected: readonly ResourceFlowNode[]) => void;
}

export type RenderAdapter = UseBoundStore<StoreApi<RenderAdapterState>>;

/**
 * Reduce the drawn nodes to a `Placement` of what is currently on screen, keyed
 * by each node's typed `data.resourceId` rather than its React Flow id. Read by
 * `renderedPlacement`, the "is anything on screen yet" question Edge Authoring
 * asks before completing a connection.
 */
function placementFromNodes(nodes: readonly ResourceFlowNode[]): Placement {
  return Placement.fromEntries(nodes.map((node) => [node.data.resourceId, node.position]));
}

function trackDragOrigins(
  dragOrigins: globalThis.Map<string, MapPosition>,
  positionChanges: readonly NodePositionChange[],
  beforeById: ReadonlyMap<string, MapPosition>,
): void {
  for (const change of positionChanges) {
    if (change.dragging !== true || dragOrigins.has(change.id)) continue;
    const origin = beforeById.get(change.id);
    if (origin !== undefined) dragOrigins.set(change.id, { x: origin.x, y: origin.y });
  }
}

/**
 * The moved Resources' own drop points, exactly: which settled changes actually
 * ended somewhere other than where the drag began, and where.
 *
 * Each change is keyed through `owned`, the host nodes' own identities, so a
 * change for a node this store does not draw contributes nothing.
 *
 * Answers the drop points directly rather than a list of ids — Authoring now
 * merges these over the Map's own positions at derivation, so there is no
 * second lookup back into `nodes` for a caller to get wrong.
 */
function consumeSettledMoves(
  settled: readonly NodePositionChange[],
  owned: ReadonlyMap<string, ResourceId>,
  dragOrigins: globalThis.Map<string, MapPosition>,
  beforeById: ReadonlyMap<string, MapPosition>,
  afterById: ReadonlyMap<string, MapPosition>,
): ReadonlyMap<ResourceId, MapPosition> {
  const moved = new Map<ResourceId, MapPosition>();
  for (const change of settled) {
    const origin = dragOrigins.get(change.id) ?? beforeById.get(change.id);
    const after = afterById.get(change.id);
    const resourceId = owned.get(change.id);
    dragOrigins.delete(change.id);
    if (
      resourceId !== undefined &&
      origin !== undefined &&
      after !== undefined &&
      (origin.x !== after.x || origin.y !== after.y)
    ) {
      moved.set(resourceId, after);
    }
  }
  return moved;
}

/**
 * Fold the freshly projected nodes into the live list. A resource that survives
 * keeps its React Flow runtime state while refreshing the geometry and domain
 * presentation the projection owns. Position is the one exception during an
 * active drag: the pointer's live position wins until the settled change authors
 * it. Mapping over `projected` also drops nodes whose resource no longer exists.
 */
function reconcile(
  current: readonly ResourceFlowNode[],
  projected: readonly ResourceFlowNode[],
  dragOrigins: ReadonlyMap<string, MapPosition>,
): ResourceFlowNode[] {
  const byId = new Map(current.map((node) => [node.id, node]));
  return projected.map((node) => {
    const live = byId.get(node.id);
    if (!live) return node;
    // The projection owns authored position, declared size, stacking, data,
    // className and handles. The live node owns React Flow's measured and gesture
    // bookkeeping. An active drag alone keeps its live position: replacing it
    // would jump the Resource away from the pointer mid-gesture. `handles` must come
    // through: React Flow builds `handleBounds`
    // from the declaration rather than measuring the DOM (docs/agents/rendering.md), so a live
    // node that kept a stale set would resolve a new Edge against the handles the
    // Resource had before it gained one. `handles`/`className` are assigned only when
    // the projection sets them, for `exactOptionalPropertyTypes`; the projection
    // always sets a className.
    const merged: ResourceFlowNode = {
      ...live,
      position: dragOrigins.has(node.id) ? live.position : node.position,
      data: node.data,
    };
    if (node.width === undefined) delete merged.width;
    else merged.width = node.width;
    if (node.height === undefined) delete merged.height;
    else merged.height = node.height;
    if (node.zIndex === undefined) delete merged.zIndex;
    else merged.zIndex = node.zIndex;
    if (node.handles !== undefined) merged.handles = node.handles;
    if (node.className !== undefined) merged.className = node.className;
    return merged;
  });
}

/** A React Flow selection change, whichever element kind reported it. */
type SelectChange = { readonly id: string; readonly selected: boolean };

function selectChanges(
  changes: readonly (NodeChange<ResourceFlowNode> | EdgeChange<Edge>)[],
): SelectChange[] {
  return changes.filter(
    (change): change is SelectChange & { type: 'select' } => change.type === 'select',
  );
}

/**
 * Fold React Flow's selection changes into the union, additively.
 *
 * **One selection action produces two batches**, and the order is the whole
 * reason this is not `changes.find(selected) ?? none`. React Flow first selects
 * the new subject and then deselects the other kind, so reading the last change
 * would answer `none` for a click that plainly selected something. Additively:
 * a `selected: true` change installs its subject, and a `selected: false` change
 * clears the union only when it names the subject *currently* stored. The
 * cross-kind deselection then finds a union that has already moved on, and
 * leaves it alone.
 */
function additiveSelection(
  current: CanvasSelection,
  changes: readonly { readonly subject: CanvasSelection; readonly selected: boolean }[],
): CanvasSelection {
  let selection = current;
  for (const change of changes) {
    if (change.selected) selection = change.subject;
    else if (sameSelection(selection, change.subject)) selection = NO_SELECTION;
  }
  return selection;
}

/** Install a selection made outside React Flow's change stream. */
function selecting(
  state: RenderAdapterState,
  selection: CanvasSelection,
): Pick<RenderAdapterState, 'selection' | 'projection'> {
  return {
    selection,
    projection:
      state.projection === null
        ? null
        : { ...state.projection, nodes: withSelection(state.projection.nodes, selection) },
  };
}

export type RenderAdapterAuthoring = Pick<
  SpaceAuthoring,
  'mapPlacement' | 'complete' | 'getState' | 'subscribe'
>;

export function createRenderAdapter(authoring: RenderAdapterAuthoring): RenderAdapter {
  const adapter = create<RenderAdapterState>((set, get) => ({
    projection: null,
    dragOrigins: new Map(),
    selection: NO_SELECTION,
    resizeDraft: null,
    editingEmbeddedMap: false,

    // Written once, here, and by nothing after: every `set` below merges a
    // partial, so this reference is what the canvas keeps holding.
    resourceResize: {
      beginResize: (resourceId) => {
        const placement = authoring.mapPlacement();
        const at = placement.get(resourceId);
        if (at?.open !== true) return;
        set({ resizeDraft: { resourceId, size: at.openSize, placement } });
      },

      previewResize: (resourceId, size) => {
        const draft = get().resizeDraft;
        if (draft?.resourceId !== resourceId) return;
        const at = draft.placement.get(resourceId);
        if (at?.open !== true) return;
        const proposedSize = snapResourceSizeToClose(size);
        set({
          resizeDraft: {
            resourceId,
            size: proposedSize,
            placement: Placement.place(draft.placement, resourceId, {
              ...at,
              openSize: proposedSize,
            }),
          },
        });
      },

      finishResize: (resourceId) => {
        const draft = get().resizeDraft;
        if (draft?.resourceId !== resourceId) return;
        authoring.complete({ kind: 'resized-resource', resourceId, size: draft.size });
        set({ resizeDraft: null });
      },

      cancelResize: (resourceId) => {
        if (get().resizeDraft?.resourceId === resourceId) set({ resizeDraft: null });
      },
    },

    syncProjection: (nodes, edges) => {
      const current = get().projection;
      // The empty list rather than a separate branch for the first projection:
      // it too may be the one that first draws a Resource already selected, since
      // `selectMap` clears the projection and a selection can be made
      // before the next one lands.
      //
      // `withSelection` over the reconciled list is what seeds a Resource the live
      // list has never seen. A projection carries no selection of its own —
      // `projectResourceNodes` sets `data.selectedForAuthoring` and never the node's
      // `selected` — and `reconcile` has nothing to preserve for a Resource that is
      // new, so without this the union and React Flow disagree from the first
      // frame. Authoring selects a Resource in the same tick it creates it, one
      // render *before* the projection that first draws it: `selectResource` maps
      // over the nodes it can see and the new one is not among them yet. The
      // Resource then reads as selected on screen, since `selectedForAuthoring` is
      // right, while React Flow holds no selected node at all — and `F2` asks
      // React Flow, so `F2` is what stops working until a click repairs it.
      // Add Resource, Add Reference Resource and create-and-connect all land here.
      const state = get();
      const reconciled = withSelection(
        reconcile(current?.nodes ?? [], nodes, state.dragOrigins),
        state.selection,
      );
      set({ projection: { nodes: reconciled, edges: [...edges] } });
    },

    selectMap: () => {
      set({
        projection: null,
        dragOrigins: new Map(),
        selection: NO_SELECTION,
        resizeDraft: null,
      });
    },

    reportEmbeddedMapEditing: (editing) => {
      if (get().editingEmbeddedMap !== editing) set({ editingEmbeddedMap: editing });
    },

    selectResource: (resourceId) =>
      set((state) => selecting(state, { kind: 'resource', resourceId })),

    selectEdge: ({ graphId, edge }) =>
      set((state) => selecting(state, { kind: 'edge', graphId, edge })),

    clearSelection: () => set((state) => selecting(state, NO_SELECTION)),

    renderedPlacement: () => {
      const projection = get().projection;
      return projection === null ? null : placementFromNodes(projection.nodes);
    },

    mergeProjected: (projected) => {
      const state = get();
      const projection = state.projection;
      if (projection === null) return;
      // Seeded for the same reason as `syncProjection`, and this is the path a
      // create-and-connect takes: the completed Edit publishes, Authoring
      // selects the Resource it has just minted, and the projection carrying that
      // Resource arrives here.
      set({
        projection: {
          ...projection,
          nodes: withSelection(
            reconcile(projection.nodes, projected, state.dragOrigins),
            state.selection,
          ),
        },
      });
    },

    changeNodes: (changes) => {
      const state = get();
      const projection = state.projection;
      if (projection === null) return;

      // Drop changes aimed at nodes this store does not own. React Flow
      // measures anything it renders and reports a `dimensions` change for it,
      // and `applyNodeChanges` always returns a fresh array — so an unowned
      // node's change round-trips into a re-sync and re-measures forever.
      // Returning no update when nothing real changed keeps the array
      // reference stable and is what breaks that loop.
      // Keyed by React Flow id and answering the node's typed Resource identity:
      // the one lookup is both the ownership filter and the source of every
      // `ResourceId` a change below is read as. An embedded Map's nodes share
      // this React Flow instance under `embedded:` placement ids, which are
      // never keys here.
      const owned = new Map(
        projection.nodes.map((node) => [node.id, node.data.resourceId] as const),
      );
      // No resize clause here, deliberately. `NodeResizeControl` emits its
      // node-only `dimensions` change from the same callback `shouldResize`
      // gates, and the Resource answers `false` to every frame while still handing
      // the proposed rect on (`ResourceNode`), so that change is never produced and
      // this store never has a split frame to refuse. The draft is what makes
      // the resized Resource, its handles and its Edges one publication — and only
      // those: its neighbours are drawn from the authored placement and do not
      // move until the Edit lands (ADR 0084). `SpaceCanvas.test.tsx` drives the
      // real control and holds the whole gesture to proposing nothing here.
      const relevant = changes.filter((change) => !('id' in change) || owned.has(change.id));
      if (relevant.length === 0) return;

      const beforeById = new Map(projection.nodes.map((node) => [node.id, node.position]));
      const applied = applyNodeChanges(relevant, projection.nodes);
      // Additive, from the change stream rather than from the resulting array.
      // One React Flow selection produces two batches — the new subject
      // selected, then the other kind deselected — and reading the array would
      // let the second batch answer `none` for a Resource that was never the
      // subject. See `changeEdges` for the other half of the same rule.
      const selection = additiveSelection(
        state.selection,
        selectChanges(relevant).flatMap((change) => {
          const resourceId = owned.get(change.id);
          return resourceId === undefined
            ? []
            : [{ subject: { kind: 'resource', resourceId } as const, selected: change.selected }];
        }),
      );
      const nodes = withSelection(applied, selection);
      const positionChanges = relevant.filter(
        (change): change is NodePositionChange => change.type === 'position',
      );
      const dragOrigins = new Map(state.dragOrigins);
      trackDragOrigins(dragOrigins, positionChanges, beforeById);

      const settled = positionChanges.filter((change) => change.dragging === false);
      if (settled.length === 0) {
        set({ projection: { ...projection, nodes }, dragOrigins, selection });
        return;
      }

      // Only a settled drag compares its last position to the gesture origin.
      // Intermediate pointer frames publish above without paying for this map.
      const afterById = new Map(nodes.map((node) => [node.id, node.position]));
      const moved = consumeSettledMoves(settled, owned, dragOrigins, beforeById, afterById);

      if (moved.size === 0) {
        set({ projection: { ...projection, nodes }, dragOrigins, selection });
        return;
      }

      set({
        projection: { ...projection, nodes },
        dragOrigins,
        selection,
      });
      authoring.complete({ kind: 'settled-resource-movement', moved });
    },

    changeEdges: (changes) => {
      const state = get();
      const projection = state.projection;
      if (projection === null) return;
      const selections = selectChanges(changes);
      if (selections.length === 0) return;
      const selection = additiveSelection(
        state.selection,
        selections.flatMap((change) => {
          const drawn = projection.edges.find((edge) => edge.id === change.id);
          const subject = drawn === undefined ? null : edgeSelectionOf(drawn);
          // An Edge this projection does not draw. React Flow reports the
          // deselection of an Edge the previous projection held, and there is
          // no subject to compare — dropping it is what stops that stale
          // report clearing the selection the author has just made.
          return subject === null ? [] : [{ subject, selected: change.selected }];
        }),
      );
      if (sameSelection(selection, state.selection)) return;
      set({
        projection: { ...projection, nodes: withSelection(projection.nodes, selection) },
        selection,
      });
    },
  }));
  // A replacement Space arrives without unmounting anything, so the projection
  // this store is holding describes Resources that may no longer exist and drag
  // bookkeeping for a gesture made against the Space that is gone. Dropping it
  // is the same reset `selectMap` performs, for the same reason: what is on
  // screen no longer describes what is being rendered.
  //
  // The unsubscribe is deliberately dropped: this store's lifetime is the
  // composition's, and `authoring.dispose` clears the listener set that holds
  // this. Give the adapter its own teardown if it ever outlives one Authoring.
  let replacementEpoch = authoring.getState().replacementEpoch;
  authoring.subscribe(() => {
    const nextEpoch = authoring.getState().replacementEpoch;
    if (nextEpoch === replacementEpoch) return;
    replacementEpoch = nextEpoch;
    adapter.setState({
      projection: null,
      dragOrigins: new Map(),
      selection: NO_SELECTION,
      resizeDraft: null,
    });
  });
  return adapter;
}
