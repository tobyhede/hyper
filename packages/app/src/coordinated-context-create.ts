import type { Map, GraphId, UUID } from '@project/core';
import { describeAuthoringRefusal } from './authoring-refusal';
import { PERSISTENCE_UNSETTLED } from './coordinated-context-delete';
import type { AuthoringResult } from './space-authoring';

/** The identities a completed New Map leaves for the call site. */
export interface CreatedContext {
  readonly created: { readonly id: UUID };
  readonly active: GraphId;
}

export const createdMapContext = (
  maps: readonly Map[],
  selectedMapId: UUID | null,
): CreatedContext | undefined => {
  const created = maps.find((each) => each.id === selectedMapId);
  const active = created?.activeGraph ?? created?.graphs[0]?.id;
  return created !== undefined && active !== undefined ? { created, active } : undefined;
};

/**
 * Settled → create → persist → hook. Call sites own selection writes and
 * rename continuation; this module does not import continuation targets
 * (`coordinated-context-create.test.ts` — "does not import continuation targets").
 */
export interface CoordinatedContextCreateRequest {
  readonly waitBefore?: () => Promise<boolean>;
  readonly create: () => AuthoringResult;
  readonly waitUntilPersisted?: () => Promise<boolean>;
  readonly createdOf: (
    result: Extract<AuthoringResult, { kind: 'completed' }>,
  ) => CreatedContext | undefined;
  readonly afterCreated: (
    created: CreatedContext['created'],
    active: GraphId,
  ) => Promise<string | null> | string | null;
}

export const coordinatedContextCreate = async ({
  waitBefore,
  create,
  waitUntilPersisted,
  createdOf,
  afterCreated,
}: CoordinatedContextCreateRequest): Promise<string | null> => {
  if (waitBefore !== undefined && !(await waitBefore())) return PERSISTENCE_UNSETTLED;
  const result = create();
  if (result.kind !== 'completed') {
    return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
  }
  const identities = createdOf(result);
  if (waitUntilPersisted !== undefined && !(await waitUntilPersisted())) {
    return PERSISTENCE_UNSETTLED;
  }
  if (identities === undefined) return null;
  return afterCreated(identities.created, identities.active);
};
