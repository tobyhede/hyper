import type { UUID } from '@project/core';
import type {
  DeleteReferencedMapInput,
  DeleteReferencedGraphInput,
  SpaceResourceContextDeletionResult,
} from '@project/persistence';
import { describeSpaceResourceRefusal } from './authoring-refusal';

/**
 * Why a coordinated context command did not run: a Space in the Edit had not
 * settled. The sentence is the one Space Resource commands used; delete and create
 * tests pin it (`coordinated-context-delete.test.ts`,
 * `coordinated-context-create.test.ts`).
 */
export const PERSISTENCE_UNSETTLED =
  'The change could not be saved. Check the Space persistence status.';

export type CoordinatedContextDeleteResult =
  | { readonly kind: 'completed'; readonly mapId: UUID; readonly graphId: UUID }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'unchanged' };

/**
 * The boolean an entity-menu Delete reads: false only when the author should
 * see a failure. Lifecycle `unchanged` is a no-op, not a refusal
 * (`coordinated-context-delete.test.ts` — "does not report unchanged as a menu
 * failure").
 */
export const coordinatedDeleteOk = (result: CoordinatedContextDeleteResult): boolean =>
  result.kind !== 'error';

const run = async (
  del: () => Promise<SpaceResourceContextDeletionResult>,
  waitBefore: (() => Promise<boolean>) | undefined,
): Promise<CoordinatedContextDeleteResult> => {
  if (waitBefore !== undefined && !(await waitBefore())) {
    return { kind: 'error', message: PERSISTENCE_UNSETTLED };
  }
  const result = await del();
  if (result.kind === 'refused') {
    return { kind: 'error', message: describeSpaceResourceRefusal(result.refusal) };
  }
  if (result.kind === 'completed') {
    return {
      kind: 'completed',
      mapId: result.mapId,
      graphId: result.graphId,
    };
  }
  return { kind: 'unchanged' };
};

/** Coordinated Map deletion: gate, lifecycle, mapped refusal. Callers own follow-up. */
export const coordinatedMapDelete = (
  deleteMap: (input: DeleteReferencedMapInput) => Promise<SpaceResourceContextDeletionResult>,
  input: DeleteReferencedMapInput,
  waitBefore?: () => Promise<boolean>,
): Promise<CoordinatedContextDeleteResult> => run(() => deleteMap(input), waitBefore);

/** Coordinated Graph deletion: gate, lifecycle, mapped refusal. Callers own follow-up. */
export const coordinatedGraphDelete = (
  deleteGraph: (input: DeleteReferencedGraphInput) => Promise<SpaceResourceContextDeletionResult>,
  input: DeleteReferencedGraphInput,
  waitBefore?: () => Promise<boolean>,
): Promise<CoordinatedContextDeleteResult> => run(() => deleteGraph(input), waitBefore);
