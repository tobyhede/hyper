import type { ResourceId } from '@project/core';
import type { Edge, NodeChange } from '@xyflow/react';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import type { EmbeddedPublicationSnapshot } from './embedded-open-space-resource';
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
  readonly changeNodes: (changes: NodeChange<ResourceFlowNode>[]) => void;
  readonly removeResource: (id: string) => string | null;
  readonly mayConnectResources: (from: ResourceId, to: ResourceId) => boolean;
  readonly connectResources: (from: ResourceId, to: ResourceId) => boolean;
}
