import type { GraphId, UUID } from '@project/core';
import { describeAuthoringRefusal } from './authoring-refusal';
import { PERSISTENCE_UNSETTLED } from './authoring-commands';
import type { AuthoringResult } from './space-authoring';

/** The identities a completed creation leaves for the call site. */
export interface CreatedContext {
  readonly created: { readonly id: UUID };
  readonly active: GraphId;
}

/**
 * Graph creation on an Open Space Resource rail — the one caller since Map
 * creation moved behind `map-authoring-commands.ts`.
 *
 * Settled → create → persist → hook. Call sites own selection writes and
 * rename continuation; this module does not import continuation targets
 * (an `eslint.config.js` `no-restricted-imports` zone holds it).
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
