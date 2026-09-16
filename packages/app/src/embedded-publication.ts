import type { ThingId } from '@project/core';
import type { Edge, NodeChange } from '@xyflow/react';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import type { EmbeddedPublicationSnapshot } from './embedded-open-space-thing';
import type { OpenSpace } from './open-spaces';

/**
 * The live publication an embedding writes: the discovery snapshot plus the
 * authoring operations the host canvas spends.
 */
export interface EmbeddedPublication extends EmbeddedPublicationSnapshot {
  readonly entry: OpenSpace;
  readonly bodyEditing: boolean;
  readonly titleEditing: boolean;
  readonly origin: { readonly x: number; readonly y: number };
  readonly edges: readonly Edge[];
  readonly changeNodes: (changes: NodeChange<ThingFlowNode>[]) => void;
  readonly removeThing: (id: string) => string | null;
  readonly mayConnectThings: (from: ThingId, to: ThingId) => boolean;
  readonly connectThings: (from: ThingId, to: ThingId) => boolean;
}
