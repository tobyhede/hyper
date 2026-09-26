import type { UUID } from '@project/core';
import type {
  DeleteReferencedGraphInput,
  SpaceResourceContextDeletionResult,
} from '@project/persistence';
import { PERSISTENCE_UNSETTLED } from './authoring-commands';
import { describeSpaceResourceRefusal } from './authoring-refusal';

export type CoordinatedContextDeleteResult =
  | { readonly kind: 'completed'; readonly mapId: UUID; readonly graphId: UUID }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'unchanged' };

/** Coordinated Graph deletion: gate, lifecycle, mapped refusal. Callers own follow-up. */
export const coordinatedGraphDelete = async (
  deleteGraph: (input: DeleteReferencedGraphInput) => Promise<SpaceResourceContextDeletionResult>,
  input: DeleteReferencedGraphInput,
  waitBefore?: () => Promise<boolean>,
): Promise<CoordinatedContextDeleteResult> => {
  if (waitBefore !== undefined && !(await waitBefore())) {
    return { kind: 'error', message: PERSISTENCE_UNSETTLED };
  }
  const result = await deleteGraph(input);
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
