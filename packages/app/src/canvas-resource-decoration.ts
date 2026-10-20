import { takesOpen, type KindId, type ResourceId } from '@project/core';
import {
  isResourceNodeOf,
  type ResourceFlowNode,
  type ResourceFlowNodeOf,
  type ResourceNodeData,
} from '@project/react-flow-adapter';
import type { EntityActionGroup, KindOperationsByKind, ResourceDisplay } from '@project/ui';
import type { ResourceResize } from './render-adapter';
import { RESOURCE_SIZE } from './resource';

/** A value built by assigning what a gate allows. */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** What the shared decoration adds to a Resource of any kind. */
export type CanvasResourceDataPatch = Partial<
  Pick<
    ResourceNodeData,
    'onOpenChange' | 'onBeginTitleEditing' | 'resize' | 'titleEditor' | 'entityActions'
  >
>;

/**
 * What one kind's decoration supplies: that kind's operations whole, and the
 * display or context notice where it changes them.
 */
export interface KindDecoration<K extends ResourceFlowNode['data']['kind']> {
  readonly kindOperations: KindOperationsByKind[K];
  readonly display?: ResourceDisplay;
  readonly contextNotice?: string;
}

/**
 * Completions and canvas facts every kind's decoration may read. The hook owns
 * caret, session subscription, and the completion functions passed in here.
 * What one kind alone reads is declared in that kind's module under `kinds/`.
 */
export interface CanvasResourceDecorationContext {
  readonly authorOnCanvas: boolean;
  /** `AuthoringAvailability.resourceActions`: the rail may draw its Actions menu. */
  readonly resourceActions: boolean;
  readonly bodyEditing: boolean;
  readonly editableResourceIds: ReadonlySet<string>;
  readonly openResource: (resourceId: string) => 'completed' | 'retained';
  readonly closeResource: (resourceId: ResourceId) => 'completed' | 'retained';
  readonly beginTitleEditing: (resourceId: string) => void;
  readonly onSelectResource: (resourceId: ResourceId) => void;
  readonly resourceResize: ResourceResize;
  readonly editingTitleResourceId: string | null;
  readonly completeResourceTitle: (resourceId: string, title: string) => string | null;
  readonly clearCaret: () => void;
  readonly beginBodyEditing: (node: ResourceFlowNode) => void;
  readonly bodyEditorResourceId: string | null;
  readonly resourceEntityActions?:
    ((resourceId: ResourceId) => readonly EntityActionGroup[]) | undefined;
}

export function applyResourceDataPatch(
  node: ResourceFlowNode,
  patch: CanvasResourceDataPatch,
): ResourceFlowNode {
  if (Object.keys(patch).length === 0) return node;
  return { ...node, data: { ...node.data, ...patch } };
}

/**
 * `node` with its kind's decoration. A decoration that offers nothing beyond
 * the bare kind the projection already carries leaves the node as it is, so a
 * Resource whose operations did not change keeps its identity.
 */
export function applyKindDecoration<K extends ResourceFlowNode['data']['kind']>(
  node: ResourceFlowNodeOf<K>,
  decoration: KindDecoration<K>,
): ResourceFlowNodeOf<K> {
  const offersNothing =
    Object.keys(decoration.kindOperations).length === 1 &&
    decoration.display === undefined &&
    decoration.contextNotice === undefined;
  if (offersNothing) return node;
  return { ...node, data: { ...node.data, ...decoration } };
}

/**
 * How one kind decorates its Resources on the canvas, declared by that kind's
 * app half under `kinds/` and listed by the app registry: the part of the
 * whole decoration context it reads, and what it makes of one node from that
 * part alone.
 */
export interface KindCanvasDecoration<K extends KindId, Context extends object> {
  readonly kind: K;
  /**
   * This kind's part of `context`, field by field: a change to no field of it
   * keeps this kind's nodes. Every field is named, an optional one too, so a
   * field this kind reads cannot change without decorating its nodes again.
   */
  readonly slice: (context: Context) => EveryField<Context>;
  readonly decorate: (node: ResourceFlowNodeOf<K>, context: Context) => KindDecoration<K>;
}

/** `Context` with each of its fields present, an optional one holding `undefined` where it is absent. */
export type EveryField<Context> = { readonly [K in keyof Context]-?: Context[K] };

/** Every member of the union `Parts` at once. */
export type AllOf<Parts> = (Parts extends unknown ? (part: Parts) => void : never) extends (
  all: infer All,
) => void
  ? All
  : never;

/** The fields some member of the union `Parts` declares with a type another member's field of that name does not share. */
export type ClashingFields<Parts, All = AllOf<Parts>> = Parts extends unknown
  ? { [K in keyof Parts]-?: [Parts[K]] extends [All[K & keyof All]] ? never : K }[keyof Parts]
  : never;

/**
 * Every member of `Parts` at once, where each field the members share has one
 * type; otherwise an object no context satisfies, naming the clashing fields,
 * rather than one whose clashing field has silently become `never`.
 */
export type AgreeingAllOf<Parts> = [ClashingFields<Parts>] extends [never]
  ? AllOf<Parts>
  : { readonly fieldsDeclaredWithDifferentTypes: ClashingFields<Parts> };

/** One kind's decoration with its kind and context erased, as the registry's loop runs it. */
export interface KindDecorator<Context> {
  /** The decoration bound to this kind's part of `context`. */
  readonly bind: (context: Context) => {
    /** The values of the part read, in its order, compared one by one with those the kept nodes were decorated from. */
    readonly read: readonly unknown[];
    /** `node` decorated, or `undefined` for a node of another kind. */
    readonly decorate: (node: ResourceFlowNode) => ResourceFlowNode | undefined;
  };
}

/** Erase `decoration`'s kind and context, so every kind's runs through one loop. */
export const kindDecorator = <K extends KindId, Context extends object>(
  decoration: KindCanvasDecoration<K, Context>,
): KindDecorator<Context> => ({
  bind: (context) => {
    const slice = decoration.slice(context);
    return {
      read: Object.values(slice),
      decorate: (node) =>
        isResourceNodeOf(node, decoration.kind)
          ? applyKindDecoration(node, decoration.decorate(node, slice))
          : undefined,
    };
  },
});

/** Every kind's nodes decorated, kept with what each kind's were decorated from. */
export interface KindDecoratedNodes {
  readonly from: readonly ResourceFlowNode[];
  readonly byKind: readonly {
    readonly read: readonly unknown[];
    readonly decorated: ReadonlyMap<string, ResourceFlowNode>;
  }[];
  readonly nodes: ResourceFlowNode[];
}

/** Whether `a` and `b` hold the same values in the same order. */
const sameValues = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

/**
 * `nodes` with each kind's decoration, from `context`. A kind whose part of the
 * context is field for field what `kept` was decorated from, over the same
 * nodes, keeps its decorated nodes, so a change one kind alone reads keeps
 * every other kind's nodes, and their identities, as they were; and with no
 * kind's part changed, `kept` itself is answered.
 */
export function decorateKinds<Context>(
  decorators: readonly KindDecorator<Context>[],
  nodes: readonly ResourceFlowNode[],
  context: Context,
  kept: KindDecoratedNodes | undefined,
): KindDecoratedNodes {
  const keptNodes = kept?.from === nodes ? kept : undefined;
  const byKind = decorators.map((decorator, index) => {
    const bound = decorator.bind(context);
    const before = keptNodes?.byKind[index];
    if (before !== undefined && sameValues(before.read, bound.read)) return before;
    const decorated = new Map<string, ResourceFlowNode>();
    for (const node of nodes) {
      const next = bound.decorate(node);
      if (next !== undefined) decorated.set(node.id, next);
    }
    return { read: bound.read, decorated };
  });
  if (
    keptNodes !== undefined &&
    byKind.every((entry, index) => entry === keptNodes.byKind[index])
  ) {
    return keptNodes;
  }
  const decorated = new Map(byKind.flatMap(({ decorated: byId }) => [...byId]));
  return { from: nodes, byKind, nodes: nodes.map((node) => decorated.get(node.id) ?? node) };
}

/**
 * {@link decorateKinds} remembering its last answer: each call is decorated
 * against the one before, so a caller that runs it on every render keeps each
 * kind's nodes where nothing that kind reads changed. Only identity is
 * remembered; the nodes answered are what `decorateKinds` answers for the same
 * nodes and context.
 */
export function kindDecorationMemo<Context>(
  decorators: readonly KindDecorator<Context>[],
): (nodes: readonly ResourceFlowNode[], context: Context) => ResourceFlowNode[] {
  let kept: KindDecoratedNodes | undefined;
  return (nodes, context) => {
    kept = decorateKinds(decorators, nodes, context, kept);
    return kept.nodes;
  };
}

type SharedResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  | 'authorOnCanvas'
  | 'resourceActions'
  | 'bodyEditing'
  | 'bodyEditorResourceId'
  | 'editableResourceIds'
  | 'openResource'
  | 'closeResource'
  | 'beginTitleEditing'
  | 'onSelectResource'
  | 'resourceResize'
  | 'editingTitleResourceId'
  | 'completeResourceTitle'
  | 'clearCaret'
  | 'resourceEntityActions'
>;

export function decorateSharedResourceNode(
  node: ResourceFlowNode,
  context: SharedResourceDecorationContext,
): CanvasResourceDataPatch {
  const resourceBelongsToWorkingSpace = context.editableResourceIds.has(node.data.resourceId);
  const patch: Mutable<
    Pick<
      ResourceNodeData,
      'onOpenChange' | 'onBeginTitleEditing' | 'resize' | 'titleEditor' | 'entityActions'
    >
  > = {};
  if (resourceBelongsToWorkingSpace && context.authorOnCanvas && takesOpen(node.data.kind)) {
    // A kind that declares no Open offers no Open or Close.
    patch.onOpenChange = (open) =>
      open ? context.openResource(node.id) : context.closeResource(node.data.resourceId);
  } else if (resourceBelongsToWorkingSpace && node.id === context.bodyEditorResourceId) {
    // A live content editor keeps its Close drawn when the canvas withdraws
    // authoring — a running image replacement withdraws it — so the control
    // stays in its slot, unavailable, instead of vanishing and returning.
    // `CanvasResource` draws it disabled while the edit runs; withdrawn, it
    // also retains rather than running an Open or Close Edit.
    patch.onOpenChange = () => 'retained';
  }
  if (resourceBelongsToWorkingSpace && context.authorOnCanvas && !context.bodyEditing) {
    patch.onBeginTitleEditing = () => context.beginTitleEditing(node.id);
  }
  if (resourceBelongsToWorkingSpace && context.authorOnCanvas) {
    // Every kind resizes, Open or Closed (ADR 0122); `ResourceNode` draws the
    // control only while the Resource is selected. The Closed Size is the one
    // floor, and the control's own minimum keeps a proposal at or above it.
    patch.resize = {
      minWidth: RESOURCE_SIZE.width,
      minHeight: RESOURCE_SIZE.height,
      onResizeStart: () => {
        context.onSelectResource(node.data.resourceId);
        context.resourceResize.beginResize(node.data.resourceId);
      },
      onResize: (size) => {
        context.resourceResize.previewResize(node.data.resourceId, {
          width: Math.max(RESOURCE_SIZE.width, size.width),
          height: Math.max(RESOURCE_SIZE.height, size.height),
        });
      },
      onResizeEnd: () => context.resourceResize.finishResize(node.data.resourceId),
      onResizeCancel: () => context.resourceResize.cancelResize(node.data.resourceId),
    };
  }
  if (
    resourceBelongsToWorkingSpace &&
    context.authorOnCanvas &&
    node.id === context.editingTitleResourceId
  ) {
    patch.titleEditor = {
      onComplete: (title) => {
        const error = context.completeResourceTitle(node.id, title);
        if (error === null) context.clearCaret();
        return error;
      },
      onCancel: () => context.clearCaret(),
    };
  }
  if (context.resourceEntityActions !== undefined && resourceBelongsToWorkingSpace) {
    // The gate every other control on the rail takes, `authorOnCanvas`, except
    // in a mounted session, which withholds every Edit and keeps this menu for
    // its addresses and a Space Resource's Enter — each Edit in it answers to
    // its own availability. Otherwise a canvas that has withdrawn authoring
    // would reinstate the one cluster that survived it. Withdrawn is `[]`,
    // never `undefined`: `CanvasResource` keeps its `EntityActions` wrapper
    // mounted for any defined list, so withdrawing authoring does not remount
    // the Resource and lose a running replacement's target. Held by
    // `canvas-resource-decoration.test.ts` ('asks for entity actions only where
    // authoring is on…') and `CanvasResource.test.tsx` ('keeps a pending
    // replacement mounted when its entity actions become unavailable').
    patch.entityActions = context.resourceActions
      ? context.resourceEntityActions(node.data.resourceId)
      : [];
  }
  return patch;
}
